'use strict';

// Worker thread that owns all CPU-intensive logo work so the main event loop
// is never blocked by CSV parsing, map building, or synchronous file I/O.
//
// Accepts one message: { cmd: 'load'|'download', cacheFile: string }
// Replies with:        { ok: true, map: Object, cachedAt: number }
//               or:   { ok: false, error: string }

const { parentPort } = require('worker_threads');
const fs    = require('fs');
const path  = require('path');
const axios = require('axios');

const CHANNELS_URL = 'https://raw.githubusercontent.com/iptv-org/database/master/data/channels.csv';
const LOGOS_URL    = 'https://raw.githubusercontent.com/iptv-org/database/master/data/logos.csv';

// ── Helpers (mirrors LogoManager.js — pure, no shared state) ──────────────

function normName(name) {
  return String(name || '')
    .toLowerCase()
    .replace(/\s*\([^)]*\)/g, '')
    .replace(/\b(hd|4k|uhd|fhd|sd|h265|hevc|avc|1080p|720p|480p|h\.?264)\b/g, '')
    .replace(/\s*\+\d+$/, '')
    .replace(/^\d+\s+/, '')
    .replace(/[^a-z0-9]/g, '');
}

function parseCSVLine(line) {
  const fields = [];
  let cur = '';
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      if (inQ && line[i + 1] === '"') { cur += '"'; i++; }
      else inQ = !inQ;
    } else if (c === ',' && !inQ) {
      fields.push(cur); cur = '';
    } else {
      cur += c;
    }
  }
  fields.push(cur);
  return fields;
}

function parseCSV(text) {
  const lines = text.replace(/\r/g, '').split('\n');
  const headers = parseCSVLine(lines[0]);
  const out = [];
  for (let i = 1; i < lines.length; i++) {
    const l = lines[i].trim();
    if (!l) continue;
    const vals = parseCSVLine(l);
    const obj = {};
    headers.forEach((h, idx) => { obj[h] = vals[idx] || ''; });
    out.push(obj);
  }
  return out;
}

function buildMap(channels, logos) {
  const idToLogo = new Map();
  for (const row of logos) {
    if (row.in_use !== 'TRUE' || !row.url) continue;
    if (!idToLogo.has(row.channel) || row.feed === '') {
      idToLogo.set(row.channel, row.url);
    }
  }

  const logoMap = new Map();
  for (const ch of channels) {
    const logo = idToLogo.get(ch.id);
    if (!logo) continue;

    const nameKey = normName(ch.name);
    if (nameKey && !logoMap.has(nameKey)) logoMap.set(nameKey, logo);

    const alts = ch.alt_names ? ch.alt_names.split(',').map(s => s.trim()).filter(Boolean) : [];
    for (const alt of alts) {
      const altKey = normName(alt);
      if (altKey && !logoMap.has(altKey)) logoMap.set(altKey, logo);
    }
  }
  return logoMap;
}

// ── Message handler ───────────────────────────────────────────────────────

parentPort.once('message', async (msg) => {
  try {
    if (msg.cmd === 'load') {
      const raw  = fs.readFileSync(msg.cacheFile, 'utf8');
      const data = JSON.parse(raw);
      parentPort.postMessage({ ok: true, map: data.map, cachedAt: data.cachedAt });

    } else if (msg.cmd === 'download') {
      const [chResp, lgResp] = await Promise.all([
        axios.get(CHANNELS_URL, { responseType: 'text', timeout: 45_000 }),
        axios.get(LOGOS_URL,    { responseType: 'text', timeout: 45_000 }),
      ]);

      const channels = parseCSV(chResp.data);
      const logos    = parseCSV(lgResp.data);
      const logoMap  = buildMap(channels, logos);
      const cachedAt = Date.now();
      const mapObj   = Object.fromEntries(logoMap);

      fs.mkdirSync(path.dirname(msg.cacheFile), { recursive: true });
      fs.writeFileSync(msg.cacheFile, JSON.stringify({ cachedAt, map: mapObj }), 'utf8');

      parentPort.postMessage({ ok: true, map: mapObj, cachedAt, count: logoMap.size });

    } else {
      parentPort.postMessage({ ok: false, error: `unknown cmd: ${msg.cmd}` });
    }
  } catch (e) {
    parentPort.postMessage({ ok: false, error: e.message });
  }
});
