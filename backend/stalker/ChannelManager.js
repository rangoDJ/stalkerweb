// ChannelManager.js
// Mirrors: ChannelManager.cpp
//
// Fetches and parses channels (GetOrderedList, GetAllChannels) and genres/groups.
// Handles pagination exactly as the C++ addon does.

'use strict';

const log = require('../logger');
const TAG = 'ChannelManager';

class ChannelManager {
  constructor(client) {
    this.client = client;
    this._channels = [];
    this._channelIndex = new Map();   // uniqueId → channel, for O(1) lookups
    this._groups = [];
    this._genreMap = new Map();
    this._loadGroupsPromise = null;    // deduplicates concurrent loadGroups calls
    this._loadChannelsPromise = null;  // deduplicates concurrent loadChannels calls
    this._progress = { loading: false, page: 0, totalPages: 0, channelCount: 0 };
    this._health = new Map();          // uniqueId → { errors, lastError }
    this._resolvedCache = new Map();   // cmd → { value:{url,type}, expires } — bridges /api/stream → /proxy/stream
  }

  getProgress() { return { ...this._progress }; }

  // ── Stream health tracking ────────────────────────────────────────────────────
  recordStreamError(uniqueId) {
    const key = String(uniqueId);
    const entry = this._health.get(key) || { errors: 0, lastError: null };
    entry.errors++;
    entry.lastError = new Date().toISOString();
    this._health.set(key, entry);
  }

  recordStreamSuccess(uniqueId) {
    this._health.delete(String(uniqueId)); // clear errors on success
  }

  getHealth() {
    const result = {};
    for (const [k, v] of this._health) result[k] = v;
    return result;
  }

  // ── Load channels ──────────────────────────────────────────────────────────
  // Deduplicates concurrent calls — only one fetch runs at a time.
  // Callers that arrive while a load is in progress wait on the same promise
  // instead of resetting _channels and starting a second concurrent fetch.
  loadChannels() {
    if (!this._loadChannelsPromise) {
      this._loadChannelsPromise = this._doLoadChannels().finally(() => {
        this._loadChannelsPromise = null;
      });
    }
    return this._loadChannelsPromise;
  }

  // Mirrors ChannelManager::LoadChannels()
  // First calls GetAllChannels to seed, then pages through GetOrderedList.
  async _doLoadChannels() {
    this._channels = [];
    this._channelIndex = new Map();   // reset so stale entries don't linger during reload
    this._progress = { loading: true, page: 0, totalPages: 0, channelCount: 0 };

    // Load groups first so genre names can be resolved during channel parsing.
    // Always reload groups alongside channels so they stay in sync.
    await this.loadGroups();
    this._genreMap = new Map(this._groups.map((g) => [String(g.id), g.name]));

    // Step 1: get_all_channels (seeds the basic list)
    const allData = await this.client.itvGetAllChannels();
    if (allData?.js?.data) {
      this._parseChannels(allData);
    }

    // Step 2: get_ordered_list (paginated, concurrent)
    const GENRE = '*';
    const MAX_CONCURRENT = 10;

    const page1 = await this.client.itvGetOrderedList(GENRE, 1);
    if (page1?.js) {
      const totalItems   = Number(page1.js.total_items)    || 0;
      const maxPageItems = Number(page1.js.max_page_items) || 0;
      const maxPages     = totalItems > 0 && maxPageItems > 0
        ? Math.ceil(totalItems / maxPageItems)
        : 1;
      log.info(TAG, `fetching ${totalItems} channels across ${maxPages} page${maxPages !== 1 ? 's' : ''}…`);
      this._progress.totalPages = maxPages;
      this._progress.page = 1;
      this._parseChannels(page1);
      this._progress.channelCount = this._channels.length;

      if (maxPages > 1) {
        const pages = Array.from({ length: maxPages - 1 }, (_, i) => i + 2);
        const semaphore = new _Semaphore(MAX_CONCURRENT);
        await Promise.all(pages.map(async (p) => {
          await semaphore.acquire();
          try {
            const data = await this.client.itvGetOrderedList(GENRE, p);
            if (data?.js) this._parseChannels(data);
          } catch (e) {
            log.warn(TAG, `page ${p} failed: ${e.message}`);
          } finally {
            this._progress.page = Math.max(this._progress.page, p);
            this._progress.channelCount = this._channels.length;
            semaphore.release();
          }
        }));
      }
    }

    // Deduplicate by channelId
    const seen = new Set();
    this._channels = this._channels.filter((ch) => {
      if (seen.has(ch.uniqueId)) return false;
      seen.add(ch.uniqueId);
      return true;
    });

    this._progress = { loading: false, page: this._progress.totalPages, totalPages: this._progress.totalPages, channelCount: this._channels.length };
    // Build O(1) lookup index
    this._channelIndex = new Map(this._channels.map((c) => [String(c.uniqueId), c]));
    const withGenre = this._channels.filter((c) => c.genre).length;
    log.info(TAG, `loaded ${this._channels.length} channels (${withGenre} with genre, ${this._groups.length} groups)`);
    if (this._channels.length > 0) {
      const s = this._channels[0];
      log.debug(TAG, `sample channel: name=${s.name} genreId=${JSON.stringify(s.genreId)} genre=${JSON.stringify(s.genre)}`);
    }
    return this._channels;
  }

