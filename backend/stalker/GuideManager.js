// GuideManager.js
// Mirrors: GuideManager.cpp
//
// Fetches EPG data from the Stalker portal's itv/get_epg_info endpoint.
// Supports caching of raw EPG JSON to avoid repeated server hits.

'use strict';

const fs = require('fs');
const path = require('path');

class GuideManager {
  constructor(client, cacheDir) {
    this.client = client;
    this.cacheDir = cacheDir;
    this._epgData = null;       // raw js.data from get_epg_info
    this._cacheExpiry = 0;      // unix timestamp when cache expires
    this._useCache = true;
    this._cacheHours = 4;       // default cache duration
  }

  setCacheOptions(useCache, hours) {
    this._useCache = useCache;
    this._cacheHours = hours || 4;
  }

  // ── Load EPG ───────────────────────────────────────────────────────────────
  // Mirrors GuideManager::LoadGuide()
  async loadGuide(periodHours = 24) {
    const cacheFile = this.cacheDir ? path.join(this.cacheDir, 'epg_provider.json') : null;
    const now = Date.now();

    // Return cached data if valid
    if (this._useCache && this._epgData && now < this._cacheExpiry) {
      console.log('[GuideManager] using cached EPG');
      return this._epgData;
    }

    // Try loading from disk cache
    if (this._useCache && cacheFile) {
      try {
        const stat = fs.statSync(cacheFile);
        const ageMs = now - stat.mtimeMs;
        if (ageMs < this._cacheHours * 3600 * 1000) {
          const raw = fs.readFileSync(cacheFile, 'utf8');
          const parsed = JSON.parse(raw);
          if (parsed?.js?.data) {
            this._epgData = parsed.js.data;
            this._cacheExpiry = stat.mtimeMs + this._cacheHours * 3600 * 1000;
            console.log('[GuideManager] loaded EPG from disk cache');
            return this._epgData;
          }
        }
      } catch (_) {
        // Cache miss — fetch fresh
      }
    }

    console.log(`[GuideManager] fetching EPG (period=${periodHours}h)`);
    const data = await this.client.itvGetEPGInfo(periodHours);

    if (!data?.js?.data) {
      throw new Error('get_epg_info returned no data');
    }

    this._epgData = data.js.data;
    this._cacheExpiry = now + this._cacheHours * 3600 * 1000;

    // Persist to disk
    if (this._useCache && cacheFile) {
      try {
        fs.mkdirSync(path.dirname(cacheFile), { recursive: true });
        fs.writeFileSync(cacheFile, JSON.stringify(data), 'utf8');
      } catch (e) {
        console.warn('[GuideManager] failed to write EPG cache:', e.message);
      }
    }

    return this._epgData;
  }

  // ── Get events for a specific channel ─────────────────────────────────────
  // Mirrors GuideManager::GetChannelEvents()
  getChannelEvents(channelId, startTs = 0, endTs = 0, epgTimeshiftSecs = 0) {
    if (!this._epgData) return [];

    const channelStr = String(channelId);
    const channelEPG = this._epgData[channelStr];
    if (!channelEPG) return [];

    const items = Array.isArray(channelEPG) ? channelEPG : Object.values(channelEPG);
    const events = [];

    for (const item of items) {
      try {
        const start = Number(item.start_timestamp) + epgTimeshiftSecs;
        const stop = Number(item.stop_timestamp) + epgTimeshiftSecs;

        if (startTs && endTs) {
          if (!(start >= startTs && stop <= endTs)) continue;
        }

        events.push({
          id: Number(item.id),
          title: item.name || '',
          startTime: start,
          endTime: stop,
          description: item.descr || '',
        });
      } catch (_) {
        // skip malformed entries
      }
    }

    return events;
  }

  clearCache() {
    this._epgData = null;
    this._cacheExpiry = 0;
  }
}

module.exports = GuideManager;
