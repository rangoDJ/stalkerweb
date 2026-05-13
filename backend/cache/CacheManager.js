// CacheManager.js — persists portal configuration across restarts
// Mirrors the XML cache in StalkerInstance::LoadCache() / SaveCache()
// but uses a simpler JSON file format.

'use strict';

const fs = require('fs');
const path = require('path');

class CacheManager {
  constructor(dataDir) {
    this.configFile = path.join(dataDir, 'config.json');
    fs.mkdirSync(dataDir, { recursive: true });
    fs.mkdirSync(path.join(dataDir, 'cache'), { recursive: true });
  }

  load() {
    try {
      const raw = fs.readFileSync(this.configFile, 'utf8');
      return JSON.parse(raw);
    } catch (_) {
      return null;
    }
  }

  save(data) {
    try {
      fs.writeFileSync(this.configFile, JSON.stringify(data, null, 2), 'utf8');
      return true;
    } catch (e) {
      console.error('[CacheManager] save failed:', e.message);
      return false;
    }
  }

  clearAll() {
    try { fs.unlinkSync(this.configFile); } catch (_) {}
    // optionally clear EPG cache too
    const cacheDir = path.join(path.dirname(this.configFile), 'cache');
    try {
      for (const f of fs.readdirSync(cacheDir)) {
        fs.unlinkSync(path.join(cacheDir, f));
      }
    } catch (_) {}
  }
}

module.exports = CacheManager;
