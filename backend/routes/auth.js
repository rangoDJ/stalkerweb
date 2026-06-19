// routes/auth.js
// POST   /api/auth/connect          — initialise portal connection
// GET    /api/auth/status           — check session state
// GET    /api/auth/config           — return saved config for WebUI pre-fill
// DELETE /api/auth/disconnect       — tear down session
// POST   /api/auth/reconnect        — re-connect using saved config
// GET    /api/auth/profiles         — list saved profiles
// POST   /api/auth/profiles         — save current config as named profile { name }
// PUT    /api/auth/profiles/:name   — activate a profile (reconnect with it)
// DELETE /api/auth/profiles/:name   — delete a profile

'use strict';

const express = require('express');
const { StalkerClient } = require('../stalker/StalkerClient');
const SessionManager = require('../stalker/SessionManager');
const ChannelManager = require('../stalker/ChannelManager');
const GuideManager   = require('../stalker/GuideManager');
const VodManager     = require('../stalker/VodManager');
const { createIdentity } = require('../stalker/identity');
const { DEVICE_PROFILE } = require('../stalker/deviceProfile');
const CacheManager = require('../cache/CacheManager');
const log = require('../logger');
const rateLimit = require('express-rate-limit');
const { connectRules } = require('../middleware/validate');
const TAG = 'auth';

// Rate limiters
const connectLimiter = rateLimit({
  windowMs: 60_000,
  max: 5,
  message: { error: 'Too many connect attempts. Try again in 1 minute.' },
  standardHeaders: true,
  legacyHeaders: false,
});

