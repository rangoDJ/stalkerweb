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
const log = require('../logger');
const { channelIdRules, hlsUrlRules } = require('../middleware/validate');
const TAG = 'proxy';

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

// Exported for unit tests
module.exports.helpers = { encodeProxyUrl, decodeProxyUrl, rewriteM3u8, isPlaylistUrl, resolveUrl, isM3u8Body, fetchFromPortal }

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

  function isAllowedUrl(url, allowedOrigin) {
    if (!allowedOrigin) return true
    try {
      const u = new URL(url)
      const a = new URL(allowedOrigin)
      return u.hostname === a.hostname || u.hostname.endsWith('.' + a.hostname)
    } catch {
      return false
    }
  }

  function getHeadersForUrl(realUrl) {
    const { client } = appState;
    if (!client) return {};
    const basePath = client.getBasePath();
    const isInternal = realUrl.startsWith(basePath) || isAllowedUrl(realUrl, basePath);

    if (isInternal) {
      const headers = { ...client._buildHeaders() };
      delete headers['X-Requested-With'];
      delete headers['Accept'];
      return headers;
    } else {
      return { ...client.getStreamHeaders() };
    }
  }

  // trusted=true skips the SSRF hostname check — use when realUrl came from
  // the portal's own create_link / stream-resolution API (not user-supplied).
  async function servePlaylist(req, res, realUrl, trusted = false) {
    const { client } = appState;
    const http = client.getHttpClient();
    const headers = getHeadersForUrl(realUrl);

    const setCors = () => res.set('Access-Control-Allow-Origin', '*');

    if (!trusted && !isAllowedUrl(realUrl, appState.client?.getBasePath())) {
      log.warn(TAG, `blocked SSRF attempt to ${realUrl}`);
      setCors();
      return res.status(403).send('Forbidden');
    }

    let response;
    try {
      response = await fetchFromPortal(http, headers, realUrl);
    } catch (e) {
      log.error(TAG, `playlist fetch failed: ${e.message}`);
      setCors();
      return res.status(502).send(`Fetch failed: ${e.message}`);
    }

    if (response.status === 403 || response.status === 404) {
      log.warn(TAG, `portal returned ${response.status} on playlist — URL may have expired`);
      setCors();
      return res.status(502).send(`Portal returned HTTP ${response.status}`);
    }
    if (response.status >= 400) {
      setCors();
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

  // ── GET /proxy/vod/stream?videoId=X&cmd=<encoded>&series=0 ───────────────
  // Resolves a VOD stream URL via VodManager (auth + all fallbacks), then
  // either proxies an HLS playlist (rewriting sub-URLs) or pipes a direct
  // video stream with Range-request pass-through for seeking.
  router.get('/vod/stream*', async (req, res) => {
    // Fix: use requireSession (not just !client) so channelManager is also checked,
    // and unauthenticated requests are rejected consistently with other proxy routes.
    if (!requireSession(res)) return;

    const { vodManager, client } = appState;  // snapshot before any await to avoid race
    if (!vodManager) return res.status(503).send('VOD not available');

    appState.attachStreamHeartbeat?.(req, res);   // keep idle timer alive for the whole pipe

    const { videoId, series = '0' } = req.query;
    const cmd = req.query.cmd || '';
    if (!videoId) return res.status(400).send('videoId is required');

    let streamUrl;
    try {
      streamUrl = await vodManager.getStreamUrl(videoId, cmd || null, parseInt(series, 10) || 0);
    } catch (e) {
      log.error(TAG, `VOD proxy: stream resolution failed: ${e.message}`);
      return res.status(502).send(`Stream resolution failed: ${e.message}`);
    }

    // Fix: guard against null/undefined return (prevents TypeError on .slice below)
    if (!streamUrl) {
      log.error(TAG, `VOD proxy: videoId=${videoId} — resolution returned empty URL`);
      return res.status(502).send('Could not resolve stream URL');
    }

    log.info(TAG, `VOD proxy: videoId=${videoId} → ${streamUrl.slice(0, 80)}…`);

    // HLS playlist URL (extension-based fast path) — servePlaylist handles buffering + rewrite
    // trusted=true: URL came from portal's own getStreamUrl(), not user-supplied
    if (isPlaylistUrl(streamUrl)) {
      return servePlaylist(req, res, streamUrl, true);
    }

    // Determine if the URL is served directly by the portal (internal) or by an external CDN.
    // Internal links require the portal's session cookies and STB headers to access,
    // so we must proxy them. External CDN links can be redirected directly.
    const basePath = client.getBasePath();
    const isInternal = streamUrl.startsWith(basePath) || isAllowedUrl(streamUrl, basePath);

    if (isInternal) {
      log.info(TAG, `VOD proxy: internal link detected, proxying stream: ${streamUrl}`);
      const http          = client.getHttpClient();
      const streamHeaders = getHeadersForUrl(streamUrl);
      if (req.headers['range']) streamHeaders['Range'] = req.headers['range'];

      let response;
      try {
        response = await http.get(streamUrl, {
          headers:        streamHeaders,
          responseType:   'stream',
          timeout:        30_000,
          validateStatus: () => true,
        });
      } catch (e) {
        log.error(TAG, `VOD proxy: fetch failed: ${e.message}`);
        return res.status(502).send(`Fetch failed: ${e.message}`);
      }

      if (response.status >= 400) {
        response.data.destroy();
        log.warn(TAG, `VOD proxy: portal returned ${response.status} for ${streamUrl}`);
        return res.status(502).send(`Portal returned HTTP ${response.status}`);
      }

      // Collect the first 512 bytes synchronously (before any await) to sniff for m3u8
      const SNIFF = 512;
      const firstChunk = await new Promise((resolve, reject) => {
        const chunks = [];
        let size = 0;
        const stream = response.data;
        const done = (buf) => {
          stream.off('data', onData); stream.off('end', onEnd); stream.off('error', onError);
          resolve(buf);
        };
        const onData  = (chunk) => { chunks.push(chunk); size += chunk.length; if (size >= SNIFF) { stream.pause(); done(Buffer.concat(chunks)); } };
        const onEnd   = () => done(Buffer.concat(chunks));
        const onError = (e) => reject(e);
        stream.on('data', onData).once('end', onEnd).once('error', onError);
      });

      const head = firstChunk.toString('utf8', 0, 128);

      if (isM3u8Body(head)) {
        // Portal served an HLS playlist — buffer the rest (playlists are tiny text files)
        log.info(TAG, `VOD proxy: videoId=${videoId} → m3u8 body detected, buffering for URL rewrite`);
        const allChunks = [firstChunk];
        response.data.resume();
        await new Promise((resolve, reject) => {
          response.data.on('data', c => allChunks.push(c));
          response.data.on('end', resolve);
          response.data.on('error', reject);
        });
        const proxyOrigin = `${req.protocol}://${req.get('host')}`;
        const rewritten   = rewriteM3u8(Buffer.concat(allChunks).toString('utf8'), streamUrl, proxyOrigin);
        res.set('Content-Type', 'application/vnd.apple.mpegurl');
        res.set('Cache-Control', 'no-cache, no-store');
        res.set('Access-Control-Allow-Origin', '*');
        return res.send(rewritten);
      }

      // Binary video — pipe directly so large files (MP4, MPEG) never land in Node heap.
      const ct = response.headers['content-type'] || 'video/mpeg';
      log.info(TAG, `VOD proxy: videoId=${videoId} → piping binary ${ct}`);
      res.status(response.status);
      res.set('Content-Type', ct);
      res.set('Access-Control-Allow-Origin', '*');
      if (response.headers['content-range'])  res.set('Content-Range', response.headers['content-range']);
      if (response.headers['content-length']) res.set('Content-Length', response.headers['content-length']);
      res.write(firstChunk);
      response.data.resume();
      response.data.on('error', err => { log.error(TAG, `VOD proxy: pipe error: ${err.message}`); res.destroy(); });
      response.data.pipe(res);
    } else {
      // For non-playlist external binary video URLs, redirect directly to the CDN stream URL.
      log.info(TAG, `VOD proxy: redirecting to external CDN stream URL: ${streamUrl}`);
      return res.redirect(302, streamUrl);
    }
  });

  // ── GET /proxy/stream/:channelId ──────────────────────────────────────────
  router.get('/stream/:channelId', channelIdRules, async (req, res) => {
    if (!requireSession(res)) return;
    appState.attachStreamHeartbeat?.(req, res);   // covers both finite playlists and single long-lived pipes

    const { channelManager } = appState;
    const uniqueId = req.params.channelId;

    const channel = await channelManager.waitForChannel(uniqueId);
    if (!channel) return res.status(404).send('Channel not found');

    let streamUrl;
    try {
      // Catch-up support: if ?startTime= is provided, modify the cmd to request archive stream
      if (req.query.startTime) {
        log.info(TAG, `catch-up request for ch ${channel.number}: startTime=${req.query.startTime}`);
        const archiveChannel = { ...channel, cmd: `${channel.cmd} archive=1 start=${req.query.startTime}` };
        streamUrl = await resolveStreamUrl(archiveChannel);
      } else {
        streamUrl = await resolveStreamUrl(channel);
      }
    } catch (e) {
      log.error(TAG, `stream resolution failed: ${e.message}`);
      channelManager.recordStreamError(uniqueId);
      return res.status(502).send(`Stream resolution failed: ${e.message}`);
    }

    if (!streamUrl) {
      channelManager.recordStreamError(uniqueId);
      return res.status(502).send('Could not resolve stream URL');
    }

    channelManager.recordStreamSuccess(uniqueId);
    log.info(TAG, `master playlist for ch ${channel.number}: ${streamUrl}`);
    return servePlaylist(req, res, streamUrl, true); // trusted — URL from portal create_link
  });

  // ── GET /proxy/hls?url=<encoded> — sub-playlist proxy ────────────────────
  router.get('/hls', hlsUrlRules, async (req, res) => {
    if (!requireSession(res)) return;
    appState.attachStreamHeartbeat?.(req, res);

    const encoded = req.query.url;
    if (!encoded) return res.status(400).send('Missing url parameter');

    let realUrl;
    try {
      realUrl = decodeProxyUrl(encoded);
    } catch {
      return res.status(400).send('Invalid url encoding');
    }

    // trusted=true: URL was embedded in an m3u8 we already proxied and rewrote.
    // Portals deliver streams via CDNs whose hostnames differ from the portal.
    return servePlaylist(req, res, realUrl, true);
  });

  // ── GET /proxy/hls/seg/:encoded.ts — segment proxy ───────────────────────
  // The .ts suffix is part of the :encoded param value; strip it before decoding.
  // FFmpeg requires a known extension on segment URLs — .ts satisfies the check
  // regardless of the actual container (FFmpeg detects format from content bytes).
  router.get('/hls/seg/:encoded', async (req, res) => {
    if (!requireSession(res)) return;
    appState.attachStreamHeartbeat?.(req, res);

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
    const headers = getHeadersForUrl(realUrl);

    let response;
    try {
      response = await fetchFromPortal(http, headers, realUrl);
    } catch (e) {
      log.error(TAG, `segment fetch failed: ${e.message}`);
      return res.status(502).send(`Fetch failed: ${e.message}`);
    }

    if (response.status === 403 || response.status === 404) {
      log.warn(TAG, `portal returned ${response.status} on segment — stream may have expired`);
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
