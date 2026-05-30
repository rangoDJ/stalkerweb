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
    this._loadGroupsPromise = null;   // deduplicates concurrent loadGroups calls
    this._progress = { loading: false, page: 0, totalPages: 0, channelCount: 0 };
  }

  getProgress() { return { ...this._progress }; }

  // ── Load channels ──────────────────────────────────────────────────────────
  // Mirrors ChannelManager::LoadChannels()
  // First calls GetAllChannels to seed, then pages through GetOrderedList.
  async loadChannels() {
    this._channels = [];
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

  // ── Stream URL resolution ─────────────────────────────────────────────────
  // Mirrors ChannelManager::GetStreamURL() + ParseStreamCmd()
  async getStreamUrl(channel) {
    let cmd = '';
    let usedCreateLink = false;

    if (channel.useHttpTmpLink || channel.useLoadBalancing) {
      usedCreateLink = true;
      log.info(TAG, `ch ${channel.number}: create_link path (useHttpTmpLink=${channel.useHttpTmpLink} useLoadBalancing=${channel.useLoadBalancing})`);
      try {
        const linkData = await this.client.itvCreateLink(channel.cmd);
        log.debug(TAG, `ch ${channel.number}: create_link raw js=${JSON.stringify(linkData?.js)}`);

        // Portals differ: some use js.cmd, others js.url, some return js as a string
        if (linkData?.js?.cmd) {
          cmd = linkData.js.cmd;
          log.debug(TAG, `ch ${channel.number}: picked js.cmd="${cmd}"`);
        } else if (linkData?.js?.url) {
          cmd = linkData.js.url;
          log.debug(TAG, `ch ${channel.number}: picked js.url="${cmd}"`);
        } else if (typeof linkData?.js === 'string' && linkData.js) {
          cmd = linkData.js;
          log.debug(TAG, `ch ${channel.number}: picked js (string)="${cmd}"`);
        } else {
          log.warn(TAG, `ch ${channel.number}: create_link returned no recognisable cmd field, raw js=${JSON.stringify(linkData?.js)}`);
        }
      } catch (e) {
        log.warn(TAG, `ch ${channel.number}: create_link threw (${e.message}), falling back to direct cmd`);
      }
      if (!cmd) {
        log.warn(TAG, `ch ${channel.number}: create_link yielded empty cmd, falling back to channel.cmd="${channel.cmd}"`);
        cmd = channel.cmd;
      }
    } else {
      log.debug(TAG, `ch ${channel.number}: direct cmd path, cmd="${channel.cmd}"`);
      cmd = channel.cmd;
    }

    // cmd format: "ffrt<n> <url>" → extract url after first space
    const spacePos = cmd.indexOf(' ');
    const url = spacePos !== -1 ? cmd.slice(spacePos + 1) : cmd;
    log.debug(TAG, `ch ${channel.number}: extracted url="${url || '(empty)'}"`);

    // Last-resort: if direct cmd gave no URL, try create_link regardless of flags.
    // Some portals require dynamic link creation for all channels even when
    // use_http_tmp_link=0 and use_load_balancing=0.
    // Guard: skip if we already called create_link above to avoid a redundant duplicate call.
    if (!url && channel.cmd && !usedCreateLink) {
      log.warn(TAG, `ch ${channel.number}: direct cmd yielded no url, trying create_link as last resort`);
      try {
        const linkData = await this.client.itvCreateLink(channel.cmd);
        log.debug(TAG, `ch ${channel.number}: last-resort create_link raw js=${JSON.stringify(linkData?.js)}`);
        const fallbackCmd = linkData?.js?.cmd || linkData?.js?.url
          || (typeof linkData?.js === 'string' ? linkData.js : '') || '';
        if (fallbackCmd) {
          const sp = fallbackCmd.indexOf(' ');
          const fallbackUrl = sp !== -1 ? fallbackCmd.slice(sp + 1) : fallbackCmd;
          log.info(TAG, `ch ${channel.number}: last-resort create_link resolved url="${fallbackUrl}"`);
          return fallbackUrl;
        }
        log.warn(TAG, `ch ${channel.number}: last-resort create_link also returned no url`);
      } catch (e) {
        log.warn(TAG, `ch ${channel.number}: last-resort create_link threw: ${e.message}`);
      }
    }

    return url;
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

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
