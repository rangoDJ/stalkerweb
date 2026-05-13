// routes/auth.js
// POST /api/auth/connect     — initialise portal connection
// GET  /api/auth/status      — check session state
// DELETE /api/auth/disconnect — tear down session
//
// Returns { authRoutes, connectPortal } so server.js can call
// connectPortal() directly at startup (auto-reconnect).

'use strict';

const express = require('express');
const { StalkerClient } = require('../stalker/StalkerClient');
const SessionManager = require('../stalker/SessionManager');
const ChannelManager = require('../stalker/ChannelManager');
const GuideManager = require('../stalker/GuideManager');
const { createIdentity } = require('../stalker/identity');
const CacheManager = require('../cache/CacheManager');

module.exports = function authModule(appState, config) {
  const router = express.Router();
  const cache = new CacheManager(config.dataDir);

  // ── Shared connect logic ───────────────────────────────────────────────────
  // Called by both POST /connect and tryAutoConnect() in server.js.
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
      connection_timeout,
    } = body;

    if (!portal) throw new Error('portal URL is required');
    if (!mac)    throw new Error('MAC address is required');

    // Tear down existing session
    if (appState.sessionManager) {
      appState.sessionManager.destroy();
      appState.sessionManager = null;
      appState.client = null;
      appState.channelManager = null;
      appState.guideManager = null;
      appState.identity = null;
    }

    // Build identity
    const identity = createIdentity({
      mac,
      lang: lang || 'en',
      time_zone: timezone || 'Europe/London',
      token: token || '',
      login: login || '',
      password: password || '',
      serial_number: serial_number || '0000000000000',
      device_id: device_id || '',
      device_id2: device_id2 || '',
      signature: signature || '',
    });

    // Build client — initialize() follows redirects, sets identity cookies
    // (mac, stb_lang, timezone, sn, device_id, sig) and loads /c/ to get
    // PHPSESSID before the handshake fires. Must match C# AuthenticateAsync.
    const client = new StalkerClient();
    client.setIdentity(identity);
    client.setTimeout(connection_timeout || 10);
    await client.initialize(portal);

    const sessionManager = new SessionManager(client);
    sessionManager.setIdentity(identity, !!token);
    sessionManager.setStatusCallback((status) => {
      console.log(`[auth] session status changed: ${status}`);
    });

    const channelManager = new ChannelManager(client);
    const guideManager = new GuideManager(client, `${config.dataDir}/cache`);

    // Persist config before auth so settings survive a failed attempt or restart
    const configToSave = {
      portal, mac,
      timezone: timezone || 'Europe/London',
      lang: lang || 'en',
      login: login || '',
      serial_number: serial_number || '0000000000000',
      device_id: device_id || '',
      device_id2: device_id2 || '',
      signature: signature || '',
      connection_timeout: connection_timeout || 10,
      token: token || '',
    };
    cache.save(configToSave);

    // Throws on auth failure
    await sessionManager.authenticate();

    // Update saved token with the one resolved during auth (may differ from input)
    if (identity.token && identity.token !== (token || '')) {
      cache.save({ ...configToSave, token: identity.token });
    }

    // Store in app state
    appState.client = client;
    appState.sessionManager = sessionManager;
    appState.channelManager = channelManager;
    appState.guideManager = guideManager;
    appState.identity = identity;

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
    });
  });

  // ── DELETE /api/auth/disconnect ────────────────────────────────────────────
  router.delete('/disconnect', (req, res) => {
    if (appState.sessionManager) {
      appState.sessionManager.destroy();
      appState.sessionManager = null;
      appState.client = null;
      appState.channelManager = null;
      appState.guideManager = null;
      appState.identity = null;
    }
    res.json({ success: true });
  });

  // ── POST /api/auth/reconnect — re-connect using saved config ───────────────
  router.post('/reconnect', async (req, res) => {
    const saved = cache.load();
    if (!saved?.portal || !saved?.mac) {
      return res.status(400).json({ error: 'No saved portal config found' });
    }
    try {
      const result = await connectPortal(saved);
      res.json({ success: true, ...result });
    } catch (err) {
      res.status(401).json({ error: err.message });
    }
  });

  return { authRoutes: router, connectPortal };
};
