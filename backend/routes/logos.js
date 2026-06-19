// routes/logos.js
// GET    /api/logos               — overrides + db stats + matched-channel count
// GET    /api/logos/map           — { [uniqueId]: logoUrl } for all channels
// GET    /api/logos/check?name=…  — diagnostic: resolve a single channel name
// POST   /api/logos               — add/update a manual override { name, url }
// DELETE /api/logos/:name         — remove a manual override
// POST   /api/logos/refresh       — force re-download the iptv-org database

'use strict';

const express = require('express');

module.exports = function logosModule(logoManager, appState) {
  const router = express.Router();

  router.get('/', (_req, res) => {
    const stats = logoManager.getStats();
    // Include matched-channel count when channel list is available
    const channelManager = appState?.channelManager;
    if (channelManager) {
      const channels = channelManager.getChannels();
      stats.total_channels  = channels.length;
      stats.matched_channels = channels.filter(ch => !!logoManager.getLogo(ch.name)).length;
    }
    res.json({ overrides: logoManager.getOverrides(), stats });
  });

  // Debug: resolve a single channel name
  router.get('/check', (req, res) => {
    const { name } = req.query;
    if (!name) return res.status(400).json({ error: 'name query param required' });
  res.json(logoManager.checkName(name));
  });

  // Proxy and cache a logo image
  router.get('/render', async (req, res) => {
    const { url } = req.query;
    if (!url) return res.status(400).send('url required');

    try {
      const headers = {};
      const basePath = appState?.client?.getBasePath?.() || '';
      
      if (basePath && url.startsWith(new URL(basePath).origin)) {
        const streamHeaders = appState.client.getStreamHeaders?.() || {};
        if (streamHeaders['User-Agent']) headers['User-Agent'] = streamHeaders['User-Agent'];
        if (streamHeaders['Cookie'])     headers['Cookie']     = streamHeaders['Cookie'];
      }

      const filePath = await logoManager.getLogoPath(url, headers);
      if (!filePath) return res.status(404).send('Not found');

      res.setHeader('Cache-Control', 'public, max-age=604800, immutable'); // 7 days
      res.sendFile(filePath);
    } catch (e) {
      res.status(500).send(e.message);
    }
  });

  // Returns { [uniqueId]: logoUrl } for all loaded channels — used by the web UI
  router.get('/map', (_req, res) => {
    const channelManager = appState?.channelManager;
    if (!channelManager) return res.json({});
    const channels = channelManager.getChannels();
    const map = {};
    for (const ch of channels) {
      // Precedence: manual override → Stalker portal logo → iptv-org (manual fetch).
      const logo = logoManager.resolveOverride(ch.name)
                || ch.iconPath
                || logoManager.resolveDbLogo(ch.name)
                || '';
      if (logo) {
        map[String(ch.uniqueId)] = `/api/logos/render?url=${encodeURIComponent(logo)}`;
      }
    }
    res.json(map);
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

  // ── Strip words ─────────────────────────────────────────────────────────────
  // Words removed from channel names before logo lookup.
  // e.g. "BBC CANADA" + strip "CANADA" → looks up "BBC" in iptv-org db.
  router.get('/strip', (_req, res) => {
    res.json({ stripWords: logoManager.getStripWords() });
  });

  router.post('/strip', (req, res) => {
    const { word } = req.body;
    if (!word || typeof word !== 'string') return res.status(400).json({ error: 'word required' });
    logoManager.addStripWord(word.trim());
    res.json({ success: true, stripWords: logoManager.getStripWords() });
  });

  router.delete('/strip/:word', (req, res) => {
    logoManager.deleteStripWord(decodeURIComponent(req.params.word));
    res.json({ success: true, stripWords: logoManager.getStripWords() });
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
