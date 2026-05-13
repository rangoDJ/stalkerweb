// ChannelManager.js
// Mirrors: ChannelManager.cpp
//
// Fetches and parses channels (GetOrderedList, GetAllChannels) and genres/groups.
// Handles pagination exactly as the C++ addon does.

'use strict';

const axios = require('axios');

class ChannelManager {
  constructor(client) {
    this.client = client;
    this._channels = [];
    this._groups = [];
  }

  // ── Load channels ──────────────────────────────────────────────────────────
  // Mirrors ChannelManager::LoadChannels()
  // First calls GetAllChannels to seed, then pages through GetOrderedList.
  async loadChannels() {
    this._channels = [];

    // Step 1: get_all_channels (seeds the basic list)
    const allData = await this.client.itvGetAllChannels();
    if (allData?.js?.data) {
      this._parseChannels(allData);
    }

    // Step 2: get_ordered_list (paginated) — genre=* (all), genre id 10
    const GENRE = '*';
    let page = 1;
    let maxPages = 1;

    do {
      const pageData = await this.client.itvGetOrderedList(GENRE, page);
      if (!pageData?.js) break;

      if (page === 1) {
        const totalItems = Number(pageData.js.total_items) || 0;
        const maxPageItems = Number(pageData.js.max_page_items) || 0;
        if (totalItems > 0 && maxPageItems > 0) {
          maxPages = Math.ceil(totalItems / maxPageItems);
        }
        console.log(`[ChannelManager] totalItems=${totalItems} maxPages=${maxPages}`);
      }

      this._parseChannels(pageData);
      page++;
    } while (page <= maxPages);

    // Deduplicate by channelId
    const seen = new Set();
    this._channels = this._channels.filter((ch) => {
      if (seen.has(ch.uniqueId)) return false;
      seen.add(ch.uniqueId);
      return true;
    });

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

      const channel = {
        uniqueId: _channelId(item.name, item.number),
        number: parseInt(item.number, 10) || 0,
        name: item.name,
        channelId: parseInt(item.id, 10) || 0,
        cmd: item.cmd || '',
        tvGenreId: item.tv_genre_id || '',
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

// Mirrors Utils::DetermineLogoURI()
function _determineLogoUri(basePath, logo) {
  if (!logo) return '';
  if (logo.startsWith('http://') || logo.startsWith('https://')) return logo;
  if (logo.startsWith('/')) return basePath.replace(/\/$/, '') + logo;
  return basePath + logo;
}

module.exports = ChannelManager;
