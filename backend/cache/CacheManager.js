// CacheManager.js — persists portal configuration across restarts

'use strict';

const fs = require('fs');
const path = require('path');
const log = require('../logger');
const TAG = 'CacheManager';

// Java String.hashCode() — matches STBEmu's stalker_HASH key naming convention.
// Portal URL is normalised (strip trailing /c/) so "http://host/c/" and
// "http://host/" produce the same key, matching STBEmu's portal_url field.
function portalHash(url) {
  const normalised = String(url).trim().replace(/\/c\/?$/, '/');
  let h = 0;
  for (let i = 0; i < normalised.length; i++) {
    h = (Math.imul(31, h) + normalised.charCodeAt(i)) | 0;
  }
  return h; // signed 32-bit int
}

function tokenKey(url) {
  return `stalker_${portalHash(url)}`;
}

class CacheManager {
  constructor(dataDir) {
    this.configFile = path.join(dataDir, 'config.json');
    fs.mkdirSync(dataDir, { recursive: true });
    fs.mkdirSync(path.join(dataDir, 'cache'), { recursive: true });
  }

  load() {
    try {
      const raw = fs.readFileSync(this.configFile, 'utf8');
      const data = JSON.parse(raw);

      // Log all stored stalker tokens
      const keys = Object.keys(data).filter((k) => k.startsWith('stalker_'));
      if (keys.length) {
        log.info(TAG, `stored tokens (${keys.length}):`);
        for (const k of keys) {
          const t = data[k]?.token || '?';
          log.info(TAG, `  ${k} → ${t}`);
        }
      }

      return data;
    } catch (_) {
      return null;
    }
  }

  save(data) {
    try {
      const tmp = this.configFile + '.tmp';
      fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8');
      fs.renameSync(tmp, this.configFile);
      log.info(TAG, `config saved → ${this.configFile}`);
      return true;
    } catch (e) {
      log.error(TAG, `save failed: ${e.message}`);
      return false;
    }
  }

  // Save or update just the token for a portal URL without touching other fields.
  // Stores under stalker_HASH (STBEmu-compatible) AND the legacy `token` field.
  saveToken(portalUrl, token) {
    if (!token) return false;
    const key = tokenKey(portalUrl);
    const existing = this.load() || {};
    existing[key] = { token };
    existing.token = token;
    log.info(TAG, `token saved: ${key} → ${token}`);
    return this.save(existing);
  }

  // Retrieve token for a portal URL — checks stalker_HASH first, falls back to
  // legacy `token` field so old configs still work.
  getToken(portalUrl) {
    const data = this.load();
    if (!data) return null;
    const key = tokenKey(portalUrl);
    if (data[key]?.token) {
      log.info(TAG, `token loaded: ${key} → ${data[key].token}`);
      return data[key].token;
    }
    if (data.token) {
      log.info(TAG, `token loaded (legacy field): ${data.token}`);
      return data.token;
    }
    return null;
  }

  // Save the portal-returned signature to config (distinct from user-configured signature).
  savePortalSignature(sig) {
    if (!sig) return false;
    const existing = this.load() || {};
    existing.portal_signature = sig;
    log.info(TAG, `portal_signature saved: ${sig}`);
    return this.save(existing);
  }

  clearAll() {
    try { fs.unlinkSync(this.configFile); } catch (_) {}
    const cacheDir = path.join(path.dirname(this.configFile), 'cache');
    try {
      for (const f of fs.readdirSync(cacheDir)) {
        fs.unlinkSync(path.join(cacheDir, f));
      }
    } catch (_) {}
  }
}

module.exports = CacheManager;
