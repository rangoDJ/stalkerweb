// routes/settings.js
// GET  /api/settings  — return app-level UI settings
// POST /api/settings  — save app-level UI settings

'use strict';

const express = require('express');
const CacheManager = require('../cache/CacheManager');

const STB_MODELS = ['MAG200', 'MAG250', 'MAG254', 'MAG256', 'MAG270', 'MAG322', 'MAG352', 'CUSTOM'];

const DEFAULTS = {
  epg_enabled: true,
  stbemu_profile_name: '',
  stbemu_stb_model: 'MAG250',
  stbemu_custom_firmware: '',
};

module.exports = function settingsModule(config) {
  const router = express.Router();
  const cache = new CacheManager(config.dataDir);

  router.get('/', (_req, res) => {
    const saved = cache.load() || {};
    res.json({
      epg_enabled:             saved.epg_enabled !== undefined ? saved.epg_enabled : DEFAULTS.epg_enabled,
      stbemu_profile_name:     saved.stbemu_profile_name     ?? DEFAULTS.stbemu_profile_name,
      stbemu_stb_model:        saved.stbemu_stb_model        ?? DEFAULTS.stbemu_stb_model,
      stbemu_custom_firmware:  saved.stbemu_custom_firmware  ?? DEFAULTS.stbemu_custom_firmware,
    });
  });

  router.post('/', (req, res) => {
    const existing = cache.load() || {};
    const { epg_enabled, stbemu_profile_name, stbemu_stb_model, stbemu_custom_firmware } = req.body;
    if (epg_enabled !== undefined)            existing.epg_enabled            = !!epg_enabled;
    if (stbemu_profile_name !== undefined)    existing.stbemu_profile_name    = String(stbemu_profile_name).trim();
    if (stbemu_stb_model !== undefined && STB_MODELS.includes(stbemu_stb_model))
                                              existing.stbemu_stb_model       = stbemu_stb_model;
    if (stbemu_custom_firmware !== undefined) existing.stbemu_custom_firmware = String(stbemu_custom_firmware).trim();
    cache.save(existing);
    res.json({ success: true, epg_enabled: existing.epg_enabled });
  });

  return router;
};
