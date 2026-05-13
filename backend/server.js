'use strict';

require('express-async-errors');
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const config = require('./config');

// Ensure data directories exist
fs.mkdirSync(config.dataDir, { recursive: true });
fs.mkdirSync(config.cacheDir, { recursive: true });

const app = express();

// ── Middleware ─────────────────────────────────────────────────────────────
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// ── Shared application state (single active session) ──────────────────────
const appState = {
  client: null,
  sessionManager: null,
  channelManager: null,
  guideManager: null,
  identity: null,
};

// ── Health check ───────────────────────────────────────────────────────────
app.get('/api/health', (_req, res) => {
  res.json({
    status: 'ok',
    connected: !!(appState.sessionManager?.isAuthenticated()),
    version: '1.0.0',
  });
});

// ── API Routes ─────────────────────────────────────────────────────────────
// auth module exports { authRoutes, connectPortal } so server can call
// connectPortal() directly at startup without a mock HTTP request.
const { authRoutes, connectPortal } = require('./routes/auth')(appState, config);
const channelRoutes = require('./routes/channels')(appState);
const epgRoutes = require('./routes/epg')(appState);
const streamRoutes = require('./routes/stream')(appState);
const settingsRoutes = require('./routes/settings')(config);

app.use('/api/auth', authRoutes);
app.use('/api/channels', channelRoutes);
app.use('/api/epg', epgRoutes);
app.use('/api/stream', streamRoutes);
app.use('/api/settings', settingsRoutes);

// ── Serve frontend (built React app) ──────────────────────────────────────
const frontendDist = path.join(__dirname, '..', 'frontend', 'dist');
if (fs.existsSync(frontendDist)) {
  app.use(express.static(frontendDist));
  // SPA fallback — serve index.html for all non-API routes
  app.get('*', (_req, res) => {
    res.sendFile(path.join(frontendDist, 'index.html'));
  });
} else {
  // Development: show API info when frontend not built
  app.get('/', (_req, res) => {
    res.json({
      message: 'stalkerweb API is running. Build the frontend with: cd frontend && npm run build',
      endpoints: [
        'GET  /api/health',
        'POST /api/auth/connect',
        'GET  /api/auth/status',
        'DELETE /api/auth/disconnect',
        'GET  /api/channels',
        'GET  /api/channels/groups/all',
        'GET  /api/epg',
        'GET  /api/epg/:channelId',
        'GET  /api/stream/:channelId',
      ],
    });
  });
}

// ── Global error handler ───────────────────────────────────────────────────
app.use((err, _req, res, _next) => {
  console.error('[server] unhandled error:', err.message);
  res.status(500).json({ error: err.message || 'Internal server error' });
});

// ── Auto-reconnect from saved config on startup ────────────────────────────
// Calls connectPortal() directly — no mock-request hack needed.
async function tryAutoConnect() {
  const CacheManager = require('./cache/CacheManager');
  const cache = new CacheManager(config.dataDir);
  let saved = cache.load();

  if (!saved?.portal || !saved?.mac) {
    // Fall back to env-provided portal credentials
    if (config.preseeded.portal && config.preseeded.mac) {
      saved = {
        portal: config.preseeded.portal,
        mac: config.preseeded.mac,
        timezone: config.preseeded.timezone || 'Europe/London',
      };
    } else {
      console.log('[server] no saved portal config — waiting for POST /api/auth/connect');
      return;
    }
  }

  // Log all stored stalker tokens so they're visible at startup
  const tokenKeys = Object.keys(saved).filter((k) => k.startsWith('stalker_'));
  if (tokenKeys.length) {
    console.log(`[server] stored stalker tokens (${tokenKeys.length}):`);
    for (const k of tokenKeys) {
      console.log(`  ${k} → ${saved[k]?.token || saved[k]}`);
    }
  }

  console.log(`[server] auto-connecting to ${saved.portal} (${saved.mac})`);
  try {
    await connectPortal(saved);
    console.log('[server] auto-connect: session established ✓');
  } catch (e) {
    console.error('[server] auto-connect failed:', e.message);
  }
}

// ── Start server ───────────────────────────────────────────────────────────
app.listen(config.port, () => {
  console.log(`[server] stalkerweb running on http://0.0.0.0:${config.port}`);
  console.log(`[server] dataDir: ${config.dataDir}`);
  tryAutoConnect();
});

module.exports = app;
