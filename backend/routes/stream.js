// routes/stream.js
// GET /api/stream/:channelId  — resolve stream URL for a channel
//
// If the session is not active, auto-reconnects from saved config before
// serving the stream URL (transparent to the caller).

'use strict';

const express = require('express');
const router = express.Router();
const CacheManager = require('../cache/CacheManager');
const log = require('../logger');
const TAG = 'stream';

module.exports = function streamRoutes(appState, config) {

  // ── Ensure an authenticated session exists, reconnecting if needed ─────────
  async function ensureSession() {
    if (appState.sessionManager?.isAuthenticated()) return;

    // Serialise concurrent reconnect attempts
    if (!appState._reconnecting) {
      const cache = new CacheManager(config.dataDir);
      const saved = cache.load();
      if (!saved?.portal || !saved?.mac) {
        throw new Error('Not connected to a portal. Configure portal first.');
      }
      log.info(TAG, 'session inactive — auto-reconnecting');
      appState._reconnecting = appState.connectPortal(saved)
        .then(() => {
          log.info(TAG, 'auto-reconnect succeeded');
          appState.touchActivity?.();
        })
        .catch((e) => {
          log.error(TAG, `auto-reconnect failed: ${e.message}`);
          throw e;
        })
        .finally(() => { appState._reconnecting = null; });
    }

    await appState._reconnecting;
  }

  // GET /api/stream/keepalive — touch activity to prevent idle disconnect
  // Called periodically by the player frontend while a stream is playing.
  router.get('/keepalive', (req, res) => {
    appState.touchActivity?.();
    res.json({ ok: true });
  });

  // GET /api/stream/:channelId
  router.get('/:channelId', async (req, res) => {
    try {
      await ensureSession();
    } catch (e) {
      return res.status(503).json({ error: e.message });
    }

    const { client, channelManager } = appState;
    const uniqueId = parseInt(req.params.channelId, 10);

    const channel = channelManager.getChannel(uniqueId);
    if (!channel) return res.status(404).json({ error: 'Channel not found' });

    let streamUrl = '';

    try {
      if (channel.cmd.includes('matrix')) {
        log.info(TAG, `resolving matrix url for ch ${channel.number}`);
        let cmd = '';
        try {
          cmd = await client.resolveMatrixUrl(channel.cmd) || channel.cmd;
        } catch (e) {
          log.warn(TAG, `matrix call failed, falling back to cmd: ${e.message}`);
          cmd = channel.cmd;
        }
        const spacePos = cmd.indexOf(' ');
        streamUrl = spacePos !== -1 ? cmd.slice(spacePos + 1) : cmd;
      } else {
        streamUrl = await channelManager.getStreamUrl(channel);
      }
      log.info(TAG, `stream url for ch ${channel.number} (${channel.name}): ${streamUrl || '(empty)'}`);
    } catch (err) {
      return res.status(502).json({ error: `Stream resolution failed: ${err.message}` });
    }

    if (!streamUrl) {
      return res.status(502).json({ error: 'Could not resolve stream URL' });
    }

    appState.touchActivity?.();

    res.json({ channelId: uniqueId, channelName: channel.name, streamUrl });
  });

  return router;
};
