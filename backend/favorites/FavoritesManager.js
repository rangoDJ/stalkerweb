'use strict';

const CacheManager = require('../cache/CacheManager');

class FavoritesManager {
  constructor(dataDir) {
    this._cache = new CacheManager(dataDir);
  }

  // ── Internal ───────────────────────────────────────────────────────────────

  _load() {
    const config = this._cache.load() || {};
    const fav = config.favorites || {};
    if (!Array.isArray(fav.channels)) fav.channels = [];
    if (!Array.isArray(fav.groups))   fav.groups   = [];
    return fav;
  }

  _save(fav) {
    const config = this._cache.load() || {};
    config.favorites = fav;
    this._cache.save(config);
  }

  // ── Channel favorites ──────────────────────────────────────────────────────

  getRaw() {
    return this._load();
  }

  getFavoriteChannelIds() {
    return this._load().channels;
  }

  isChannelFavorite(uniqueId) {
    return this._load().channels.includes(String(uniqueId));
  }

  addChannel(uniqueId) {
    const d = this._load();
    const id = String(uniqueId);
    if (!d.channels.includes(id)) {
      d.channels.push(id);
      this._save(d);
    }
  }

  removeChannel(uniqueId) {
    const d = this._load();
    d.channels = d.channels.filter(c => c !== String(uniqueId));
    this._save(d);
  }

  // ── Groups ─────────────────────────────────────────────────────────────────

  createGroup(name) {
    const d = this._load();
    const group = {
      id: `g${Date.now().toString(36)}`,
      name: String(name || 'New Group').trim(),
      channels: [],
    };
    d.groups.push(group);
    this._save(d);
    return group;
  }

  renameGroup(id, name) {
    const d = this._load();
    const g = d.groups.find(g => g.id === id);
    if (!g) return null;
    g.name = String(name || '').trim() || g.name;
    this._save(d);
    return g;
  }

  deleteGroup(id) {
    const d = this._load();
    d.groups = d.groups.filter(g => g.id !== id);
    this._save(d);
  }

  addChannelToGroup(groupId, uniqueId) {
    const d = this._load();
    const g = d.groups.find(g => g.id === groupId);
    if (!g) return null;
    const id = String(uniqueId);
    if (!g.channels.includes(id)) {
      g.channels.push(id);
      this._save(d);
    }
    return g;
  }

  removeChannelFromGroup(groupId, uniqueId) {
    const d = this._load();
    const g = d.groups.find(g => g.id === groupId);
    if (!g) return null;
    g.channels = g.channels.filter(c => c !== String(uniqueId));
    this._save(d);
    return g;
  }
}

module.exports = FavoritesManager;
