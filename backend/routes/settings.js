// routes/settings.js
// GET  /api/settings  — return app-level UI settings
// POST /api/settings  — save app-level UI settings

'use strict';

const express = require('express');
const CacheManager = require('../cache/CacheManager');

const DEFAULTS = {
  epg_enabled: true,
};

module.exports = function settingsModule(config) {
  const router = express.Router();
  const cache = new CacheManager(config.dataDir);

  router.get('/', (_req, res) => {
    const saved = cache.load() || {};
    res.json({
      epg_enabled: saved.epg_enabled !== undefined ? saved.epg_enabled : DEFAULTS.epg_enabled,
    });
  });

  router.post('/', (req, res) => {
    const existing = cache.load() || {};
    const { epg_enabled } = req.body;
    if (epg_enabled !== undefined) existing.epg_enabled = !!epg_enabled;
    cache.save(existing);
    res.json({ success: true, epg_enabled: existing.epg_enabled });
  });

  return router;
};
