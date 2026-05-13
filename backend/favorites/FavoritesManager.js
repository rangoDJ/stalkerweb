'use strict';

const fs   = require('fs');
const path = require('path');

class FavoritesManager {
  constructor(dataDir) {
    this._file = path.join(dataDir, 'favorites.json');
    this._data = null;
  }

  // ── Internal ───────────────────────────────────────────────────────────────

  _load() {
    if (this._data) return this._data;
    try {
      this._data = JSON.parse(fs.readFileSync(this._file, 'utf8'));
      // Migrate: ensure arrays exist
      if (!Array.isArray(this._data.channels)) this._data.channels = [];
      if (!Array.isArray(this._data.groups))   this._data.groups   = [];
    } catch {
      this._data = { channels: [], groups: [] };
    }
    return this._data;
  }

  _save() {
    try {
      fs.writeFileSync(this._file, JSON.stringify(this._data, null, 2), 'utf8');
    } catch (e) {
      console.error('[favorites] save failed:', e.message);
    }
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
      this._save();
    }
  }

  removeChannel(uniqueId) {
    const d = this._load();
    const id = String(uniqueId);
    d.channels = d.channels.filter(c => c !== id);
    this._save();
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
    this._save();
    return group;
  }

  renameGroup(id, name) {
    const g = this._load().groups.find(g => g.id === id);
    if (!g) return null;
    g.name = String(name || '').trim() || g.name;
    this._save();
    return g;
  }

  deleteGroup(id) {
    const d = this._load();
    d.groups = d.groups.filter(g => g.id !== id);
    this._save();
  }

  addChannelToGroup(groupId, uniqueId) {
    const g = this._load().groups.find(g => g.id === groupId);
    if (!g) return null;
    const id = String(uniqueId);
    if (!g.channels.includes(id)) {
      g.channels.push(id);
      this._save();
    }
    return g;
  }

  removeChannelFromGroup(groupId, uniqueId) {
    const g = this._load().groups.find(g => g.id === groupId);
    if (!g) return null;
    const id = String(uniqueId);
    g.channels = g.channels.filter(c => c !== id);
    this._save();
    return g;
  }
}

module.exports = FavoritesManager;
