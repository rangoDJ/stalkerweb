// logos/LogoManager.js
// Resolves channel logo URLs using two sources (checked in order):
//   1. Manual overrides in data/logos.json
//   2. iptv-org/database — joins channels.csv (id→name) with logos.csv (id→url)
//
// The built name→url map is cached to disk as compact JSON; refreshed after 24h
// or on demand. No external npm deps — CSV parsing is done inline.

'use strict';

const fs     = require('fs');
const path   = require('path');
const axios  = require('axios');
const crypto = require('crypto');
const { Worker } = require('worker_threads');
const CacheManager = require('../cache/CacheManager');
const log = require('../logger');
const TAG = 'logos';

const CACHE_TTL        = 24 * 60 * 60 * 1000;  // 24 h  — iptv-org DB
const FAILURE_TTL      =  7 * 24 * 60 * 60 * 1000;  // 7 days — negative logo cache
const WORKER_PATH      = path.join(__dirname, 'logo-worker.js');

// Normalize a channel name for fuzzy matching (kept here for getLogo/checkName).
function normName(name) {
  return String(name || '')
    .toLowerCase()
    .replace(/\s*\([^)]*\)/g, '')
    .replace(/\b(hd|4k|uhd|fhd|sd|h265|hevc|avc|1080p|720p|480p|h\.?264)\b/g, '')
    .replace(/\s*\+\d+$/, '')
    .replace(/^\d+\s+/, '')
    .replace(/[^a-z0-9]/g, '');
}

// Apply a list of strip words (whole-word, case-insensitive) to a channel name
// before normalisation.  e.g. "BBC CANADA" + ["canada"] → "BBC"
function applyStripWords(channelName, stripWords) {
  if (!stripWords || stripWords.length === 0) return channelName;
  let result = channelName;
  for (const word of stripWords) {
    const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    result = result.replace(new RegExp(`\\b${escaped}\\b`, 'gi'), '');
  }
  return result.replace(/\s+/g, ' ').trim();
}

// Spawn a one-shot worker, send it one message, resolve/reject on reply.
function runWorker(msg) {
  return new Promise((resolve, reject) => {
    const worker = new Worker(WORKER_PATH);
    worker.once('message', (result) => {
      worker.terminate();
      if (result.ok) resolve(result);
      else reject(new Error(result.error));
    });
    worker.once('error', reject);
    worker.postMessage(msg);
  });
}

module.exports.normName = normName;

class LogoManager {
  constructor(dataDir) {
    this._mapCacheFile  = path.join(dataDir, 'cache', 'iptv-org-logos.json');
    this._cache         = new CacheManager(dataDir);
    this._logoMap           = null;   // Map<normalizedName, logoUrl>
    this._overrides         = null;   // in-memory cache, invalidated on write
    this._stripWords        = null;   // in-memory cache, invalidated on write
    this._failedUrls        = null;   // Map<url, failedAtMs> — negative cache
    this._failureCacheFile  = path.join(dataDir, 'cache', 'logo-failures.json');
    this._cachedAt      = null;
    this._refreshing    = false;
    this._cacheDir      = path.join(dataDir, 'cache', 'logos');
    fs.mkdirSync(this._cacheDir, { recursive: true });
  }

  // ── Public ─────────────────────────────────────────────────────────────────

  // Combined resolver kept for diagnostics (checkName) and the match-count stat:
  // a manual override wins, otherwise the iptv-org database match (if loaded).
  // NOTE: this deliberately does NOT include the portal logo — callers that
  // build the channel→logo map compose override → portal → iptv-org themselves.
  getLogo(channelName) {
    return this.resolveOverride(channelName) || this.resolveDbLogo(channelName);
  }

  // Manual per-channel override (data/logos.json). Always honored, top priority.
  resolveOverride(channelName) {
    const overrides  = this._getOverrides();
    const stripWords = this._getStripWords();

    // 1. Exact override (no stripping — user typed the full name)
    if (overrides[channelName]) return overrides[channelName];

    // 2. Normalized override — try both the original name and the stripped name
    const norm         = normName(channelName);
    const normStripped = normName(applyStripWords(channelName, stripWords));
    for (const [k, v] of Object.entries(overrides)) {
      const kn = normName(k);
      if (kn === norm || kn === normStripped) return v;
    }
    return '';
  }

  // iptv-org database match. Only non-empty once the DB has been loaded, which
  // now happens solely via a user-triggered refresh() — never auto-downloaded.
  resolveDbLogo(channelName) {
    if (!this._logoMap) return '';
    const stripWords   = this._getStripWords();
    const norm         = normName(channelName);
    const normStripped = normName(applyStripWords(channelName, stripWords));
    // Try stripped name first (more specific), then original
    return this._logoMap.get(normStripped) || this._logoMap.get(norm) || '';
  }