  // ── Parse channel JSON ─────────────────────────────────────────────────────
  // Mirrors ChannelManager::ParseChannels()
  _parseChannels(parsed) {
    const data = parsed?.js?.data;
    if (!data) return;

    const items = Array.isArray(data) ? data : Object.values(data);
    for (const item of items) {
      if (!item?.name) continue;

      const rawGenreId = item.tv_genre_id || '';
      const channel = {
        uniqueId: String(_channelId(item.name, item.number)),
        number: parseInt(item.number, 10) || 0,
        name: item.name,
        channelId: parseInt(item.id, 10) || 0,
        cmd: item.cmd || '',
        genreId: rawGenreId,
        genre: (this._genreMap?.get(rawGenreId) || null),
        iconPath: _determineLogoUri(this.client.getBasePath(), item.logo || ''),
        useHttpTmpLink: !!parseInt(item.use_http_tmp_link, 10),
        useLoadBalancing: !!parseInt(item.use_load_balancing, 10),
      };

      this._channels.push(channel);
      // Keep index in sync as each page arrives so getChannel() works
      // immediately — even while loading is still in progress.
      this._channelIndex.set(channel.uniqueId, channel);
    }
  }

  // ── Load groups (genres) ───────────────────────────────────────────────────
  // Mirrors ChannelManager::LoadChannelGroups()
  // Deduplicates concurrent calls — only one fetch runs at a time.
  loadGroups() {
    if (!this._loadGroupsPromise) {
      this._loadGroupsPromise = this._doLoadGroups().finally(() => {
        this._loadGroupsPromise = null;
      });
    }
    return this._loadGroupsPromise;
  }

  async _doLoadGroups() {
    this._groups = [];
    const data = await this.client.itvGetGenres();
    if (!data?.js) return this._groups;

    const items = Array.isArray(data.js) ? data.js : Object.values(data.js);
    for (const item of items) {
      if (!item?.title) continue;
      const name = item.title.charAt(0).toUpperCase() + item.title.slice(1);
      this._groups.push({
        id: item.id || '',
        name,
        alias: item.alias || '',
      });
    }

    log.info(TAG, `loaded ${this._groups.length} groups`);
    if (this._groups.length > 0) {
      log.debug(TAG, `sample groups: ${JSON.stringify(this._groups.slice(0, 3))}`);
    }
    return this._groups;
  }

  getChannels() { return this._channels; }
  getGroups() { return this._groups; }

  getChannel(uniqueId) {
    return this._channelIndex.get(String(uniqueId)) ?? null;
  }

