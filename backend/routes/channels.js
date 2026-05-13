// routes/channels.js
// GET /api/channels            — all channels (with optional ?group= filter)
// GET /api/channels/groups/all — all genre groups  ← must be BEFORE /:id
// GET /api/channels/:id        — single channel info

'use strict';

const express = require('express');
const router = express.Router();
const sessionMiddleware = require('../middleware/session');

module.exports = function channelRoutes(appState) {
  const guard = sessionMiddleware(appState);

  // GET /api/channels
  router.get('/', guard, async (req, res) => {
    const { channelManager } = appState;
    const { group, refresh } = req.query;

    if (refresh === '1' || channelManager.getChannels().length === 0) {
      await channelManager.loadChannels();
    }

    let channels = channelManager.getChannels();

    if (group && group !== '*') {
      channels = channels.filter((c) => c.tvGenreId === group);
    }

    res.json({ total: channels.length, channels });
  });

  // GET /api/channels/groups/all — MUST be registered before /:id
  router.get('/groups/all', guard, async (req, res) => {
    const { channelManager } = appState;
    const { refresh } = req.query;

    if (refresh === '1' || channelManager.getGroups().length === 0) {
      await channelManager.loadGroups();
    }

    const groups = channelManager.getGroups();
    res.json({ total: groups.length, groups });
  });

  // GET /api/channels/:id
  router.get('/:id', guard, (req, res) => {
    const id = parseInt(req.params.id, 10);
    const ch = appState.channelManager.getChannel(id);
    if (!ch) return res.status(404).json({ error: 'Channel not found' });
    res.json(ch);
  });

  return router;
};
