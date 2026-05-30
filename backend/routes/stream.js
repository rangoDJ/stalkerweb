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
      log.error(TAG, `session check failed: ${e.message}`);
      return res.status(503).json({ error: e.message });
    }

    const { client, channelManager } = appState;

    // Validate channelId is numeric before parseInt to avoid silent NaN lookups
    const rawId = req.params.channelId;
    if (!/^\d+$/.test(rawId)) {
      log.warn(TAG, `invalid channelId param: "${rawId}"`);
      return res.status(400).json({ error: 'Invalid channel ID' });
    }
    const uniqueId = parseInt(rawId, 10);

    const channel = channelManager.getChannel(uniqueId);
    if (!channel) {
      log.warn(TAG, `channel not found: uniqueId=${uniqueId}`);
      return res.status(404).json({ error: 'Channel not found' });
    }

    log.info(TAG, `resolving stream — ch ${channel.number} "${channel.name}" ` +
      `cmd="${channel.cmd}" useHttpTmpLink=${channel.useHttpTmpLink} useLoadBalancing=${channel.useLoadBalancing}`);

    let streamUrl = '';

    try {
      if (channel.cmd.includes('matrix')) {
        log.info(TAG, `ch ${channel.number}: matrix path`);
        let cmd = '';
        try {
          const matrixResult = await client.resolveMatrixUrl(channel.cmd);
          log.debug(TAG, `ch ${channel.number}: resolveMatrixUrl returned: ${JSON.stringify(matrixResult)}`);
          cmd = matrixResult || channel.cmd;
          if (!matrixResult) log.warn(TAG, `ch ${channel.number}: matrix returned null/empty, using channel.cmd`);
        } catch (e) {
          log.warn(TAG, `ch ${channel.number}: matrix call failed (${e.message}), falling back to channel.cmd`);
          cmd = channel.cmd;
        }
        const spacePos = cmd.indexOf(' ');
        streamUrl = spacePos !== -1 ? cmd.slice(spacePos + 1) : cmd;
        log.info(TAG, `ch ${channel.number}: matrix resolved cmd="${cmd}" → url="${streamUrl || '(empty)'}"`);
      } else {
        streamUrl = await channelManager.getStreamUrl(channel);
        log.info(TAG, `ch ${channel.number}: getStreamUrl → "${streamUrl || '(empty)'}"`);
      }
    } catch (err) {
      log.error(TAG, `ch ${channel.number}: stream resolution threw: ${err.message}`);
      return res.status(502).json({ error: `Stream resolution failed: ${err.message}` });
    }

    if (!streamUrl) {
      log.error(TAG, `ch ${channel.number} "${channel.name}": all resolution paths returned empty`);
      return res.status(502).json({ error: 'Could not resolve stream URL' });
    }

    appState.touchActivity?.();
    res.json({ channelId: uniqueId, channelName: channel.name, streamUrl });
  });

  return router;
};
