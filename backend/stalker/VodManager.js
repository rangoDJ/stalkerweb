'use strict';

// VodManager.js
// Handles VOD and Series content: categories, item listings, seasons, stream resolution.
// Mirrors the logic in plugin.video.stalkervod (api.py) ported to Node.js.

const log = require('../logger');
const TAG = 'VodManager';

class VodManager {
  constructor(client) {
    this.client = client;
  }

  // ── Categories ─────────────────────────────────────────────────────────────

  async getCategories(type = 'vod') {
    const r = await this.client._stalkerCall({ type, action: 'get_categories' });
    const cats = r?.js;
    if (!Array.isArray(cats)) return [];
    return cats
      .filter(c => c.id && c.title)
      .map(c => ({ id: String(c.id), title: String(c.title), alias: c.alias || '' }));
  }

  // ── Item listings ──────────────────────────────────────────────────────────

  // Fetches one or more pages of VOD/series items for a category.
  // maxPages mirrors the Kodi plugin's max_page_limit setting (default 3 here).
  async getItems({ type = 'vod', categoryId, page = 1, search = '', fav = 0, maxPages = 3 } = {}) {
    const params = {
      type,
      action: 'get_ordered_list',
      category: String(categoryId),
      sortby:   'added',
      fav:      String(fav),
      p:        String(page),
    };
    if (search) params.search = search;

    const r   = await this.client._stalkerCall(params);
    const js  = r?.js || {};
    let items = Array.isArray(js.data) ? js.data : [];

    const totalItems   = parseInt(js.total_items   || '0', 10) || items.length;
    const maxPageItems = parseInt(js.max_page_items || '14', 10) || 14;
    const totalPages   = Math.max(1, Math.ceil(totalItems / maxPageItems));

    // Fetch additional pages (same pattern as the Kodi plugin)
    for (let p2 = page + 1; p2 <= Math.min(page + maxPages - 1, totalPages); p2++) {
      try {
        const r2 = await this.client._stalkerCall({ ...params, p: String(p2) });
        items = items.concat(Array.isArray(r2?.js?.data) ? r2.js.data : []);
      } catch (e) {
        log.warn(TAG, `multi-page fetch: page ${p2} failed — ${e.message}`);
        break;
      }
    }

    return {
      items:      items.map(i => this._normalizeItem(i)),
      totalItems,
      totalPages,
      page,
    };
  }

  // ── Seasons ────────────────────────────────────────────────────────────────

  async getSeasons(movieId) {
    const r = await this.client._stalkerCall({
      type:     'series',
      action:   'get_ordered_list',
      movie_id: String(movieId),
      sortby:   'added',
      p:        '1',
    });
    const data = Array.isArray(r?.js?.data) ? r.js.data : [];
    return data.map(s => this._normalizeItem(s));
  }

  // ── Stream URL resolution ──────────────────────────────────────────────────

