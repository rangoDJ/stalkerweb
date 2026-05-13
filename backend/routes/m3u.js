// routes/m3u.js
// GET /api/m3u — generate an M3U8 playlist for Jellyfin (or any IPTV client)
//
// Each channel entry points to /proxy/stream/:uniqueId so stream URLs are
// resolved on-demand through the authenticated HLS proxy rather than being
// baked in as short-lived portal URLs.
//
// Usage in Jellyfin:
//   Dashboard → Live TV → Tuner Devices → Add → M3U Tuner
//   URL: http://<stalkerweb-host>:3000/api/m3u

'use strict';

const express = require('express');

module.exports = function m3uModule(appState) {
  const router = express.Router();

  router.get('/', (req, res) => {
    const { channelManager } = appState;

    if (!channelManager) {
      return res.status(503).send('Not connected to portal — connect first via the web UI');
    }

    const channels = channelManager.getChannels();
    const groups   = channelManager.getGroups();

    if (channels.length === 0) {
      return res.status(503).send('No channels loaded yet — try again in a moment');
    }

    // Build a quick lookup: genre id → group name
    const groupName = new Map(groups.map(g => [String(g.id), g.name]));

    const base = `${req.protocol}://${req.get('host')}`;

    const lines = ['#EXTM3U x-tvg-url=""'];

    for (const ch of channels) {
      const group  = groupName.get(String(ch.tvGenreId)) || '';
      const logo   = ch.iconPath || '';
      const name   = ch.name.replace(/,/g, ' '); // commas break the EXTINF line
      const chno   = ch.number > 0 ? ` tvg-chno="${ch.number}"` : '';

      lines.push(
        `#EXTINF:-1 tvg-id="${ch.uniqueId}"${chno} tvg-name="${name}" tvg-logo="${logo}" group-title="${group}",${name}`,
        `${base}/proxy/stream/${ch.uniqueId}`
      );
    }

    console.log(`[m3u] serving playlist: ${channels.length} channels`);

    res.set('Content-Type', 'application/x-mpegurl; charset=utf-8');
    res.set('Content-Disposition', 'attachment; filename="stalkerweb.m3u"');
    res.set('Cache-Control', 'no-cache');
    res.send(lines.join('\n') + '\n');
  });

  return router;
};
