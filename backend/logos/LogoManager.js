// logos/LogoManager.js
// Resolves channel logo URLs using two sources (checked in order):
//   1. Manual overrides in data/logos.json
//   2. iptv-org/database — joins channels.csv (id→name) with logos.csv (id→url)
//
// The built name→url map is cached to disk as compact JSON; refreshed after 24h
// or on demand. No external npm deps — CSV parsing is done inline.

'use strict';

const fs    = require('fs');
const path  = require('path');
const axios = require('axios');
const crypto = require('crypto');
const CacheManager = require('../cache/CacheManager');
const log = require('../logger');
const TAG = 'logos';

const CHANNELS_URL = 'https://raw.githubusercontent.com/iptv-org/database/master/data/channels.csv';
const LOGOS_URL    = 'https://raw.githubusercontent.com/iptv-org/database/master/data/logos.csv';
const CACHE_TTL    = 24 * 60 * 60 * 1000; // 24 h

// Normalize a channel name for fuzzy matching.
function normName(name) {
  return String(name || '')
    .toLowerCase()
    .replace(/\s*\([^)]*\)/g, '')
    .replace(/\b(hd|4k|uhd|fhd|sd|h265|hevc|avc|1080p|720p|480p|h\.?264)\b/g, '')
    .replace(/\s*\+\d+$/, '')
    .replace(/^\d+\s+/, '')
    .replace(/[^a-z0-9]/g, '');
}

// Minimal RFC-4180 CSV line parser (handles double-quoted fields with commas).
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

// Parse CSV text → array of plain objects keyed by the header row.
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

module.exports.normName = normName;

class LogoManager {
  constructor(dataDir) {
    this._mapCacheFile  = path.join(dataDir, 'cache', 'iptv-org-logos.json');
    this._cache         = new CacheManager(dataDir);
    this._logoMap       = null;   // Map<normalizedName, logoUrl>
    this._overrides     = null;   // in-memory cache, invalidated on write
    this._cachedAt      = null;
    this._refreshing    = false;
    this._cacheDir      = path.join(dataDir, 'cache', 'logos');
    fs.mkdirSync(this._cacheDir, { recursive: true });
  }

  // ── Public ─────────────────────────────────────────────────────────────────

  getLogo(channelName) {
    const overrides = this._getOverrides();

    // 1. Exact override
    if (overrides[channelName]) return overrides[channelName];

    // 2. Normalized override
    const norm = normName(channelName);
    for (const [k, v] of Object.entries(overrides)) {
      if (normName(k) === norm) return v;
    }

    // 3. iptv-org map
    return (this._logoMap && this._logoMap.get(norm)) || '';
  }

  checkName(name) {
    const norm = normName(name);
    const logo = this.getLogo(name);
    return { name, normalized: norm, logo: logo || null, db_loaded: this._logoMap !== null };
  }

  ensureLoadedBackground() {
    if (!this._logoMap && !this._refreshing) {
      this._loadOrDownload(false).catch(e =>
        log.warn(TAG, `background load failed: ${e.message}`)
      );
    }
  }

  async refresh() {
    await this._loadOrDownload(true);
    return this.getStats();
  }

  getStats() {
    return {
      db_size:           this._logoMap ? this._logoMap.size : 0,
      db_cached_at:      this._cachedAt,
      overrides_count:   Object.keys(this._getOverrides()).length,
    };
  }

  getOverrides() { return this._getOverrides(); }

  setOverride(name, url) {
    const ov = this._getOverrides();
    ov[name] = url;
    this._saveOverrides(ov);
  }

  deleteOverride(name) {
    const ov = this._getOverrides();
    delete ov[name];
    this._saveOverrides(ov);
  }

