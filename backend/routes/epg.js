// routes/epg.js
// GET /api/epg                              — full EPG data for all channels
// GET /api/epg/:channelId                   — EPG events for a single channel
// GET /api/epg/:channelId/catchup           — catch-up stream URL for a time window

'use strict';

const express = require('express');
const router = express.Router();
const sessionMiddleware = require('../middleware/session');

module.exports = function epgRoutes(appState) {
  const guard = sessionMiddleware(appState);

  // GET /api/epg/now — current + next programme for every channel (uses cached EPG)
  router.get('/now', guard, async (req, res) => {
    const { guideManager, channelManager } = appState;
    try {
      await guideManager.loadGuide(3); // 3 h covers now + next
    } catch (_) {
      return res.json({}); // EPG unavailable
    }
    const nowSecs = Math.floor(Date.now() / 1000);
    const channels = channelManager.getChannels();
    const result = {};
    for (const ch of channels) {
      const events = guideManager.getChannelEvents(ch.channelId);
      const nowIdx = events.findIndex(e => e.startTime <= nowSecs && e.endTime > nowSecs);
      if (nowIdx === -1) continue;
      const cur  = events[nowIdx];
      const next = events[nowIdx + 1] ?? null;
      result[ch.uniqueId] = {
        now: { title: cur.title, startTime: cur.startTime, endTime: cur.endTime },
        ...(next ? { next: { title: next.title, startTime: next.startTime } } : {}),
      };
    }
    res.json(result);
  });

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

  // GET /api/epg/:channelId/catchup?startTime=<unix>&endTime=<unix>
  // Returns a stream URL that includes archive parameters for catch-up playback.
  // The actual portal-side support is speculative; the plumbing routes it through
  // the proxy so the archive params are forwarded to the Stalker portal on demand.
  router.get('/:channelId/catchup', guard, async (req, res) => {
    const { channelManager } = appState;
    const uniqueId = String(req.params.channelId);
    const { startTime, endTime } = req.query;

    if (!startTime) {
      return res.status(400).json({ error: 'startTime query param is required' });
    }

    const channel = channelManager.getChannel(uniqueId);
    if (!channel) return res.status(404).json({ error: 'Channel not found' });

    // Build a proxy URL that passes the startTime through to proxy.js,
    // which will modify the cmd before resolving the stream URL.
    const streamUrl = `/proxy/stream/${uniqueId}?startTime=${encodeURIComponent(startTime)}` +
      (endTime ? `&endTime=${encodeURIComponent(endTime)}` : '');

    return res.json({ streamUrl });
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
