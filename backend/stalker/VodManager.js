'use strict';

// VodManager.js
// Mirrors ChannelManager.js but for VOD (movies) and Series content.
// Lazy-loads per request — no background preload on connect.

class VodManager {
  constructor(client) {
    this.client = client;
    // Separate category caches for vod and series
    this._categories = { vod: [], series: [] };
    // Item cache: key = `${type}:${category}:${page}:${search}`
    this._itemCache = new Map();
  }

  // ── Categories ─────────────────────────────────────────────────────────────
  async loadCategories(type) {
    const data = type === 'series'
      ? await this.client.seriesGetCategories()
      : await this.client.vodGetCategories();

    const raw = data?.js;
    if (!raw) return [];

    const items = Array.isArray(raw) ? raw : Object.values(raw);
    const cats = items
      .filter((c) => c?.title)
      .map((c) => ({
        id: c.id || '*',
        name: c.title.charAt(0).toUpperCase() + c.title.slice(1),
        alias: c.alias || '',
      }));

    this._categories[type] = cats;
    return cats;
  }

  getCategories(type) {
    return this._categories[type] || [];
  }

  // ── Items (paginated) ──────────────────────────────────────────────────────
  // Returns { items, total, totalPages, page }
  async loadItems(type, category = '*', page = 0, search = '') {
    const cacheKey = `${type}:${category}:${page}:${search}`;
    if (this._itemCache.has(cacheKey)) {
      return this._itemCache.get(cacheKey);
    }

    const data = type === 'series'
      ? await this.client.seriesGetOrderedList(category, page, search)
      : await this.client.vodGetOrderedList(category, page, 'added', search);

    if (!data?.js) return { items: [], total: 0, totalPages: 0, page };

    const total      = Number(data.js.total_items)    || 0;
    const perPage    = Number(data.js.max_page_items)  || 14;
    const totalPages = total > 0 && perPage > 0 ? Math.ceil(total / perPage) : 1;

    const raw = data.js.data;
    const items = _parseItems(this.client.getBasePath(), raw);


    const result = { items, total, totalPages, page };
    this._itemCache.set(cacheKey, result);
    return result;
  }

  // ── Seasons (series only) ─────────────────────────────────────────────────
  async getSeasons(movieId) {
    const data = await this.client.seriesGetSeasons(movieId);
    if (!data?.js?.data) return [];
    const raw = data.js.data;
    const items = Array.isArray(raw) ? raw : Object.values(raw);
    return items.filter((s) => s?.name).map((s) => ({
      id:       s.id,
      name:     s.name,
      episodes: Array.isArray(s.series) ? s.series : [],
      cmd:      s.cmd || '',
    }));
  }

  // ── Stream URL resolution ──────────────────────────────────────────────────
  // episodeNumber: '0' for movies, episode number string for series episodes
  // Throws if the portal explicitly rejects the item (e.g. nothing_to_play).
  async getStreamUrl(item, type, episodeNumber = '0') {
    const isHttpUrl = (u) => /^https?:\/\//i.test(u);

    const extractUrl = (raw) => {
      if (!raw) return '';
      const sp = raw.indexOf(' ');
      return sp !== -1 ? raw.slice(sp + 1) : raw;
    };

    let portalError = null;

    const resolveViaApi = async (cmd) => {
      const res = type === 'series'
        ? await this.client.seriesCreateLink(cmd, episodeNumber)
        : await this.client.vodCreateLink(cmd, episodeNumber);
      const js = res?.js || {};
      const err = js.error;
      if (err && err !== 'none' && err !== '') portalError = err;
      const url = extractUrl(js.cmd || '');
      return isHttpUrl(url) ? url : '';
    };

    // Step 1: synthetic /media/<id>.mpg (matches plugin.video.stalkervod)
    try {
      const url = await resolveViaApi(`/media/${item.id}.mpg`);
      if (url) return url;
    } catch (_) {}

    // Step 2: create_link with the item's own cmd (skip if identical to step 1)
    if (item.cmd && item.cmd !== `/media/${item.id}.mpg`) {
      try {
        const url = await resolveViaApi(item.cmd);
        if (url) return url;
      } catch (_) {}
    }

    // Portal explicitly rejected the item — surface the error rather than 404-ing
    if (portalError) throw new Error(`Portal: ${portalError}`);

    // Step 3: cmd field is already a full URL (some portals embed the URL directly)
    const cmdUrl = extractUrl(item.cmd);
    if (isHttpUrl(cmdUrl)) return cmdUrl;

    return '';
  }

  // ── Item lookup by id (from cache) ─────────────────────────────────────────
  findItem(id) {
    for (const result of this._itemCache.values()) {
      const found = result.items.find((it) => String(it.id) === String(id));
      if (found) return found;
    }
    return null;
  }

  // ── Cache invalidation ─────────────────────────────────────────────────────
  clearCache() {
    this._itemCache.clear();
    this._categories = { vod: [], series: [] };
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function _parseItems(basePath, raw) {
  if (!raw) return [];
  const items = Array.isArray(raw) ? raw : Object.values(raw);
  return items
    .filter((item) => item?.name)
    .map((item) => ({
      id:            String(item.id || ''),
      name:          item.name,
      description:   item.description || '',
      time:          item.time || '0',          // minutes
      hd:            !!parseInt(item.hd, 10),
      year:          item.year || '',
      director:      item.director || '',
      actors:        item.actors || '',
      categoryId:    item.category_id || item.genre_id || '',
      screenshotUri: _resolveUri(basePath, item.screenshot_uri || ''),
      cmd:           item.cmd || '',
      fav:           !!parseInt(item.fav, 10),
      isSeries:      Array.isArray(item.series) && item.series.length > 0,
      episodes:      Array.isArray(item.series) ? item.series : [],
    }));
}

// Mirrors ChannelManager._determineLogoUri
function _resolveUri(basePath, uri) {
  if (!uri) return '';
  if (uri.startsWith('http://') || uri.startsWith('https://')) return uri;
  if (uri.startsWith('/')) return basePath.replace(/\/$/, '') + uri;
  return basePath + uri;
}

module.exports = VodManager;
