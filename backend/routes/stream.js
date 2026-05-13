// routes/stream.js
// GET /api/stream/:channelId  — resolve stream URL for a channel
//
// Mirrors StalkerInstance::GetChannelStreamURL() exactly:
//   1. If "matrix" in cmd → call matrix.php endpoint
//   2. If useHttpTmpLink or useLoadBalancing → call itvCreateLink
//   3. Otherwise → use channel.cmd directly
// Strip "ffrt<n> " prefix from cmd before returning.

'use strict';

const express = require('express');
const router = express.Router();
const sessionMiddleware = require('../middleware/session');

module.exports = function streamRoutes(appState) {
  const guard = sessionMiddleware(appState);

  // GET /api/stream/:channelId
  router.get('/:channelId', guard, async (req, res) => {
    const { client, channelManager } = appState;
    const uniqueId = parseInt(req.params.channelId, 10);

    const channel = channelManager.getChannel(uniqueId);
    if (!channel) return res.status(404).json({ error: 'Channel not found' });

    let streamUrl = '';

    try {
      if (channel.cmd.includes('matrix')) {
        // ── Matrix channel (non-standard) ──────────────────────────────────
        console.log(`[stream] resolving matrix url for ch ${channel.number}`);
        let cmd = '';

        try {
          cmd = await client.resolveMatrixUrl(channel.cmd);
        } catch (e) {
          console.warn('[stream] matrix call failed, falling back to cmd');
          cmd = channel.cmd;
        }

        // strip "ffrt<n> " prefix
        const spacePos = cmd.indexOf(' ');
        streamUrl = spacePos !== -1 ? cmd.slice(spacePos + 1) : cmd;

      } else {
        // ── Standard channel ───────────────────────────────────────────────
        streamUrl = await channelManager.getStreamUrl(channel);
      }
    } catch (err) {
      return res.status(502).json({ error: `Stream resolution failed: ${err.message}` });
    }

    if (!streamUrl) {
      return res.status(502).json({ error: 'Could not resolve stream URL' });
    }

    res.json({
      channelId: uniqueId,
      channelName: channel.name,
      streamUrl,
    });
  });

  return router;
};
