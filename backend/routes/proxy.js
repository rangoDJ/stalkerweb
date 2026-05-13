// routes/proxy.js
// GET /proxy/stream/:channelId    — resolve Stalker stream URL, proxy master m3u8
// GET /proxy/hls?url=<encoded>    — proxy HLS sub-playlists (playlist URLs)
// GET /proxy/hls/seg/:encoded.ts  — proxy HLS segments (.ts extension satisfies
//                                   FFmpeg's allowed_segment_extensions whitelist)
//
// FFmpeg's HLS demuxer rejects segment URLs that don't end in a known extension
// (.ts, .aac, .m4s, etc.). Sub-playlist URLs are not subject to this check.
// So rewriteM3u8() uses two different proxy URL formats:
//   sub-playlists → /proxy/hls?url=<encoded>          (query-string, no ext)
//   segments      → /proxy/hls/seg/<encoded>.ts        (path + .ts ext)

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

// Returns true if the URL path (before ?) ends with a playlist extension.
function isPlaylistUrl(url) {
  const path = url.split('?')[0].split('#')[0];
  return /\.(m3u8?|m3u)$/i.test(path);
}

// Rewrite every URL in an m3u8 body to route through the proxy.
//
// Sub-playlists  → /proxy/hls?url=<encoded>       (FFmpeg does not apply the
//                                                   segment extension check here)
// Segments       → /proxy/hls/seg/<encoded>.ts     (passes FFmpeg's whitelist)
// URI="" attrs   → /proxy/hls?url=<encoded>        (keys, maps — not segments)
function rewriteM3u8(body, playlistUrl, proxyOrigin) {
  return body
    .split('\n')
    .map(line => {
      const trimmed = line.trim();

      if (!trimmed) return line;

      // Tag line — rewrite URI="..." attributes (EXT-X-KEY, EXT-X-MAP, etc.)
      if (trimmed.startsWith('#')) {
        return line.replace(/URI="([^"]+)"/gi, (_, uri) => {
          const abs = resolveUrl(uri, playlistUrl);
          return `URI="${proxyOrigin}/proxy/hls?url=${encodeProxyUrl(abs)}"`;
        });
      }

      // URL line — choose format based on whether it's a playlist or segment
      const abs = resolveUrl(trimmed, playlistUrl);
      if (isPlaylistUrl(abs)) {
        return `${proxyOrigin}/proxy/hls?url=${encodeProxyUrl(abs)}`;
      }
      return `${proxyOrigin}/proxy/hls/seg/${encodeProxyUrl(abs)}.ts`;
    })
    .join('\n');
}

function isM3u8Body(text) {
  return text.includes('#EXTM3U') || text.includes('#EXT-X-');
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

  async function servePlaylist(req, res, realUrl) {
    const { client } = appState;
    const http = client.getHttpClient();
    const headers = client.getStreamHeaders();

    let response;
    try {
      response = await fetchFromPortal(http, headers, realUrl);
    } catch (e) {
      console.error('[proxy] playlist fetch failed:', e.message);
      return res.status(502).send(`Fetch failed: ${e.message}`);
    }

    if (response.status === 403 || response.status === 404) {
      console.warn(`[proxy] portal returned ${response.status} on playlist — URL may have expired`);
      return res.status(502).send(`Portal returned HTTP ${response.status}`);
    }
    if (response.status >= 400) {
      return res.status(502).send(`Portal returned HTTP ${response.status}`);
    }

    const body = Buffer.from(response.data).toString('utf8');
    const proxyOrigin = `${req.protocol}://${req.get('host')}`;
    const rewritten = rewriteM3u8(body, realUrl, proxyOrigin);

    res.set('Content-Type', 'application/vnd.apple.mpegurl');
    res.set('Cache-Control', 'no-cache, no-store');
    res.set('Access-Control-Allow-Origin', '*');
    res.send(rewritten);
  }

  // ── GET /proxy/stream/:channelId ──────────────────────────────────────────
  router.get('/stream/:channelId', async (req, res) => {
    if (!requireSession(res)) return;

    const { channelManager } = appState;
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

    console.log(`[proxy] master playlist for ch ${channel.number}: ${streamUrl}`);
    return servePlaylist(req, res, streamUrl);
  });

  // ── GET /proxy/hls?url=<encoded> — sub-playlist proxy ────────────────────
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

    return servePlaylist(req, res, realUrl);
  });

  // ── GET /proxy/hls/seg/:encoded.ts — segment proxy ───────────────────────
  // The .ts suffix is part of the :encoded param value; strip it before decoding.
  // FFmpeg requires a known extension on segment URLs — .ts satisfies the check
  // regardless of the actual container (FFmpeg detects format from content bytes).
  router.get('/hls/seg/:encoded', async (req, res) => {
    if (!requireSession(res)) return;

    // Strip the .ts (or any other) extension we appended for FFmpeg compatibility
    let encoded = req.params.encoded.replace(/\.[^.]+$/, '');

    let realUrl;
    try {
      realUrl = decodeProxyUrl(encoded);
    } catch {
      return res.status(400).send('Invalid url encoding');
    }

    const { client } = appState;
    const http = client.getHttpClient();
    const headers = client.getStreamHeaders();

    let response;
    try {
      response = await fetchFromPortal(http, headers, realUrl);
    } catch (e) {
      console.error('[proxy] segment fetch failed:', e.message);
      return res.status(502).send(`Fetch failed: ${e.message}`);
    }

    if (response.status === 403 || response.status === 404) {
      console.warn(`[proxy] portal returned ${response.status} on segment — stream may have expired`);
      return res.status(502).send(`Portal returned HTTP ${response.status}`);
    }
    if (response.status >= 400) {
      return res.status(502).send(`Portal returned HTTP ${response.status}`);
    }

    // Check if portal unexpectedly returned a playlist instead of a segment
    const buf = Buffer.from(response.data);
    const head = buf.toString('utf8', 0, 64);
    if (isM3u8Body(head)) {
      const proxyOrigin = `${req.protocol}://${req.get('host')}`;
      const rewritten = rewriteM3u8(buf.toString('utf8'), realUrl, proxyOrigin);
      res.set('Content-Type', 'application/vnd.apple.mpegurl');
      res.set('Cache-Control', 'no-cache, no-store');
      res.set('Access-Control-Allow-Origin', '*');
      return res.send(rewritten);
    }

    const ct = response.headers['content-type'] || 'video/MP2T';
    res.set('Content-Type', ct);
    res.set('Access-Control-Allow-Origin', '*');
    res.send(buf);
  });

  return router;
};
