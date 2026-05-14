'use strict';

// routes/vod.js
// Factory used for both /api/vod and /api/series — pass type='vod'|'series'.
//
// GET /categories              → category list
// GET /                        → paginated item list (?category=*&page=0&q=)
// GET /:id/stream              → resolve stream URL (?episode=N for series)
// GET /:id/seasons             → season list (series only)

const express = require('express');
const sessionMiddleware = require('../middleware/session');
const log = require('../logger');

module.exports = function vodRoutes(appState, type) {
  const router = express.Router();
  const guard = sessionMiddleware(appState);
  const TAG = type;

  // GET /categories
  router.get('/categories', guard, async (req, res) => {
    const { vodManager } = appState;
    const { refresh } = req.query;

    if (refresh === '1' || vodManager.getCategories(type).length === 0) {
      await vodManager.loadCategories(type);
    }

    const cats = vodManager.getCategories(type);
    res.json({ total: cats.length, categories: cats });
  });

  // GET /
  router.get('/', guard, async (req, res) => {
    const { vodManager } = appState;
    const category = req.query.category || '*';
    const page     = Math.max(0, parseInt(req.query.page, 10) || 0);
    const search   = req.query.q || '';

    try {
      const result = await vodManager.loadItems(type, category, page, search);
      res.json(result);
    } catch (err) {
      log.error(TAG, `loadItems failed: ${err.message}`);
      res.status(502).json({ error: err.message });
    }
  });

  // GET /:id/seasons  (series only — seasons for a given series id)
  router.get('/:id/seasons', guard, async (req, res) => {
    const { vodManager } = appState;
    try {
      const seasons = await vodManager.getSeasons(req.params.id);
      res.json({ seasons });
    } catch (err) {
      log.error(TAG, `getSeasons failed: ${err.message}`);
      res.status(502).json({ error: err.message });
    }
  });

  // GET /:id/stream
  router.get('/:id/stream', guard, async (req, res) => {
    const { vodManager } = appState;
    const { id } = req.params;
    const episode = req.query.episode || '0';

    // Look up item from in-memory cache (populated by earlier list requests)
    const item = vodManager.findItem(id);
    if (!item) {
      return res.status(404).json({ error: `${type} item ${id} not found — load the list first` });
    }

    let rawUrl;
    try {
      rawUrl = await vodManager.getStreamUrl(item, type, episode);
      if (!rawUrl) {
        return res.status(502).json({ error: 'Could not resolve stream URL' });
      }
    } catch (err) {
      log.error(TAG, `getStreamUrl failed: ${err.message}`);
      return res.status(502).json({ error: err.message });
    }

    // Cache the resolved URL on the item so the proxy can serve it with auth headers
    item._cachedStreamUrl = rawUrl;
    item._cachedEpisode   = episode;

    appState.touchActivity?.();

    // Return a proxy URL — the proxy adds portal auth headers to every request
    const epSuffix = episode !== '0' ? `?ep=${encodeURIComponent(episode)}` : '';
    const streamUrl = `/proxy/vod/${type}/${id}${epSuffix}`;
    res.json({ id, name: item.name, streamUrl });
  });

  return router;
};