  /**
   * Fetches an image from URL and returns its local path (cached).
   * If not in cache, downloads it.
   */
  async getLogoPath(url, headers = {}) {
    if (!url || !url.startsWith('http')) return null;

    const hash = crypto.createHash('md5').update(url).digest('hex');
    const ext  = path.extname(new URL(url).pathname) || '.png';
    const filePath = path.join(this._cacheDir, hash + ext);

    if (fs.existsSync(filePath)) {
      return filePath;
    }

    // Download
    try {
      const resp = await axios.get(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
          ...headers
        },
        responseType: 'arraybuffer',
        timeout: 10000,
      });
      fs.writeFileSync(filePath, resp.data);
      return filePath;
    } catch (err) {
      log.warn(TAG, `failed to download ${url}: ${err.message}`);
      return null;
    }
  }

  // ── Private ────────────────────────────────────────────────────────────────

  _getOverrides() {
    if (this._overrides) return this._overrides;
    this._overrides = this._cache.load()?.logo_overrides || {};
    return this._overrides;
  }

  _saveOverrides(overrides) {
    this._overrides = overrides;
    const config = this._cache.load() || {};
    config.logo_overrides = overrides;
    this._cache.save(config);
  }

  async _loadOrDownload(forceDownload) {
    if (this._refreshing) return;
    this._refreshing = true;
    try {
      const diskExists = fs.existsSync(this._mapCacheFile);
      const diskFresh  = diskExists &&
        (Date.now() - fs.statSync(this._mapCacheFile).mtimeMs < CACHE_TTL);

      if (!forceDownload && diskFresh) {
        this._loadFromDisk();
      } else {
        await this._download();
      }
    } finally {
      this._refreshing = false;
    }
  }

  _loadFromDisk() {
    try {
      const data = JSON.parse(fs.readFileSync(this._mapCacheFile, 'utf8'));
      this._logoMap  = new Map(Object.entries(data.map));
      this._cachedAt = data.cachedAt || fs.statSync(this._mapCacheFile).mtimeMs;
      log.info(TAG, `loaded from disk: ${this._logoMap.size} logo entries`);
    } catch (e) {
      log.warn(TAG, `disk cache read failed: ${e.message}`);
      this._logoMap = new Map();
    }
  }

  async _download() {
    log.info(TAG, 'downloading iptv-org channels.csv + logos.csv...');
    try {
      const [chResp, lgResp] = await Promise.all([
        axios.get(CHANNELS_URL, { responseType: 'text', timeout: 45_000 }),
        axios.get(LOGOS_URL,    { responseType: 'text', timeout: 45_000 }),
      ]);

      const channels = parseCSV(chResp.data);
      const logos    = parseCSV(lgResp.data);

      this._buildMap(channels, logos);
      this._cachedAt = Date.now();

      // Cache just the pre-built map — much smaller than raw CSVs
      fs.mkdirSync(path.dirname(this._mapCacheFile), { recursive: true });
      fs.writeFileSync(this._mapCacheFile, JSON.stringify({
        cachedAt: this._cachedAt,
        map: Object.fromEntries(this._logoMap),
      }), 'utf8');

      log.info(TAG, `downloaded: ${channels.length} channels, ${logos.length} logo rows → ${this._logoMap.size} name entries`);
    } catch (e) {
      log.warn(TAG, `download failed: ${e.message}`);
      if (fs.existsSync(this._mapCacheFile)) {
        this._loadFromDisk();
      } else {
        this._logoMap = new Map();
      }
    }
  }

  _buildMap(channels, logos) {
    // Build channelId → logoUrl (in_use only; prefer default/empty feed)
    const idToLogo = new Map();
    for (const row of logos) {
      if (row.in_use !== 'TRUE' || !row.url) continue;
      if (!idToLogo.has(row.channel) || row.feed === '') {
        idToLogo.set(row.channel, row.url);
      }
    }

    // Build normalized name → logoUrl
    this._logoMap = new Map();
    for (const ch of channels) {
      const logo = idToLogo.get(ch.id);
      if (!logo) continue;

      const nameKey = normName(ch.name);
      if (nameKey && !this._logoMap.has(nameKey)) {
        this._logoMap.set(nameKey, logo);
      }

      // alt_names is a comma-separated list (may be empty)
      const alts = ch.alt_names ? ch.alt_names.split(',').map(s => s.trim()).filter(Boolean) : [];
      for (const alt of alts) {
        const altKey = normName(alt);
        if (altKey && !this._logoMap.has(altKey)) {
          this._logoMap.set(altKey, logo);
        }
      }
    }
  }
}

module.exports = LogoManager;
