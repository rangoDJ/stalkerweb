// routes/logos.js
// GET    /api/logos          — return overrides + iptv-org db stats
// POST   /api/logos          — add/update a manual override { name, url }
// DELETE /api/logos/:name    — remove a manual override
// POST   /api/logos/refresh  — force re-download the iptv-org database

'use strict';

const express = require('express');

module.exports = function logosModule(logoManager) {
  const router = express.Router();

  router.get('/', (_req, res) => {
    res.json({
      overrides: logoManager.getOverrides(),
      stats: logoManager.getStats(),
    });
  });

  // Must be registered before /:name so it isn't caught as a name param
  router.post('/refresh', async (_req, res) => {
    try {
      const stats = await logoManager.refresh();
      res.json({ success: true, stats });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  router.post('/', (req, res) => {
    const { name, url } = req.body;
    if (!name || typeof name !== 'string') return res.status(400).json({ error: 'name required' });
    if (!url  || typeof url  !== 'string') return res.status(400).json({ error: 'url required' });
    logoManager.setOverride(name.trim(), url.trim());
    res.json({ success: true });
  });

  router.delete('/:name', (req, res) => {
    logoManager.deleteOverride(decodeURIComponent(req.params.name));
    res.json({ success: true });
  });

  return router;
};
