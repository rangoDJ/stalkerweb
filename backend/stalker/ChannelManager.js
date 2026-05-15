// ChannelManager.js
// Mirrors: ChannelManager.cpp
//
// Fetches and parses channels (GetOrderedList, GetAllChannels) and genres/groups.
// Handles pagination exactly as the C++ addon does.

'use strict';

class ChannelManager {
  constructor(client) {
    this.client = client;
    this._channels = [];
    this._groups = [];
    this._progress = { loading: false, page: 0, totalPages: 0, channelCount: 0 };
  }

  getProgress() { return { ...this._progress }; }

  // ── Load channels ──────────────────────────────────────────────────────────
  // Mirrors ChannelManager::LoadChannels()
  // First calls GetAllChannels to seed, then pages through GetOrderedList.
  async loadChannels() {
    this._channels = [];
    this._progress = { loading: true, page: 0, totalPages: 0, channelCount: 0 };

    // Load groups first so genre names can be resolved during channel parsing
    if (this._groups.length === 0) await this.loadGroups();
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
      console.log(`[ChannelManager] totalItems=${totalItems} maxPages=${maxPages}`);
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
            console.warn(`[ChannelManager] page ${p} failed: ${e.message}`);
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
    console.log(`[ChannelManager] loaded ${this._channels.length} channels`);
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
  async loadGroups() {
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

    console.log(`[ChannelManager] loaded ${this._groups.length} groups`);
    return this._groups;
  }

  getChannels() { return this._channels; }
  getGroups() { return this._groups; }

  getChannel(uniqueId) {
    return this._channels.find((c) => c.uniqueId === uniqueId) || null;
  }

  // ── Stream URL resolution ─────────────────────────────────────────────────
  // Mirrors ChannelManager::GetStreamURL() + ParseStreamCmd()
  async getStreamUrl(channel) {
    let cmd = '';

    if (channel.useHttpTmpLink || channel.useLoadBalancing) {
      console.log(`[ChannelManager] getting temp stream url for ch ${channel.number}`);
      const linkData = await this.client.itvCreateLink(channel.cmd);
      cmd = linkData?.js?.cmd || '';
    } else {
      cmd = channel.cmd;
    }

    // cmd format: "ffrt<n> <url>" → extract url after space
    const spacePos = cmd.indexOf(' ');
    return spacePos !== -1 ? cmd.slice(spacePos + 1) : cmd;
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
