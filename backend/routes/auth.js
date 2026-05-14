// routes/auth.js
// POST   /api/auth/connect     — initialise portal connection
// GET    /api/auth/status      — check session state
// GET    /api/auth/config      — return saved config for WebUI pre-fill
// DELETE /api/auth/disconnect  — tear down session
// POST   /api/auth/reconnect   — re-connect using saved config

'use strict';

const express = require('express');
const { StalkerClient } = require('../stalker/StalkerClient');
const SessionManager = require('../stalker/SessionManager');
const ChannelManager = require('../stalker/ChannelManager');
const GuideManager = require('../stalker/GuideManager');
const VodManager = require('../stalker/VodManager');
const { createIdentity } = require('../stalker/identity');
const { DEVICE_PROFILE } = require('../stalker/deviceProfile');
const CacheManager = require('../cache/CacheManager');

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
    console.log(`[auth] connectPortal: portal=${portalUrl} mac=${mac} timezone=${timezone || 'Europe/London'}`);

    // Tear down existing session
    if (appState.sessionManager) {
      console.log('[auth] tearing down existing session');
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
    console.log(`[auth] token resolution: passed=${token || '(none)'}  saved=${savedToken || '(none)'}  using=${resolvedToken || '(none)'}`);

    // Resolve portal_signature: user-entered value wins, then saved config value.
    const existing = cache.load() || {};
    const savedPortalSig = existing.portal_signature || '';
    const resolvedPortalSig = (portal_signature || '').trim() || savedPortalSig;
    if (resolvedPortalSig) {
      console.log(`[auth] portal_signature: entered=${portal_signature || '(none)'}  saved=${savedPortalSig || '(none)'}  using=${resolvedPortalSig}`);
    }

    const identity = createIdentity({
      mac,
      lang: lang || 'en',
      time_zone: timezone || 'Europe/London',
      token: resolvedToken,
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

    console.log(`[auth] initialising client for ${portalUrl}`);
    await client.initialize(portalUrl);

    const sessionManager = new SessionManager(client);
    sessionManager.setIdentity(identity, !!resolvedToken);
    sessionManager.setStatusCallback((status) => {
      console.log(`[auth] session status → ${status}`);
    });

    const channelManager = new ChannelManager(client);
    const guideManager = new GuideManager(client, `${config.dataDir}/cache`);
    const vodManager = new VodManager(client);

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

    console.log('[auth] authenticating…');
    await sessionManager.authenticate();
    console.log(`[auth] authenticated ✓  token=${identity.token}`);

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
    appState.guideManager = guideManager;
    appState.vodManager = vodManager;
    appState.identity = identity;

    console.log('[auth] starting background channel/group pre-load');
    Promise.all([
      channelManager.loadChannels(),
      channelManager.loadGroups(),
    ]).then(() => {
      console.log('[auth] background channel/group load complete');
    }).catch((e) => {
      console.error('[auth] background channel/group load failed:', e.message);
    });

    return {
      token: identity.token,
      profile: sessionManager.getProfile(),
    };
  }

  // ── POST /api/auth/connect ─────────────────────────────────────────────────
  router.post('/connect', async (req, res) => {
    try {
      const result = await connectPortal(req.body);
      appState.touchActivity?.();
      res.json({ success: true, ...result });
    } catch (err) {
      console.error('[auth] connect failed:', err.message);
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
      console.log('[auth] disconnecting session');
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
  router.post('/reconnect', async (req, res) => {
    const saved = cache.load();
    if (!saved?.portal || !saved?.mac) {
      return res.status(400).json({ error: 'No saved portal config found' });
    }
    try {
      const result = await connectPortal(saved);
      res.json({ success: true, ...result });
    } catch (err) {
      console.error('[auth] reconnect failed:', err.message);
      res.status(401).json({ error: err.message });
    }
  });

  return { authRoutes: router, connectPortal };
};