const reconnectLimiter = rateLimit({
  windowMs: 60_000,
  max: 10,
  message: { error: 'Too many reconnect attempts. Try again in 1 minute.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Ensure portal URL always ends with /c/
function normalizePortal(url) {
  return String(url).trim().replace(/\/c\/?$/, '').replace(/\/?$/, '') + '/c/';
}

module.exports = function authModule(appState, config) {
  const router = express.Router();
  const cache = new CacheManager(config.dataDir);

  // ── Shared connect logic ───────────────────────────────────────────────────
  async function connectPortal(body) {
    const {
      portal,
      mac,
      timezone,
      lang,
      login,
      password,
      token,
      serial_number,
      device_id,
      device_id2,
      signature,
      portal_signature,
      connection_timeout,
    } = body;

    if (!portal) throw new Error('portal URL is required');
    if (!mac)    throw new Error('MAC address is required');

    const portalUrl = normalizePortal(portal);
    log.info(TAG, `connectPortal: portal=${portalUrl} mac=${mac} timezone=${timezone || 'Europe/London'}`);

    // Tear down existing session
    if (appState.sessionManager) {
      log.info(TAG, 'tearing down existing session');
      appState.sessionManager.destroy();
      appState.sessionManager = null;
      appState.client = null;
      appState.channelManager = null;
      appState.guideManager = null;
      appState.vodManager = null;
      appState.identity = null;
    }

    // Resolve token: prefer the stalker_HASH entry saved for this portal over
    // any token passed in the request body — the saved one is the most recent.
    const savedToken = cache.getToken(portalUrl);
    const resolvedToken = savedToken || token || '';
    log.info(TAG, `token resolution: passed=${token || '(none)'}  saved=${savedToken || '(none)'}  using=${resolvedToken || '(none)'}`);

    // Resolve portal_signature: user-entered value wins, then saved config value.
    const existing = cache.load() || {};
    const savedPortalSig = existing.portal_signature || '';
    const resolvedPortalSig = (portal_signature || '').trim() || savedPortalSig;
    if (resolvedPortalSig) {
      log.info(TAG, `portal_signature: entered=${portal_signature || '(none)'}  saved=${savedPortalSig || '(none)'}  using=${resolvedPortalSig}`);
    }

    const identity = createIdentity({
      mac,
      lang: lang || 'en',
      time_zone: timezone || 'Europe/London',
      token: resolvedToken,
      // Treat a saved/passed token as valid going in, so the first get_profile
      // sends not_valid_token=0 (handshake will correct this if the portal
      // disagrees). A fresh connect with no token stays not_valid=1.
      valid_token: !!resolvedToken,
      login: login || '',
      password: password || '',
      serial_number: serial_number || '0000000000000',
      device_id: device_id || '',
      device_id2: device_id2 || '',
      signature: signature || '',
      portal_signature: resolvedPortalSig,
    });

    const client = new StalkerClient();
    client.setIdentity(identity);
    client.setTimeout(connection_timeout || 10);

    log.info(TAG, `initialising client for ${portalUrl}`);
    await client.initialize(portalUrl);

    const sessionManager = new SessionManager(client);
    sessionManager.setIdentity(identity, !!resolvedToken);
    sessionManager.setStatusCallback((status) => {
      log.info(TAG, `session status → ${status}`);
    });
    // Persist any token the portal rotates mid-session (watchdog re-auth, the
    // 30s auth-checker, etc.) so a restart reconnects with the live token rather
    // than the stale one captured at first connect.
    sessionManager.setTokenPersistCallback((newToken) => {
      cache.saveToken(portalUrl, newToken);
    });

    const channelManager = new ChannelManager(client, config.dataDir);
    const guideManager   = new GuideManager(client, `${config.dataDir}/cache`);
    const vodManager     = new VodManager(client);

    // Persist config before auth so settings survive a failed attempt or restart.
    // Spread existing config first so stalker_HASH token entries are preserved.
    const configToSave = {
      ...existing,
      portal: portalUrl, mac,
      timezone: timezone || 'Europe/London',
      lang: lang || 'en',
      login: login || '',
      serial_number: serial_number || '0000000000000',
      device_id: device_id || '',
      device_id2: device_id2 || '',
      signature: signature || '',
      connection_timeout: connection_timeout || 10,
      token: resolvedToken,
    };
    cache.save(configToSave);

    log.info(TAG, 'authenticating…');
    await sessionManager.authenticate();
    log.info(TAG, `authenticated ✓  token=${identity.token}`);

    // Persist token under stalker_HASH (STBEmu-compatible) and legacy field.
    if (identity.token) {
      cache.saveToken(portalUrl, identity.token);
    }

    // Persist portal_signature if the portal returned one during auth.
    if (identity.portal_signature) {
      cache.savePortalSignature(identity.portal_signature);
    }

    appState.client = client;
    appState.sessionManager = sessionManager;
    appState.channelManager = channelManager;
    appState.guideManager   = guideManager;
    appState.vodManager     = vodManager;
    appState.identity = identity;

    log.info(TAG, 'starting background channel/group pre-load');
    Promise.all([
      channelManager.loadChannels(),
      channelManager.loadGroups(),
    ]).then(() => {
      log.info(TAG, 'background channel/group load complete');
    }).catch((e) => {
      log.error(TAG, `background channel/group load failed: ${e.message}`);
    });

    return {
      token: identity.token,
      profile: sessionManager.getProfile(),
    };
  }

  // ── POST /api/auth/connect ─────────────────────────────────────────────────
  router.post('/connect', connectLimiter, connectRules, async (req, res) => {
    try {
      const result = await connectPortal(req.body);
      appState.touchActivity?.();
      res.json({ success: true, ...result });
    } catch (err) {
      log.error(TAG, `connect failed: ${err.message}`);
      res.status(401).json({ error: err.message });
    }
  });

  // ── GET /api/auth/status ───────────────────────────────────────────────────
  router.get('/status', (req, res) => {
    const connected = !!(appState.sessionManager?.isAuthenticated());
    const saved = cache.load();
    const watchdog = appState.sessionManager?._watchdog;
    res.json({
      connected,
      portal: saved?.portal || null,
      mac: saved?.mac || null,
      profile: connected ? appState.sessionManager.getProfile() : null,
      token: connected ? appState.identity?.token : null,
      device: DEVICE_PROFILE,
      watchdog: watchdog ? { lastPingAt: watchdog.lastPingAt, pingCount: watchdog.pingCount } : null,
      lastActivityAt: appState.lastActivityAt || null,
      idleTimeoutMs: appState.idleTimeoutMs || null,
    });
  });

  // ── PUT /api/auth/config ───────────────────────────────────────────────────
  // Persist portal config fields WITHOUT initiating a connection.
  router.put('/config', (req, res) => {
    const existing = cache.load() || {};
    const allowed = ['portal', 'mac', 'timezone', 'lang', 'login',
                     'serial_number', 'device_id', 'device_id2',
                     'signature', 'connection_timeout'];
    for (const key of allowed) {
      if (req.body[key] !== undefined) {
        existing[key] = key === 'portal'
          ? normalizePortal(req.body[key])
          : req.body[key];
      }
    }
    cache.save(existing);
    res.json({ success: true });
  });

  // ── GET /api/auth/config ───────────────────────────────────────────────────
  // Returns saved portal config so the WebUI can pre-fill the Setup form.
  router.get('/config', (req, res) => {
    const saved = cache.load();
    if (!saved) return res.json(null);

    // Return only the flat setup fields; exclude internal stalker_* keys.
    const { portal, mac, timezone, lang, login, serial_number,
            device_id, device_id2, signature, portal_signature,
            connection_timeout, token } = saved;

    // Collect all stalker_HASH token entries
    const tokens = {};
    for (const [k, v] of Object.entries(saved)) {
      if (k.startsWith('stalker_')) tokens[k] = v;
    }

    res.json({ portal, mac, timezone, lang, login, serial_number,
               device_id, device_id2, signature, portal_signature,
               connection_timeout, token, tokens });
  });

  // ── DELETE /api/auth/disconnect ────────────────────────────────────────────
  router.delete('/disconnect', (req, res) => {
    if (appState.sessionManager) {
      log.info(TAG, 'disconnecting session');
      appState.sessionManager.destroy();
      appState.sessionManager = null;
      appState.client = null;
      appState.channelManager = null;
      appState.guideManager = null;
      appState.vodManager = null;
      appState.identity = null;
    }
    clearTimeout(appState._idleTimer);
    appState._idleTimer = null;
    appState.lastActivityAt = null;
    res.json({ success: true });
  });

  // ── POST /api/auth/reconnect ───────────────────────────────────────────────
  router.post('/reconnect', reconnectLimiter, async (req, res) => {
    const saved = cache.load();
    if (!saved?.portal || !saved?.mac) {
      return res.status(400).json({ error: 'No saved portal config found' });
    }
    try {
      const result = await connectPortal(saved);
      res.json({ success: true, ...result });
    } catch (err) {
      log.error(TAG, `reconnect failed: ${err.message}`);
      res.status(401).json({ error: err.message });
    }
  });

  // ── GET /api/auth/profiles ─────────────────────────────────────────────────
  // Returns all saved profiles (name → { portal, mac, timezone, ... }).
  router.get('/profiles', (req, res) => {
    const saved = cache.load() || {};
    res.json({ profiles: saved.profiles || {} });
  });

  // ── POST /api/auth/profiles ────────────────────────────────────────────────
  // Saves the current portal config as a named profile.
  router.post('/profiles', (req, res) => {
    const { name } = req.body || {};
    if (!name || typeof name !== 'string' || !name.trim()) {
      return res.status(400).json({ error: 'Profile name is required' });
    }
    const profileName = name.trim();
    const existing = cache.load() || {};

    // Build a profile snapshot from the current flat config fields.
    const { portal, mac, timezone, lang, login, serial_number,
            device_id, device_id2, signature, connection_timeout,
            stbemu_stb_model, stbemu_firmware, stbemu_custom_firmware } = existing;

    if (!portal || !mac) {
      return res.status(400).json({ error: 'No active portal config to save as a profile' });
    }

    const profiles = existing.profiles || {};
    profiles[profileName] = {
      portal, mac,
      timezone: timezone || 'Europe/London',
      lang: lang || 'en',
      login: login || '',
      serial_number: serial_number || '0000000000000',
      device_id: device_id || '',
      device_id2: device_id2 || '',
      signature: signature || '',
      connection_timeout: connection_timeout || 10,
      stb_model: stbemu_stb_model || 'MAG250',
      firmware: stbemu_firmware || '0.2.18-r14-pub-250',
      custom_firmware: stbemu_custom_firmware || '',
    };

    cache.save({ ...existing, profiles });
    log.info(TAG, `profile saved: "${profileName}"`);
    res.json({ success: true, name: profileName });
  });

  // ── PUT /api/auth/profiles/:name ───────────────────────────────────────────
  // Activates a saved profile by reconnecting with its stored config.
  router.put('/profiles/:name', reconnectLimiter, async (req, res) => {
    const profileName = decodeURIComponent(req.params.name);
    const existing = cache.load() || {};
    const profiles = existing.profiles || {};
    const profile = profiles[profileName];

    if (!profile) {
      return res.status(404).json({ error: `Profile "${profileName}" not found` });
    }

    try {
      // Restore per-profile STBEmu device settings into the global config
      // so the export fallback values match the activated profile.
      const existing2 = cache.load() || {};
      if (profile.stb_model)        existing2.stbemu_stb_model        = profile.stb_model;
      if (profile.firmware)         existing2.stbemu_firmware         = profile.firmware;
      if (profile.custom_firmware)  existing2.stbemu_custom_firmware  = profile.custom_firmware;
      cache.save(existing2);

      const result = await connectPortal(profile);
      appState.touchActivity?.();
      log.info(TAG, `profile activated: "${profileName}"`);
      res.json({ success: true, name: profileName, ...result });
    } catch (err) {
      log.error(TAG, `profile activation failed for "${profileName}": ${err.message}`);
      res.status(401).json({ error: err.message });
    }
  });

  // ── DELETE /api/auth/profiles/:name ───────────────────────────────────────
  // Deletes a saved profile.
  router.delete('/profiles/:name', (req, res) => {
    const profileName = decodeURIComponent(req.params.name);
    const existing = cache.load() || {};
    const profiles = existing.profiles || {};

    if (!profiles[profileName]) {
      return res.status(404).json({ error: `Profile "${profileName}" not found` });
    }

    delete profiles[profileName];
    cache.save({ ...existing, profiles });
    log.info(TAG, `profile deleted: "${profileName}"`);
    res.json({ success: true });
  });

  return { authRoutes: router, connectPortal };
};
