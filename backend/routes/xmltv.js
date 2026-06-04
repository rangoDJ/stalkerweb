// routes/xmltv.js
// GET /api/xmltv — generate an XMLTV guide feed for Jellyfin
//
// Uses real EPG data from GuideManager when available, falling back to
// synthetic 1-hour programme blocks for channels with no EPG data.
//
// Query params:
//   ?period=24   — hours of EPG to fetch (default 24, max 168 / 7 days)
//
// Jellyfin usage:
//   Dashboard → Live TV → Guide Providers → Add → XMLTV
//   URL: http://<stalkerweb-host>:3000/api/xmltv
//
// The tvg-id in the M3U must match the channel id= in XMLTV for Jellyfin
// to link them. Both use channel.uniqueId.

'use strict';

const express = require('express');
const log = require('../logger');
const TAG = 'xmltv';

const BLOCK_HOURS = 1;        // programme block length in hours
const DAYS_AHEAD  = 7;        // how many days of guide data to generate

function xmlEscape(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

// Format a Date as XMLTV timestamp: YYYYMMDDHHmmss +0000
function xmltvDate(d) {
  const pad = (n, w = 2) => String(n).padStart(w, '0');
  return (
    d.getUTCFullYear() +
    pad(d.getUTCMonth() + 1) +
    pad(d.getUTCDate()) +
    pad(d.getUTCHours()) +
    pad(d.getUTCMinutes()) +
    pad(d.getUTCSeconds()) +
    ' +0000'
  );
}

module.exports = function xmltvModule(appState) {
  const router = express.Router();

  router.get('/', async (req, res) => {
    const { channelManager, guideManager } = appState;

    if (!channelManager) {
      return res.status(503).send('Not connected to portal');
    }

    const channels = channelManager.getChannels();
    const groups   = channelManager.getGroups();

    if (channels.length === 0) {
      return res.status(503).send('No channels loaded yet');
    }

    // ?period= clamps to [1, 168] hours (max 7 days)
    const period = Math.min(Math.max(parseInt(req.query.period, 10) || 24, 1), 168);

    // Attempt to load real EPG; on failure epgData stays null and we use synthetic blocks.
    let epgData = null;
    if (guideManager) {
      try {
        epgData = await guideManager.loadGuide(period);
        log.info(TAG, `loaded real EPG for ${Object.keys(epgData || {}).length} channels`);
      } catch (e) {
        log.warn(TAG, `EPG load failed, falling back to synthetic: ${e.message}`);
      }
    }

    const groupName = new Map(groups.map(g => [String(g.id), g.name]));

    // Align start to the nearest hour boundary in the past
    const now   = new Date();
    const start = new Date(now);
    start.setUTCMinutes(0, 0, 0);

    const totalBlocks = (DAYS_AHEAD * 24) / BLOCK_HOURS;
    const blockMs     = BLOCK_HOURS * 60 * 60 * 1000;

    const lines = [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<!DOCTYPE tv SYSTEM "xmltv.dtd">',
      '<tv generator-info-name="stalkerweb" generator-info-url="">',
    ];

    // ── Channel definitions ───────────────────────────────────────────────
    for (const ch of channels) {
      const id   = String(ch.uniqueId);
      const name = xmlEscape(ch.name);
      const logo = xmlEscape(ch.iconPath || '');
      lines.push(`  <channel id="${id}">`);
      lines.push(`    <display-name>${name}</display-name>`);
      if (logo) lines.push(`    <icon src="${logo}" />`);
      lines.push('  </channel>');
    }

    // ── Programme blocks ──────────────────────────────────────────────────
    let realEpgCount = 0;
    let syntheticCount = 0;

    for (const ch of channels) {
      const id       = String(ch.uniqueId);
      const name     = xmlEscape(ch.name);
      const category = xmlEscape(groupName.get(String(ch.tvGenreId)) || '');

      // Try real EPG first: keyed by channelId (portal numeric ID)
      const epgEvents = epgData
        ? (epgData[String(ch.channelId)] ?? epgData[String(ch.uniqueId)] ?? null)
        : null;

      if (epgEvents && Array.isArray(epgEvents) && epgEvents.length > 0) {
        realEpgCount++;
        for (const ev of epgEvents) {
          const evStart = new Date((ev.start_timestamp ?? ev.startTime) * 1000);
          const evStop  = new Date((ev.stop_timestamp  ?? ev.endTime)   * 1000);
          const title   = xmlEscape(ev.name || ev.title || name);
          const descr   = xmlEscape(ev.descr || ev.description || '');
          lines.push(
            `  <programme start="${xmltvDate(evStart)}" stop="${xmltvDate(evStop)}" channel="${id}">`
          );
          lines.push(`    <title lang="en">${title}</title>`);
          if (descr) lines.push(`    <desc lang="en">${descr}</desc>`);
          if (category) lines.push(`    <category lang="en">${category}</category>`);
          lines.push('  </programme>');
        }
      } else {
        // Synthetic fallback: 1-hour blocks for the full window
        syntheticCount++;
        for (let i = 0; i < totalBlocks; i++) {
          const blockStart = new Date(start.getTime() + i * blockMs);
          const blockStop  = new Date(blockStart.getTime() + blockMs);
          lines.push(
            `  <programme start="${xmltvDate(blockStart)}" stop="${xmltvDate(blockStop)}" channel="${id}">`
          );
          lines.push(`    <title lang="en">${name}</title>`);
          if (category) lines.push(`    <category lang="en">${category}</category>`);
          lines.push('  </programme>');
        }
      }
    }

    lines.push('</tv>');

    log.info(TAG, `serving guide: ${channels.length} channels (${realEpgCount} real EPG, ${syntheticCount} synthetic)`);

    res.set('Content-Type', 'application/xml; charset=utf-8');
    res.set('Cache-Control', 'public, max-age=3600');
    res.send(lines.join('\n') + '\n');
  });

  return router;
};
