// logos/LogoManager.js
// Resolves channel logo URLs using two sources (checked in order):
//   1. Manual overrides in data/logos.json  (exact match, then normalized)
//   2. iptv-org/database channels.json      (normalized name match)
//
// The iptv-org database is downloaded once and cached to disk; refreshed
// automatically after 24 hours or on demand via refresh().

'use strict';

const fs   = require('fs');
const path = require('path');
const axios = require('axios');

const DB_URL     = 'https://raw.githubusercontent.com/iptv-org/database/master/data/channels.json';
const CACHE_TTL  = 24 * 60 * 60 * 1000; // 24 h

// Normalize a channel name for fuzzy matching.
// Handles common IPTV naming patterns:
//   "BBC ONE HD"          → "bbcone"
//   "BBC ONE (UK) FHD"    → "bbcone"
//   "01 CNN INTERNATIONAL"→ "cnninternational"
//   "Al Jazeera +1"       → "aljazeera"
function normName(name) {
  return String(name || '')
    .toLowerCase()
    .replace(/\s*\([^)]*\)/g, '')                              // strip (parenthetical)
    .replace(/\b(hd|4k|uhd|fhd|sd|h265|hevc|avc|1080p|720p|480p|h\.?264)\b/g, '')
    .replace(/\s*\+\d+$/, '')                                  // strip +1 / +2 etc.
    .replace(/^\d+\s+/, '')                                    // strip leading "01 " numbers
    .replace(/[^a-z0-9]/g, '');                                // keep only alphanumeric
}

module.exports.normName = normName;

class LogoManager {
  constructor(dataDir) {
    this._dbCacheFile   = path.join(dataDir, 'cache', 'iptv-org-channels.json');
    this._overrideFile  = path.join(dataDir, 'logos.json');
    this._logoMap       = null;   // Map<normalizedName, logoUrl>
    this._overrides     = null;   // { channelName: logoUrl }
    this._cachedAt      = null;
    this._refreshing    = false;
  }

  // ── Public ─────────────────────────────────────────────────────────────────

  // Returns the best logo URL for a channel name, or '' if none found.
  getLogo(channelName) {
    const overrides = this._getOverrides();

    // Exact override match
    if (overrides[channelName]) return overrides[channelName];

    // Normalized override match
    const norm = normName(channelName);
    for (const [k, v] of Object.entries(overrides)) {
      if (normName(k) === norm) return v;
    }

    // iptv-org database match
    if (this._logoMap) {
      return this._logoMap.get(norm) || '';
    }
    return '';
  }

  // Trigger background load if not yet loaded; non-blocking.
  ensureLoadedBackground() {
    if (!this._logoMap && !this._refreshing) {
      this._loadOrDownload(false).catch(e =>
        console.warn('[logos] background load failed:', e.message)
      );
    }
  }

  // Force-refresh the iptv-org database from the network.
  async refresh() {
    await this._loadOrDownload(true);
    return this.getStats();
  }

  // Debug helper: returns the resolved logo URL plus diagnostic info for a name.
  checkName(name) {
    const norm = normName(name);
    const logo = this.getLogo(name);
    return { name, normalized: norm, logo: logo || null, db_loaded: this._logoMap !== null };
  }

  getStats() {
    return {
      db_size:        this._logoMap ? this._logoMap.size : 0,
      db_cached_at:   this._cachedAt,
      overrides_count: Object.keys(this._getOverrides()).length,
    };
  }

  getOverrides() {
    return { ...this._getOverrides() };
  }

  setOverride(name, url) {
    const ov = this._getOverrides();
    ov[name] = url;
    this._overrides = ov;
    this._saveOverrides();
  }

  deleteOverride(name) {
    const ov = this._getOverrides();
    delete ov[name];
    this._overrides = ov;
    this._saveOverrides();
  }

  // ── Private ────────────────────────────────────────────────────────────────

  _getOverrides() {
    if (this._overrides) return this._overrides;
    try {
      this._overrides = JSON.parse(fs.readFileSync(this._overrideFile, 'utf8'));
    } catch {
      this._overrides = {};
    }
    return this._overrides;
  }

  _saveOverrides() {
    try {
      fs.writeFileSync(this._overrideFile, JSON.stringify(this._overrides, null, 2), 'utf8');
    } catch (e) {
      console.error('[logos] failed to save overrides:', e.message);
    }
  }

  async _loadOrDownload(forceDownload) {
    if (this._refreshing) return;
    this._refreshing = true;

    try {
      const diskExists = fs.existsSync(this._dbCacheFile);
      const diskFresh  = diskExists &&
        (Date.now() - fs.statSync(this._dbCacheFile).mtimeMs < CACHE_TTL);

      if (!forceDownload && diskFresh) {
        await this._loadFromDisk();
      } else {
        await this._download();
      }
    } finally {
      this._refreshing = false;
    }
  }

  async _loadFromDisk() {
    try {
      const raw = fs.readFileSync(this._dbCacheFile, 'utf8');
      const channels = JSON.parse(raw);
      this._buildMap(channels);
      this._cachedAt = fs.statSync(this._dbCacheFile).mtimeMs;
      console.log(`[logos] iptv-org db loaded from disk: ${channels.length} channels → ${this._logoMap.size} logo entries`);
    } catch (e) {
      console.warn('[logos] disk cache read failed:', e.message);
      this._logoMap = new Map();
    }
  }

  async _download() {
    console.log('[logos] downloading iptv-org channels database...');
    try {
      const resp = await axios.get(DB_URL, {
        responseType: 'text',
        timeout: 30_000,
        headers: { 'Accept-Encoding': 'gzip' },
      });
      const text = typeof resp.data === 'string' ? resp.data : JSON.stringify(resp.data);
      const channels = JSON.parse(text);

      fs.mkdirSync(path.dirname(this._dbCacheFile), { recursive: true });
      fs.writeFileSync(this._dbCacheFile, text, 'utf8');

      this._buildMap(channels);
      this._cachedAt = Date.now();
      console.log(`[logos] iptv-org db downloaded: ${channels.length} channels → ${this._logoMap.size} logo entries`);
    } catch (e) {
      console.warn('[logos] download failed:', e.message);
      // Fall back to disk cache even if stale
      if (fs.existsSync(this._dbCacheFile)) {
        await this._loadFromDisk();
      } else {
        this._logoMap = new Map();
      }
    }
  }

  _buildMap(channels) {
    this._logoMap = new Map();
    for (const ch of channels) {
      if (!ch.logo) continue;
      const key = normName(ch.name);
      if (key && !this._logoMap.has(key)) {
        this._logoMap.set(key, ch.logo);
      }
      for (const alt of ch.alt_names || []) {
        const altKey = normName(alt);
        if (altKey && !this._logoMap.has(altKey)) {
          this._logoMap.set(altKey, ch.logo);
        }
      }
    }
  }
}

module.exports = LogoManager;
