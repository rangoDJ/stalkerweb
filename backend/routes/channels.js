// routes/channels.js
// GET /api/channels            — all channels (with optional ?group= filter)
// GET /api/channels/groups/all — all genre groups  ← must be BEFORE /:id
// GET /api/channels/:id        — single channel info
//
// Both list endpoints return immediately with whatever is currently loaded
// plus a `loading` flag so the frontend can poll/subscribe for updates.
// The actual fetch is always driven in the background — no request ever blocks
// waiting for the full channel list to arrive from the portal.

'use strict';

const express = require('express');
const router = express.Router();
const sessionMiddleware = require('../middleware/session');
const log = require('../logger');
const TAG = 'channels';

module.exports = function channelRoutes(appState) {
  const guard = sessionMiddleware(appState);

  // GET /api/channels
  // Returns immediately with whatever channels are loaded so far.
  // Kicks off a background load if nothing is in progress and the list is empty.
  // On ?refresh=1 starts a fresh load in the background (non-blocking).
  router.get('/', guard, (req, res) => {
    const { channelManager } = appState;
    const { group, refresh } = req.query;
    const progress = channelManager.getProgress();

    if (refresh === '1') {
      if (!progress.loading) {
        log.info(TAG, 'refresh requested — starting background reload');
        channelManager.loadChannels()
          .catch(e => log.error(TAG, `refresh reload failed: ${e.message}`));
      } else {
        log.debug(TAG, 'refresh requested but load already in progress — ignoring');
      }
    } else if (channelManager.getChannels().length === 0 && !progress.loading) {
      log.info(TAG, 'no channels and not loading — starting background load');
      channelManager.loadChannels()
        .catch(e => log.error(TAG, `background load failed: ${e.message}`));
    }

    let channels = channelManager.getChannels();
    const currentProgress = channelManager.getProgress();

    if (group && group !== '*') {
      channels = channels.filter((c) => c.genreId === group);
    }

    res.json({ total: channels.length, channels, loading: currentProgress.loading });
  });

  // GET /api/channels/progress — channel load progress (poll while loading)
  router.get('/progress', (req, res) => {
    const { channelManager } = appState;
    if (!channelManager) return res.json({ loading: false, page: 0, totalPages: 0, channelCount: 0 });
    res.json(channelManager.getProgress());
  });

  // GET /api/channels/groups/all — MUST be registered before /:id
  // Returns immediately with whatever groups are loaded (groups load early and fast).
  router.get('/groups/all', guard, (req, res) => {
    const { channelManager } = appState;
    const { refresh } = req.query;
    const progress = channelManager.getProgress();

    if (refresh === '1' && !progress.loading) {
      channelManager.loadGroups()
        .catch(e => log.error(TAG, `groups refresh failed: ${e.message}`));
    } else if (channelManager.getGroups().length === 0 && !progress.loading) {
      channelManager.loadGroups()
        .catch(e => log.error(TAG, `groups load failed: ${e.message}`));
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
