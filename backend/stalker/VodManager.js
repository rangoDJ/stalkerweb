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

  // Mirrors api.py get_vod_stream_url() + stalkerhek's parseCreateLinkVOD:
  //   Primary: create_link (type=vod) → resolve the response, which may be a
  //            direct URL (js.url / js.cmd) OR an id + play_token pair that
  //            must be assembled into a play/movie.php URL (common movie-portal
  //            form). Many portals return ONLY the token form, so handling it is
  //            required for VOD to play at all.
  //   Fallbacks: listing cmd as a direct URL → legacy movie_id probe →
  //              constructed basePath + cmd path.
  async getStreamUrl(videoId, cmd, series = 0) {
    const seriesStr = String(series);

    // Build a list of candidate cmd strings to feed create_link, most
    // specific (from the portal listing) first.
    const candidates = [];
    if (cmd) {
      candidates.push(cmd);
      if (!cmd.startsWith('/') && !cmd.startsWith('http')) {
        candidates.push(`/media/${cmd}`);
      }
    }
    candidates.push(`/media/${videoId}.mpg`);
    const uniqueCandidates = [...new Set(candidates)];

    // ── Primary: create_link, then assemble a playable URL from the response ──
    for (const candidate of uniqueCandidates) {
      try {
        log.info(TAG, `VOD create_link for candidate: ${candidate}`);
        let r = await this.client._stalkerCall({
          type:   'vod',
          action: 'create_link',
          cmd:    candidate,
          series: seriesStr,
        });
        let url = this._resolveCreateLink(r?.js);

        if (!url) {
          log.debug(TAG, `create_link empty for "${candidate}", retrying with forced_storage…`);
          r = await this.client._stalkerCall({
            type:   'vod',
            action: 'create_link',
            cmd:    candidate,
            series: seriesStr,
            forced_storage: 'undefined',
            disable_ad: '0',
          });
          url = this._resolveCreateLink(r?.js);
        }

        if (url) {
          log.info(TAG, `VOD stream resolved for "${candidate}": ${url.slice(0, 80)}…`);
          return url;
        }
      } catch (e) {
        log.warn(TAG, `create_link failed for candidate "${candidate}": ${e.message}`);
      }
    }

    // ── Fallback 1: listing cmd is already a playable URL ──
    if (cmd) {
      const direct = this._extractUrl(cmd);
      if (direct) {
        log.info(TAG, `VOD stream resolved (direct listing url): ${direct.slice(0, 80)}…`);
        return direct;
      }
    }

    // ── Fallback 2: legacy play/movie.php?movie_id probe (older portals) ──
    // Demoted below create_link so it no longer adds a 10s timeout to every
    // successful play — only runs when create_link yields nothing.
    try {
      const playUrl = `${this.client.basePath}play/movie.php?movie_id=${videoId}`;
      log.info(TAG, `VOD legacy probe via play/movie.php?movie_id: ${playUrl}`);
      const response = await this.client.http.get(playUrl, {
        headers: this.client._buildHeaders(),
        timeout: 10000,
        maxRedirects: 10,
        validateStatus: (status) => status < 400,
      });

      const resolvedUrl = response.request?.res?.responseUrl || response.headers['location'];
      if (resolvedUrl && resolvedUrl !== playUrl && resolvedUrl.startsWith('http')) {
        log.info(TAG, `VOD resolved via movie_id redirect: ${resolvedUrl.slice(0, 80)}…`);
        return resolvedUrl;
      }

      const data = response.data;
      if (data) {
        const extracted = typeof data === 'string'
          ? this._extractUrl(data)
          : this._extractUrl(data.cmd || data.url);
        if (extracted) {
          log.info(TAG, `VOD resolved via movie_id data: ${extracted.slice(0, 80)}…`);
          return extracted;
        }
      }
    } catch (e) {
      log.warn(TAG, `legacy movie_id probe failed: ${e.message}`);
    }

    // ── Fallback 3: construct absolute URL from portal basePath + cmd ──
    // Some portals return "nothing_to_play" for create_link but serve the
    // /media/{id}.mpg path directly (authenticated via session cookies).
    const relCmd = cmd || `/media/${videoId}.mpg`;
    const base   = (this.client?.basePath || '').replace(/\/$/, '');
    if (base.startsWith('http')) {
      const constructed = base + '/' + relCmd.replace(/^\//, '');
      log.info(TAG, `VOD stream resolved (constructed basePath+cmd): ${constructed.slice(0, 80)}…`);
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

  // Resolve a playable URL from a create_link js response.
  // Handles the three portal variants, matching stalkerhek's parseCreateLinkVOD:
  //   1. js.url / js.cmd / bare-string js — a direct http(s) URL
  //   2. js.id + js.play_token — assemble a play/movie.php URL (the common
  //      movie-portal form, where cmd carries no playable URL)
  _resolveCreateLink(js) {
    if (!js) return null;

    // Bare string response — treat as a cmd.
    if (typeof js === 'string') return this._extractUrl(js);

    // 1. Direct URL in js.url or js.cmd.
    const direct = this._extractUrl(js.url) || this._extractUrl(js.cmd);
    if (direct) return direct;

    // 2. id + play_token → play/movie.php gateway URL.
    return this._buildMoviePhpUrl(js);
  }

  // Build a play/movie.php URL from a create_link response's id + play_token.
  // Mirrors stalkerhek's buildMoviePlayURL():
  //   {basePath}play/movie.php?mac=<mac>&stream=<id|+.mp4>&play_token=<token>&type=vod
  _buildMoviePhpUrl(js) {
    const mac   = this.client?.identity?.mac;
    const token = js.play_token != null ? String(js.play_token).trim() : '';
    let stream  = js.id != null ? String(js.id).trim() : '';
    if (!mac || !token || !stream) return null;

    // Portal expects a filename; append .mp4 when the id has no extension.
    if (!stream.includes('.')) stream += '.mp4';

    const base = (this.client?.basePath || '').replace(/\/$/, '');
    if (!base.startsWith('http')) return null;

    const params = new URLSearchParams({
      mac,
      stream,
      play_token: token,
      type: 'vod',
    });
    return `${base}/play/movie.php?${params.toString()}`;
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
      log.debug(TAG, `raw VOD item fields: ${JSON.stringify(Object.keys(item))} sample=${JSON.stringify(item).slice(0, 400)}`);
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
      cmd:          item.cmd || item.path || '',
      // Preserve any extra streaming URL fields the portal may include
      streamUrl:    item.stream_url || item.link || item.url || null,
      added:        item.added || '',
      categoryId:   String(item.category_id || ''),
    };
  }
}

module.exports = VodManager;
