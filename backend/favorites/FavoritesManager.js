'use strict';

// FavoritesManager — persists favorites to data/favorites.json, completely
// isolated from the portal auth config. Migrates automatically from the old
// config.json location on first run.

const fs  = require('fs');
const path = require('path');
const log  = require('../logger');
const TAG  = 'FavoritesManager';

class FavoritesManager {
  constructor(dataDir) {
    this._file       = path.join(dataDir, 'favorites.json');
    this._legacyFile = path.join(dataDir, 'config.json');
    fs.mkdirSync(dataDir, { recursive: true });
    this._migrate();
  }

  // One-time migration: copy favorites out of config.json into favorites.json.
  _migrate() {
    if (fs.existsSync(this._file)) return;
    try {
      const config = JSON.parse(fs.readFileSync(this._legacyFile, 'utf8'));
      if (config?.favorites) {
        const tmp = this._file + '.tmp';
        fs.writeFileSync(tmp, JSON.stringify(config.favorites, null, 2), 'utf8');
        fs.renameSync(tmp, this._file);
        log.info(TAG, 'migrated favorites from config.json → favorites.json');
      }
    } catch (_) {
      // No config.json or no favorites — start fresh
    }
  }

  _load() {
    try {
      const raw = JSON.parse(fs.readFileSync(this._file, 'utf8'));
      if (!Array.isArray(raw.channels)) raw.channels = [];
      if (!Array.isArray(raw.groups))   raw.groups   = [];
      return raw;
    } catch (_) {
      return { channels: [], groups: [] };
    }
  }

  _save(fav) {
    try {
      const tmp = this._file + '.tmp';
      fs.writeFileSync(tmp, JSON.stringify(fav, null, 2), 'utf8');
      fs.renameSync(tmp, this._file);
    } catch (e) {
      log.error(TAG, `save failed: ${e.message}`);
    }
  }

  // ── Channel favorites ──────────────────────────────────────────────────────

  getRaw() { return this._load(); }

  getFavoriteChannelIds() { return this._load().channels; }

  isChannelFavorite(uniqueId) {
    return this._load().channels.includes(String(uniqueId));
  }

  addChannel(uniqueId) {
    const d = this._load();
    const id = String(uniqueId);
    if (!d.channels.includes(id)) { d.channels.push(id); this._save(d); }
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
    if (!g.channels.includes(id)) { g.channels.push(id); this._save(d); }
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

  reorderChannels(orderedIds) {
    const d = this._load();
    const idSet = new Set(orderedIds.map(String));
    const rest  = d.channels.filter(id => !idSet.has(String(id)));
    d.channels  = [...orderedIds.map(String).filter(id => d.channels.includes(id)), ...rest];
    this._save(d);
  }

  reorderGroups(orderedIds) {
    const d      = this._load();
    const map    = new Map(d.groups.map(g => [g.id, g]));
    const reordered = orderedIds.map(id => map.get(id)).filter(Boolean);
    const rest   = d.groups.filter(g => !orderedIds.includes(g.id));
    d.groups     = [...reordered, ...rest];
    this._save(d);
  }
}

module.exports = FavoritesManager;
