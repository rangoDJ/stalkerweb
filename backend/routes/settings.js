// routes/settings.js
// GET  /api/settings  — return app-level UI settings
// POST /api/settings  — save app-level UI settings

'use strict';

const express = require('express');
const CacheManager = require('../cache/CacheManager');

const STB_MODELS    = ['MAG200', 'MAG250', 'MAG254', 'MAG256', 'MAG270', 'MAG322', 'MAG352', 'CUSTOM'];
const STB_FIRMWARES = ['0.2.18-r14-pub-250', '0.2.18-r19-pub-250', 'Generic'];

const DEFAULTS = {
  epg_enabled: true,
  show_adult: false,
  stbemu_profile_name: '',
  stbemu_stb_model: 'MAG250',
  stbemu_custom_firmware: '',
  stbemu_firmware: '0.2.18-r14-pub-250',
};

module.exports = function settingsModule(config) {
  const router = express.Router();
  const cache = new CacheManager(config.dataDir);

  router.get('/', (_req, res) => {
    const saved = cache.load() || {};
    res.json({
      epg_enabled:             saved.epg_enabled !== undefined ? saved.epg_enabled : DEFAULTS.epg_enabled,
      show_adult:              saved.show_adult !== undefined  ? saved.show_adult  : DEFAULTS.show_adult,
      stbemu_profile_name:     saved.stbemu_profile_name     ?? DEFAULTS.stbemu_profile_name,
      stbemu_stb_model:        saved.stbemu_stb_model        ?? DEFAULTS.stbemu_stb_model,
      stbemu_custom_firmware:  saved.stbemu_custom_firmware  ?? DEFAULTS.stbemu_custom_firmware,
      stbemu_firmware:         saved.stbemu_firmware         ?? DEFAULTS.stbemu_firmware,
    });
  });

  router.post('/', (req, res) => {
    const existing = cache.load() || {};
    const { epg_enabled, show_adult, stbemu_profile_name, stbemu_stb_model, stbemu_custom_firmware, stbemu_firmware } = req.body;
    if (epg_enabled !== undefined)            existing.epg_enabled            = !!epg_enabled;
    if (show_adult !== undefined)             existing.show_adult             = !!show_adult;
    if (stbemu_profile_name !== undefined)    existing.stbemu_profile_name    = String(stbemu_profile_name).trim();
    if (stbemu_stb_model !== undefined && STB_MODELS.includes(stbemu_stb_model))
                                              existing.stbemu_stb_model       = stbemu_stb_model;
    if (stbemu_custom_firmware !== undefined) existing.stbemu_custom_firmware = String(stbemu_custom_firmware).trim();
    if (stbemu_firmware !== undefined && STB_FIRMWARES.includes(stbemu_firmware))
                                              existing.stbemu_firmware        = stbemu_firmware;
    cache.save(existing);
    res.json({ success: true, epg_enabled: existing.epg_enabled });
  });

  return router;
};