  // Mirrors api.py get_vod_stream_url():
  //   Primary:  create_link with /media/{videoId}.mpg
  //   Fallback: create_link with cmd string from listing
  //   Last resort: use cmd directly if it is already a playable URL
  async getStreamUrl(videoId, cmd, series = 0) {
    const seriesStr = String(series);

    // ── Attempt 1: create_link with /media/{id}.mpg (standard primary path) ──
    // Note: no forced_storage — Kodi plugin omits it for VOD and some portals
    // reject the request with "nothing_to_play" when it is present.
    try {
      let r = await this.client._stalkerCall({
        type:   'vod',
        action: 'create_link',
        cmd:    `/media/${videoId}.mpg`,
        series: seriesStr,
      });
      let url = this._extractCmdUrl(r?.js);
      if (!url) {
        log.warn(TAG, `primary create_link without forced_storage yielded no URL, trying fallback with forced_storage=undefined…`);
        r = await this.client._stalkerCall({
          type:   'vod',
          action: 'create_link',
          cmd:    `/media/${videoId}.mpg`,
          series: seriesStr,
          forced_storage: 'undefined',
          disable_ad: '0',
        });
        url = this._extractCmdUrl(r?.js);
      }
      if (url) {
        log.info(TAG, `stream resolved (primary): ${url.slice(0, 80)}…`);
        return url;
      }
      log.warn(TAG, `primary create_link: no url  js=${JSON.stringify(r?.js)?.slice(0, 200)}`);
    } catch (e) {
      log.warn(TAG, `primary create_link failed for ${videoId}: ${e.message}`);
    }

    // ── Attempt 2: create_link with cmd from listing (only if different) ──
    const listingCmd = cmd && cmd !== `/media/${videoId}.mpg` ? cmd : null;
    if (listingCmd) {
      try {
        let r = await this.client._stalkerCall({
          type:   'vod',
          action: 'create_link',
          cmd:    listingCmd,
          series: seriesStr,
        });
        let url = this._extractCmdUrl(r?.js);
        if (!url) {
          log.warn(TAG, `listing-cmd create_link without forced_storage yielded no URL, trying fallback with forced_storage=undefined…`);
          r = await this.client._stalkerCall({
            type:   'vod',
            action: 'create_link',
            cmd:    listingCmd,
            series: seriesStr,
            forced_storage: 'undefined',
            disable_ad: '0',
          });
          url = this._extractCmdUrl(r?.js);
        }
        if (url) {
          log.info(TAG, `stream resolved (listing cmd): ${url.slice(0, 80)}…`);
          return url;
        }
        log.warn(TAG, `listing-cmd create_link: no url  js=${JSON.stringify(r?.js)?.slice(0, 200)}`);
      } catch (e) {
        log.warn(TAG, `listing-cmd create_link failed: ${e.message}`);
      }
    }

    // ── Attempt 3: cmd from listing is already a playable URL ──
    if (cmd) {
      const direct = this._extractUrl(cmd);
      if (direct) {
        log.info(TAG, `stream resolved (direct listing url): ${direct.slice(0, 80)}…`);
        return direct;
      }
    }

    // ── Attempt 4: construct absolute URL from portal basePath + cmd ──
    // Some portals return "nothing_to_play" for create_link but serve the
    // /media/{id}.mpg path directly (authenticated via session cookies).
    const relCmd = cmd || `/media/${videoId}.mpg`;
    const base   = (this.client?.basePath || '').replace(/\/$/, '');
    if (base.startsWith('http')) {
      const constructed = base + '/' + relCmd.replace(/^\//, '');
      log.info(TAG, `stream resolved (constructed basePath+cmd): ${constructed.slice(0, 80)}…`);
      return constructed;
    }

    throw new Error('Could not resolve VOD stream URL');
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  // Resolve a portal-relative screenshot URI to an absolute URL.
  resolveScreenshot(uri) {
    if (!uri) return null;
    if (uri.startsWith('http://') || uri.startsWith('https://')) return uri;
    const base = (this.client?.basePath || '').replace(/\/$/, '');
    return base + '/' + uri.replace(/^\//, '');
  }

  // Extract the playable URL from a create_link js response.
  // Mirrors ChannelManager.getStreamUrl() which handles three portal variants:
  //   js.cmd  — most common ("ffrt2 http://..." or plain "http://...")
  //   js.url  — alternative field name used by some portals
  //   js      — some portals return the cmd as a bare string
  _extractCmdUrl(js) {
    if (!js) return null;
    const raw = js.cmd || js.url || (typeof js === 'string' ? js : null);
    return raw ? this._extractUrl(raw) : null;
  }

  // Strip the "ffrt<n> " or "ffmpeg " prefix that Stalker portals prepend to
  // stream commands, then validate what remains is an http(s) URL.
  _extractUrl(raw) {
    if (!raw) return null;
    const s = String(raw).trim();
    if (!s) return null;
    const spacePos = s.indexOf(' ');
    const url = spacePos !== -1 ? s.slice(spacePos + 1).trim() : s;
    return (url.startsWith('http://') || url.startsWith('https://')) ? url : null;
  }

  _normalizeItem(item) {
    // Log ALL fields on the first few items so we can spot portal-specific
    // stream URL fields (e.g. stream_url, link, direct_links) that STBEmu
    // might use but that we're currently discarding.
    if (this._loggedItems === undefined) this._loggedItems = 0;
    if (this._loggedItems < 3) {
      log.info(TAG, `raw VOD item fields: ${JSON.stringify(Object.keys(item))} sample=${JSON.stringify(item).slice(0, 400)}`);
      this._loggedItems++;
    }

    return {
      id:          String(item.id || ''),
      name:        item.name || item.title || '',
      description: item.description || '',
      director:    item.director || '',
      actors:      item.actors || '',
      year:        String(item.year || ''),
      country:     item.country || '',
      durationMin: parseInt(item.time || '0', 10) || 0,
      isHD:        !!item.hd,
      isFav:       !!(item.fav),
      episodes:    Array.isArray(item.series) ? item.series : [],
      screenshotUri: item.screenshot_uri || null,
      cmd:          item.cmd || '',
      // Preserve any extra streaming URL fields the portal may include
      streamUrl:    item.stream_url || item.link || item.url || null,
      added:        item.added || '',
      categoryId:   String(item.category_id || ''),
    };
  }
}

module.exports = VodManager;
