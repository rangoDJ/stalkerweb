// routes/vod.js
// GET /api/vod/categories?type=vod|series
// GET /api/vod/items?type=vod|series&category=X&page=1&search=&fav=0
// GET /api/vod/seasons/:movieId
// GET /api/vod/stream?videoId=X&cmd=<encoded>&series=0

'use strict';

const express = require('express');
const router  = express.Router();
const sessionMiddleware = require('../middleware/session');
const log = require('../logger');
const TAG = 'vod';

module.exports = function vodRoutes(appState) {
  const guard = sessionMiddleware(appState);

  // GET /api/vod/categories?type=vod|series
  router.get('/categories', guard, async (req, res) => {
    const { vodManager } = appState;
    const type = req.query.type === 'series' ? 'series' : 'vod';
    const categories = await vodManager.getCategories(type);
    res.json({ categories });
  });

  // GET /api/vod/items?type=vod|series&category=X&page=1&search=&fav=0
  router.get('/items', guard, async (req, res) => {
    const { vodManager } = appState;
    const { category, search = '', fav = '0', page = '1' } = req.query;
    const type = req.query.type === 'series' ? 'series' : 'vod';

    if (!category) return res.status(400).json({ error: 'category is required' });

    const result = await vodManager.getItems({
      type,
      categoryId: category,
      page:       Math.max(1, parseInt(page, 10) || 1),
      search:     search.trim(),
      fav:        fav === '1' ? 1 : 0,
    });

    // Resolve screenshot URIs to absolute URLs server-side
    result.items = result.items.map(item => ({
      ...item,
      screenshotUrl: item.screenshotUri ? vodManager.resolveScreenshot(item.screenshotUri) : null,
    }));

    appState.touchActivity?.();
    res.json(result);
  });

  // GET /api/vod/seasons/:movieId
  router.get('/seasons/:movieId', guard, async (req, res) => {
    const { vodManager } = appState;
    const seasons = await vodManager.getSeasons(req.params.movieId);
    const normalized = seasons.map(s => ({
      ...s,
      screenshotUrl: s.screenshotUri ? vodManager.resolveScreenshot(s.screenshotUri) : null,
    }));
    log.info(TAG, `seasons for movieId=${req.params.movieId}: ${normalized.length} seasons`);
    res.json({ seasons: normalized });
  });

  // GET /api/vod/stream?videoId=X&cmd=<encoded>&series=0
  // Returns a /proxy/vod/stream URL so the browser never talks to the portal
  // directly — the proxy carries the session cookies and handles auth.
  router.get('/stream', guard, (req, res) => {
    const { videoId, cmd = '', series = '0' } = req.query;
    if (!videoId) return res.status(400).json({ error: 'videoId is required' });

    const p = new URLSearchParams({ videoId });
    if (cmd)                        p.set('cmd', cmd);
    if (series && series !== '0')   p.set('series', series);

    // Extract file extension from the command URL or default to .mp4
    let ext = '.mp4';
    if (cmd) {
      const pathname = cmd.split('?')[0].split('#')[0];
      const m = pathname.match(/\.([a-z0-9]+)$/i);
      if (m) {
        ext = '.' + m[1].toLowerCase();
      }
    }

    appState.touchActivity?.();
    res.json({ streamUrl: `/proxy/vod/stream${ext}?${p}`, videoId });
  });

  return router;
};
