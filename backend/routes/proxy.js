// routes/proxy.js
// GET /proxy/stream/:channelId — resolve Stalker stream URL, proxy master m3u8
// GET /proxy/hls?url=<encoded> — proxy HLS sub-playlists and segments
//
// All URLs inside proxied playlists are rewritten to go through /proxy/hls so
// Jellyfin (or any HLS client) never contacts the Stalker portal directly.
// The authenticated axios instance from StalkerClient carries the session
// cookies (PHPSESSID, mac, token, etc.) on every outbound request.

'use strict';

const express = require('express');

// ── URL helpers ───────────────────────────────────────────────────────────────

function encodeProxyUrl(url) {
  return Buffer.from(url, 'utf8').toString('base64url');
}

function decodeProxyUrl(encoded) {
  return Buffer.from(encoded, 'base64url').toString('utf8');
}

function resolveUrl(href, base) {
  if (/^https?:\/\//i.test(href)) return href;
  try { return new URL(href, base).toString(); } catch { return href; }
}

// Rewrite every URL in an m3u8 body so it routes through /proxy/hls.
// Handles:
//   - bare URL lines (segments, sub-playlists)
//   - URI="..." attributes (#EXT-X-KEY, #EXT-X-MAP, #EXT-X-MEDIA, etc.)
function rewriteM3u8(body, playlistUrl, proxyOrigin) {
  return body
    .split('\n')
    .map(line => {
      const trimmed = line.trim();

      // Blank line — pass through
      if (!trimmed) return line;

      // Tag line — rewrite any URI="..." attributes
      if (trimmed.startsWith('#')) {
        return line.replace(/URI="([^"]+)"/gi, (_, uri) => {
          const abs = resolveUrl(uri, playlistUrl);
          return `URI="${proxyOrigin}/proxy/hls?url=${encodeProxyUrl(abs)}"`;
        });
      }

      // URL line (segment or sub-playlist)
      const abs = resolveUrl(trimmed, playlistUrl);
      return `${proxyOrigin}/proxy/hls?url=${encodeProxyUrl(abs)}`;
    })
    .join('\n');
}

function isM3u8Body(text) {
  const head = text.slice(0, 32);
  return head.includes('#EXTM3U') || head.includes('#EXT-X-');
}

// ── Shared fetch helper ───────────────────────────────────────────────────────

async function fetchFromPortal(http, headers, url, timeoutMs = 15_000) {
  return http.get(url, {
    headers,
    responseType: 'arraybuffer',
    timeout: timeoutMs,
    validateStatus: () => true,
  });
}

// ── Route factory ─────────────────────────────────────────────────────────────

module.exports = function proxyModule(appState) {
  const router = express.Router();

  function requireSession(res) {
    if (!appState.client || !appState.channelManager) {
      res.status(503).send('Not connected to portal');
      return false;
    }
    return true;
  }

  async function resolveStreamUrl(channel) {
    const { client, channelManager } = appState;
    if (channel.cmd.includes('matrix')) {
      const raw = await client.resolveMatrixUrl(channel.cmd);
      const sp = (raw || '').indexOf(' ');
      return sp !== -1 ? raw.slice(sp + 1) : raw;
    }
    return channelManager.getStreamUrl(channel);
  }

  // ── GET /proxy/stream/:channelId ──────────────────────────────────────────
  router.get('/stream/:channelId', async (req, res) => {
    if (!requireSession(res)) return;

    const { client, channelManager } = appState;
    const uniqueId = parseInt(req.params.channelId, 10);

    const channel = channelManager.getChannel(uniqueId);
    if (!channel) return res.status(404).send('Channel not found');

    let streamUrl;
    try {
      streamUrl = await resolveStreamUrl(channel);
    } catch (e) {
      console.error('[proxy] stream resolution failed:', e.message);
      return res.status(502).send(`Stream resolution failed: ${e.message}`);
    }

    if (!streamUrl) return res.status(502).send('Could not resolve stream URL');

    console.log(`[proxy] proxying master playlist for ch ${channel.number}: ${streamUrl}`);

    const http = client.getHttpClient();
    const headers = client.getStreamHeaders();
    let response;
    try {
      response = await fetchFromPortal(http, headers, streamUrl);
    } catch (e) {
      console.error('[proxy] master playlist fetch failed:', e.message);
      return res.status(502).send(`Fetch failed: ${e.message}`);
    }

    if (response.status >= 400) {
      console.error(`[proxy] portal returned ${response.status} for master playlist`);
      return res.status(502).send(`Portal returned HTTP ${response.status}`);
    }

    const body = Buffer.from(response.data).toString('utf8');
    const proxyOrigin = `${req.protocol}://${req.get('host')}`;
    const rewritten = rewriteM3u8(body, streamUrl, proxyOrigin);

    res.set('Content-Type', 'application/vnd.apple.mpegurl');
    res.set('Cache-Control', 'no-cache, no-store');
    res.set('Access-Control-Allow-Origin', '*');
    res.send(rewritten);
  });

  // ── GET /proxy/hls?url=<base64url-encoded> ────────────────────────────────
  router.get('/hls', async (req, res) => {
    if (!requireSession(res)) return;

    const encoded = req.query.url;
    if (!encoded) return res.status(400).send('Missing url parameter');

    let realUrl;
    try {
      realUrl = decodeProxyUrl(encoded);
    } catch {
      return res.status(400).send('Invalid url encoding');
    }

    const { client, channelManager } = appState;
    const http = client.getHttpClient();
    const headers = client.getStreamHeaders();

    let response;
    try {
      response = await fetchFromPortal(http, headers, realUrl);
    } catch (e) {
      console.error('[proxy] hls fetch failed:', e.message);
      return res.status(502).send(`Fetch failed: ${e.message}`);
    }

    // 403 from portal usually means the stream URL expired.
    // Return 502 so Jellyfin retries via /proxy/stream/:channelId.
    if (response.status === 403 || response.status === 404) {
      console.warn(`[proxy] portal returned ${response.status} — stream URL may have expired`);
      return res.status(502).send(`Portal returned HTTP ${response.status}`);
    }

    if (response.status >= 400) {
      return res.status(502).send(`Portal returned HTTP ${response.status}`);
    }

    const buf = Buffer.from(response.data);
    const bodyText = buf.toString('utf8', 0, 64);

    if (isM3u8Body(bodyText)) {
      const fullText = buf.toString('utf8');
      const proxyOrigin = `${req.protocol}://${req.get('host')}`;
      const rewritten = rewriteM3u8(fullText, realUrl, proxyOrigin);
      res.set('Content-Type', 'application/vnd.apple.mpegurl');
      res.set('Cache-Control', 'no-cache, no-store');
      res.set('Access-Control-Allow-Origin', '*');
      return res.send(rewritten);
    }

    // Binary segment (.ts / fmp4)
    const ct = response.headers['content-type'] || 'video/MP2T';
    res.set('Content-Type', ct);
    res.set('Access-Control-Allow-Origin', '*');
    res.send(buf);
  });

  return router;
};
