'use strict';

// When stdout/stderr are pipes (Docker, CI) Node.js may buffer writes and
// drop them on crash. Force synchronous (blocking) I/O so every console.log
// line appears immediately in `docker logs`.
if (process.stdout._handle?.setBlocking) process.stdout._handle.setBlocking(true);
if (process.stderr._handle?.setBlocking) process.stderr._handle.setBlocking(true);

// Prefer IPv4 when resolving hostnames. Many logo/stream CDNs publish AAAA
// records that are unroutable from inside a Docker container, causing a
// multi-second connect hang then failure. ipv4first makes Node try the A
// record first. (Node 18+.)
try { require('dns').setDefaultResultOrder('ipv4first'); } catch { /* older Node */ }

require('express-async-errors');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const path = require('path');
const fs = require('fs');
const config = require('./config');

// Ensure data directories exist
fs.mkdirSync(config.dataDir, { recursive: true });
fs.mkdirSync(config.cacheDir, { recursive: true });

const app = express();

// ── Middleware ─────────────────────────────────────────────────────────────
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' }, contentSecurityPolicy: false }));
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// ── Shared application state (single active session) ──────────────────────
const appState = {
  client: null,
  sessionManager: null,
  channelManager: null,
  guideManager: null,
  vodManager: null,
  identity: null,
};

// ── Health check ───────────────────────────────────────────────────────────
app.get('/api/health', (_req, res) => {
  res.json({
    status: 'ok',
    connected: !!(appState.sessionManager?.isAuthenticated()),
    version: config.version || require('./package.json').version,
  });
});

// ── API Routes ─────────────────────────────────────────────────────────────
// auth module exports { authRoutes, connectPortal } so server can call
// connectPortal() directly at startup without a mock HTTP request.
const LogoManager = require('./logos/LogoManager');
const logoManager = new LogoManager(config.dataDir);
logoManager.ensureLoadedBackground();

const FavoritesManager = require('./favorites/FavoritesManager');
const favoritesManager = new FavoritesManager(config.dataDir);

const { authRoutes, connectPortal } = require('./routes/auth')(appState, config);

// ── Idle auto-disconnect ───────────────────────────────────────────────────
// Tear down the session after IDLE_TIMEOUT_MS of no stream/proxy activity.
const log = require('./logger');

// ── HTTP request logger ────────────────────────────────────────────────────
// Replaces morgan('dev') with a format consistent with our structured logger.
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const ms     = Date.now() - start;
    const status = res.statusCode;
    const msg    = `${req.method.padEnd(6)} ${req.url}  ${status}  ${ms}ms`;
    if (status >= 500)      log.error('http', msg);
    else if (status >= 400) log.warn('http', msg);
    else                    log.debug('http', msg);
  });
  next();
});

const IDLE_TIMEOUT_MS = parseInt(process.env.IDLE_TIMEOUT_MINUTES || '30', 10) * 60 * 1000;

function destroySession() {
  if (!appState.sessionManager) return;
  log.info('server', `idle timeout (${IDLE_TIMEOUT_MS / 60000}m) — auto-disconnecting session`);
  appState.sessionManager.destroy();
  appState.sessionManager = null;
  appState.client = null;
  appState.channelManager = null;
  appState.guideManager = null;
  appState.identity = null;
}

appState.idleTimeoutMs   = IDLE_TIMEOUT_MS;
appState.lastActivityAt  = null;
appState._idleTimer      = null;
appState._reconnecting   = null;   // serialise concurrent auto-reconnects
appState.connectPortal   = connectPortal;

appState.touchActivity = function touchActivity() {
  appState.lastActivityAt = new Date().toISOString();
  clearTimeout(appState._idleTimer);
  appState._idleTimer = setTimeout(destroySession, IDLE_TIMEOUT_MS);
};

const vodRoutes    = require('./routes/vod')(appState);

const channelRoutes = require('./routes/channels')(appState);
const epgRoutes = require('./routes/epg')(appState);
const streamRoutes = require('./routes/stream')(appState, config);
const settingsRoutes = require('./routes/settings')(config);
const proxyRoutes = require('./routes/proxy')(appState);
const m3uRoutes = require('./routes/m3u')(appState, logoManager);
const xmltvRoutes = require('./routes/xmltv')(appState);
const logosRoutes     = require('./routes/logos')(logoManager, appState);
const favoritesRoutes = require('./routes/favorites')(favoritesManager, appState);
const exportRoutes    = require('./routes/export')(config);

app.use('/api/auth', authRoutes);
app.use('/api/vod', vodRoutes);
app.use('/api/channels', channelRoutes);
app.use('/api/epg', epgRoutes);
app.use('/api/stream', streamRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/logos', logosRoutes);
app.use('/api/favorites', favoritesRoutes);
app.use('/api/export', exportRoutes);
app.use('/api/m3u', m3uRoutes);
app.use('/api/xmltv', xmltvRoutes);
// /proxy must be registered before the SPA static fallback
app.use('/proxy', proxyRoutes);

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
  log.error('server', `unhandled error: ${err.message}`);
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
      log.info('server', 'no saved portal config — waiting for POST /api/auth/connect');
      return;
    }
  }

  log.info('server', `auto-connecting to ${saved.portal} (${saved.mac})`);
  try {
    await connectPortal(saved);
    log.info('server', 'auto-connect: session established ✓');
    appState.touchActivity();
  } catch (e) {
    log.error('server', `auto-connect failed: ${e.message}`);
  }
}

// ── Start server ───────────────────────────────────────────────────────────
const httpServer = app.listen(config.port, () => {
  log.info('server', `stalkerweb running on http://0.0.0.0:${config.port}`);
  log.info('server', `dataDir: ${config.dataDir}`);
  tryAutoConnect();
});

// ── Graceful shutdown ──────────────────────────────────────────────────────
function shutdown(signal) {
  log.info('server', `${signal} received — shutting down`);
  if (appState.sessionManager) {
    log.info('server', 'destroying portal session…');
    appState.sessionManager.destroy();
  }
  httpServer.close(() => {
    log.info('server', 'HTTP server closed');
    process.exit(0);
  });
  setTimeout(() => { log.error('server', 'forced exit after timeout'); process.exit(1); }, 5000);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT',  () => shutdown('SIGINT'));

module.exports = app;
