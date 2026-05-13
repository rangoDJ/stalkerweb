// routes/epg.js
// GET /api/epg              — full EPG data for all channels
// GET /api/epg/:channelId   — EPG events for a single channel

'use strict';

const express = require('express');
const router = express.Router();
const sessionMiddleware = require('../middleware/session');

module.exports = function epgRoutes(appState) {
  const guard = sessionMiddleware(appState);

  // GET /api/epg?period=<hours>&refresh=1
  router.get('/', guard, async (req, res) => {
    const { guideManager, channelManager } = appState;
    const period = parseInt(req.query.period, 10) || 24;
    const refresh = req.query.refresh === '1';

    if (refresh) guideManager.clearCache();

    await guideManager.loadGuide(period);

    // Build per-channel event list
    const channels = channelManager.getChannels();
    const result = {};
    for (const ch of channels) {
      const events = guideManager.getChannelEvents(ch.channelId);
      if (events.length > 0) result[ch.uniqueId] = events;
    }

    res.json({ period, channelCount: Object.keys(result).length, epg: result });
  });

  // GET /api/epg/:channelId?period=<hours>
  router.get('/:channelId', guard, async (req, res) => {
    const { guideManager, channelManager } = appState;
    const uniqueId = parseInt(req.params.channelId, 10);
    const period = parseInt(req.query.period, 10) || 24;

    const channel = channelManager.getChannel(uniqueId);
    if (!channel) return res.status(404).json({ error: 'Channel not found' });

    await guideManager.loadGuide(period);
    const events = guideManager.getChannelEvents(channel.channelId);

    res.json({ channelId: uniqueId, channelName: channel.name, events });
  });

  return router;
};
