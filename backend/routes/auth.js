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
const { createIdentity, STB_VERSION_STRING } = require('../stalker/identity');
const CacheManager = require('../cache/CacheManager');

// Parse the version string fields for the status endpoint
function parseVersionString(ver) {
  const get = (key) => {
    const m = ver.match(new RegExp(key + ':\\s*([^;]+)'));
    return m ? m[1].trim() : null;
  };
  return {
    image_description:    get('ImageDescription'),
    image_date:           get('ImageDate'),
    portal_version:       get('PORTAL version'),
    js_api_version:       get('JS API version'),
    stb_api_version:      get('STB API version'),
    player_engine_version: get('Player Engine version'),
  };
}

const DEVICE_PROFILE = {
  stb_type:       'MAG250',
  hw_version:     '1.7-BD-00',
  image_version:  '216',
  user_agent:     'Mozilla/5.0 (QtEmbedded; U; Linux; C) AppleWebKit/533.3 (KHTML, like Gecko) MAG200 stb mergotv/4.2.16.40 Safari/533.3',
  x_user_agent:   'Model: MAG250; Link: WiFi',
  ...parseVersionString(STB_VERSION_STRING),
};

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

    console.log(`[auth] connectPortal: portal=${portal} mac=${mac} timezone=${timezone || 'Europe/London'}`);

    // Tear down existing session
    if (appState.sessionManager) {
      console.log('[auth] tearing down existing session');
      appState.sessionManager.destroy();
      appState.sessionManager = null;
      appState.client = null;
      appState.channelManager = null;
      appState.guideManager = null;
      appState.identity = null;
    }

    // Resolve token: prefer the stalker_HASH entry saved for this portal over
    // any token passed in the request body — the saved one is the most recent.
    const savedToken = cache.getToken(portal);
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

    console.log(`[auth] initialising client for ${portal}`);
    await client.initialize(portal);

    const sessionManager = new SessionManager(client);
    sessionManager.setIdentity(identity, !!resolvedToken);
    sessionManager.setStatusCallback((status) => {
      console.log(`[auth] session status → ${status}`);
    });

    const channelManager = new ChannelManager(client);
    const guideManager = new GuideManager(client, `${config.dataDir}/cache`);

    // Persist config before auth so settings survive a failed attempt or restart.
    // Spread existing config first so stalker_HASH token entries are preserved.
    const configToSave = {
      ...existing,
      portal, mac,
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
      cache.saveToken(portal, identity.token);
    }

    // Persist portal_signature if the portal returned one during auth.
    if (identity.portal_signature) {
      cache.savePortalSignature(identity.portal_signature);
    }

    appState.client = client;
    appState.sessionManager = sessionManager;
    appState.channelManager = channelManager;
    appState.guideManager = guideManager;
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
    res.json({
      connected,
      portal: saved?.portal || null,
      mac: saved?.mac || null,
      profile: connected ? appState.sessionManager.getProfile() : null,
      token: connected ? appState.identity?.token : null,
      device: DEVICE_PROFILE,
    });
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
      appState.identity = null;
    }
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