  checkName(name) {
    const stripWords   = this._getStripWords();
    const stripped     = applyStripWords(name, stripWords);
    const norm         = normName(name);
    const normStripped = normName(stripped);
    const logo         = this.getLogo(name);
    return {
      name,
      normalized:     norm,
      stripped:       stripped !== name ? stripped : null,
      normStripped:   stripped !== name ? normStripped : null,
      logo:           logo || null,
      db_loaded:      this._logoMap !== null,
    };
  }

  getStripWords()  { return this._getStripWords(); }

  addStripWord(word) {
    const w     = String(word).trim();
    if (!w) return;
    const words = this._getStripWords();
    if (!words.includes(w)) {
      words.push(w);
      this._saveStripWords(words);
    }
  }

  deleteStripWord(word) {
    const words   = this._getStripWords().filter(w => w !== word);
    this._saveStripWords(words);
  }

  // Load a previously-downloaded iptv-org DB from disk so a prior manual fetch
  // survives restarts — but never auto-DOWNLOAD it. iptv-org is opt-in; the
  // primary logo source is the Stalker portal. Downloading happens only via the
  // user-triggered refresh().
  ensureLoadedBackground() {
    if (!this._logoMap && !this._refreshing && fs.existsSync(this._mapCacheFile)) {
      this._loadFromDisk().catch(e =>
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
   * 404/403 failures are remembered for FAILURE_TTL (7 days) so the
   * same broken URL is never re-fetched within that window.
   */
  async getLogoPath(url, headers = {}) {
    if (!url || !url.startsWith('http')) return null;

    // Skip known-bad URLs immediately — no network round-trip
    const failed = this._getFailedUrls();
    if (failed.has(url)) return null;

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
      const status = err.response?.status;
      // Only cache permanent failures (404, 403, 410).
      // Transient errors (network timeout, DNS, TLS, 5xx) are not cached so
      // they retry on the next request.
      if (status === 404 || status === 403 || status === 410) {
        this._recordFailure(url);
        log.debug(TAG, `logo ${status} — skipping future requests: ${url}`);
      } else {
        // Surface the underlying cause — an empty err.message usually means a
        // connection-level failure (DNS/IPv6/TLS), not an HTTP status error.
        const detail = err.code || err.cause?.code || err.message || 'unknown error';
        log.warn(TAG, `failed to download ${url}: ${detail}${status ? ` (HTTP ${status})` : ''}`);
      }
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

  _getStripWords() {
    if (this._stripWords) return this._stripWords;
    this._stripWords = this._cache.load()?.logo_strip_words || [];
    return this._stripWords;
  }

  _saveStripWords(words) {
    this._stripWords = words;
    const config = this._cache.load() || {};
    config.logo_strip_words = words;
    this._cache.save(config);
  }

  // ── Negative logo URL cache ────────────────────────────────────────────────

  _getFailedUrls() {
    if (this._failedUrls) return this._failedUrls;

    // Load from disk, pruning entries older than FAILURE_TTL
    try {
      const raw  = JSON.parse(fs.readFileSync(this._failureCacheFile, 'utf8'));
      const now  = Date.now();
      const map  = new Map(
        Object.entries(raw).filter(([, ts]) => now - ts < FAILURE_TTL)
      );
      this._failedUrls = map;
      log.debug(TAG, `loaded ${map.size} negative-cached logo URLs`);
    } catch {
      this._failedUrls = new Map();
    }
    return this._failedUrls;
  }

  _recordFailure(url) {
    const map = this._getFailedUrls();
    map.set(url, Date.now());
    // Persist asynchronously — fire-and-forget to avoid blocking the request
    Promise.resolve().then(() => {
      try {
        const obj = Object.fromEntries(map);
        fs.writeFileSync(this._failureCacheFile, JSON.stringify(obj));
      } catch { /* non-critical */ }
    });
  }

  async _loadOrDownload(forceDownload) {
    if (this._refreshing) return;
    this._refreshing = true;
    try {
      const diskExists = fs.existsSync(this._mapCacheFile);
      const diskFresh  = diskExists &&
        (Date.now() - fs.statSync(this._mapCacheFile).mtimeMs < CACHE_TTL);

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
      const result = await runWorker({ cmd: 'load', cacheFile: this._mapCacheFile });
      this._logoMap  = new Map(Object.entries(result.map));
      this._cachedAt = result.cachedAt;
      log.info(TAG, `loaded from disk: ${this._logoMap.size} logo entries`);
    } catch (e) {
      log.warn(TAG, `disk cache read failed: ${e.message}`);
      this._logoMap = new Map();
    }
  }

  async _download() {
    log.info(TAG, 'downloading iptv-org logo database…');
    try {
      const result = await runWorker({ cmd: 'download', cacheFile: this._mapCacheFile });
      this._logoMap  = new Map(Object.entries(result.map));
      this._cachedAt = result.cachedAt;
      log.info(TAG, `downloaded ${result.count} logo entries`);
    } catch (e) {
      log.warn(TAG, `download failed: ${e.message}`);
      if (fs.existsSync(this._mapCacheFile)) {
        await this._loadFromDisk();
      } else {
        this._logoMap = new Map();
      }
    }
  }
}

module.exports = LogoManager;