  // Resolves to the channel as soon as it is indexed, or null on timeout.
  // Handles the post-reconnect race where channelManager is empty while
  // the first page of channels is still loading from the portal.
  async waitForChannel(uniqueId, timeoutMs = 10_000) {
    const id = String(uniqueId);

    // Fast path — already in index
    const immediate = this._channelIndex.get(id);
    if (immediate) return immediate;

    // If the list is empty and not loading, trigger a background load now
    if (this._channels.length === 0 && !this._progress.loading) {
      log.info(TAG, `waitForChannel: channel list empty — triggering background load`);
      this.loadChannels().catch(e => log.warn(TAG, `triggered load failed: ${e.message}`));
    }

    // Poll until the channel appears or loading finishes (or we time out)
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline && this._progress.loading) {
      await new Promise(r => setTimeout(r, 500));
      const found = this._channelIndex.get(id);
      if (found) return found;
    }

    return this._channelIndex.get(id) ?? null;
  }

  // ── Stream resolution (cached) ────────────────────────────────────────────
  // Resolves a channel to a playable URL + a stream-type hint, caching the
  // result briefly so /api/stream (type hint for the player) and the subsequent
  // /proxy/stream fetch share ONE create_link call — exactly like a STB, which
  // calls create_link once per zap. Keyed by cmd so catch-up/archive (which
  // mutates cmd) and live get separate entries.
  async resolveStream(channel) {
    const key = channel.cmd || String(channel.uniqueId);
    const cached = this._resolvedCache.get(key);
    if (cached && cached.expires > Date.now()) return cached.value;

    let url;
    if ((channel.cmd || '').includes('matrix')) {
      // Matrix channels resolve through the portal's matrix.php, not create_link.
      const raw = await this.client.resolveMatrixUrl(channel.cmd);
      url = this._rewriteLocalhost(_extractUrl(raw || ''));
    } else {
      url = await this.getStreamUrl(channel);
    }

    const value = { url, type: classifyStreamType(url) };
    // Short TTL: long enough to bridge the type-hint → fetch handoff within one
    // zap, short enough that a re-zap re-tokenizes (live temp links are themselves
    // short-lived).
    this._resolvedCache.set(key, { value, expires: Date.now() + 15_000 });
    return value;
  }

  // ── Stream URL resolution ─────────────────────────────────────────────────
  // Native STBemu behavior: call create_link for EVERY channel zap — not only
  // when use_http_tmp_link/use_load_balancing are set. The portal re-tokenizes
  // the link on every play (temp-link tokens, load-balancer host, CDN auth), so
  // playing channel.cmd directly serves a stale/un-tokenized URL that some
  // portals reject with 403 even though the channel plays fine in STBemu.
  // Falls back to the static channel.cmd only if create_link yields nothing.
  async getStreamUrl(channel) {
    let cmd = '';
    try {
      const linkData = await this.client.itvCreateLink(channel.cmd);
      log.debug(TAG, `ch ${channel.number}: create_link raw js=${JSON.stringify(linkData?.js)}`);
      // Portals differ: some use js.cmd, others js.url, some return js as a string
      if (linkData?.js?.cmd) {
        cmd = linkData.js.cmd;
      } else if (linkData?.js?.url) {
        cmd = linkData.js.url;
      } else if (typeof linkData?.js === 'string' && linkData.js) {
        cmd = linkData.js;
      } else {
        log.warn(TAG, `ch ${channel.number}: create_link returned no recognisable cmd field, raw js=${JSON.stringify(linkData?.js)}`);
      }
    } catch (e) {
      log.warn(TAG, `ch ${channel.number}: create_link threw (${e.message}), falling back to direct cmd`);
    }

    if (!cmd) {
      log.warn(TAG, `ch ${channel.number}: create_link yielded no cmd, falling back to channel.cmd="${channel.cmd}"`);
      cmd = channel.cmd;
    }

    // cmd format: "ffrt<n> <url>" / "ffmpeg <url>" / "auto <url>" → url after first space
    const url = this._rewriteLocalhost(_extractUrl(cmd));
    log.debug(TAG, `ch ${channel.number}: extracted url="${url || '(empty)'}"`);
    return url;
  }

  // Stalker portals sometimes return a stream whose host is localhost/127.0.0.1
  // (the portal proxies it on its own box). A remote client must rewrite that to
  // the portal's public host — STBemu and pvr.stalker/stalkerhek all do this.
  _rewriteLocalhost(url) {
    if (!url || !/^https?:\/\//i.test(url)) return url;
    try {
      const u = new URL(url);
      if (u.hostname === 'localhost' || u.hostname === '127.0.0.1' || u.hostname === '0.0.0.0') {
        const portal = new URL(this.client.getBasePath());
        u.protocol = portal.protocol;
        u.host = portal.host;
        const rewritten = u.toString();
        log.info(TAG, `rewrote localhost stream host → ${portal.host}`);
        return rewritten;
      }
    } catch { /* not a parseable URL — leave as-is */ }
    return url;
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

// Strip the leading "solution" token from a Stalker cmd:
//   "ffrt2 http://..."  → "http://..."
//   "ffmpeg http://..." → "http://..."
//   "http://..."        → "http://..."  (no token)
function _extractUrl(cmd) {
  if (!cmd) return '';
  const sp = cmd.indexOf(' ');
  return (sp !== -1 ? cmd.slice(sp + 1) : cmd).trim();
}

// Classify a resolved stream URL so the player can pick the right engine:
//   'hls'         → HLS playlist (hls.js)
//   'mpegts'      → raw MPEG-TS over HTTP (mpegts.js — what a STB feeds to ffmpeg)
//   'native'      → progressive MP4/MKV/etc (native <video>)
//   'unsupported' → udp/rtp/rtsp — a browser cannot fetch these without a
//                   server-side ffmpeg remux (not implemented)
function classifyStreamType(url) {
  if (!url) return 'unsupported';
  const lower = url.toLowerCase();
  if (/^(udp|rtp|rtsp|mc|igmp):\/\//.test(lower)) return 'unsupported';
  const path = lower.split('?')[0].split('#')[0];
  if (/\.(m3u8|m3u)$/.test(path)) return 'hls';
  if (/\.(mp4|mkv|mov|avi|webm)$/.test(path)) return 'native';
  if (/\.(ts|mpegts|mpg|mpeg)$/.test(path)) return 'mpegts';
  // Raw MPEG-TS gateways commonly expose multicast over HTTP as /udp/239.x or /rtp/
  if (/\/(udp|rtp)\//.test(path)) return 'mpegts';
  // Unknown/extensionless — most Stalker live links are HLS; default there. The
  // proxy sniffs the actual bytes regardless, and the player falls back if wrong.
  return 'hls';
}

// Mirrors ChannelManager::GetChannelId() — djb2 hash of name+number
function _channelId(name, number) {
  const str = String(name) + String(number);
  let id = 0;
  for (let i = 0; i < str.length; i++) {
    id = ((id << 5) + id) + str.charCodeAt(i); // id * 33 + c
    id = id & id; // force 32-bit
  }
  return Math.abs(id);
}

class _Semaphore {
  constructor(max) { this._max = max; this._count = 0; this._queue = []; }
  acquire() {
    return new Promise((resolve) => {
      if (this._count < this._max) { this._count++; resolve(); }
      else this._queue.push(resolve);
    });
  }
  release() {
    this._count--;
    if (this._queue.length) { this._count++; this._queue.shift()(); }
  }
}

// Mirrors Utils::DetermineLogoURI()
function _determineLogoUri(basePath, logo) {
  if (!logo) return '';
  if (logo.startsWith('http://') || logo.startsWith('https://')) return logo;
  if (logo.startsWith('/')) return basePath.replace(/\/$/, '') + logo;
  return basePath + logo;
}

module.exports = ChannelManager;
module.exports.classifyStreamType = classifyStreamType;
