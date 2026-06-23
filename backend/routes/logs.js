// routes/logs.js
// Live log monitor — lets an external agent (Claude, Antigravity, curl, …)
// watch the server's logs in real time.
//
//   GET /api/logs/stream   — SSE stream; replays the ring buffer then live-tails.
//                            Supports Last-Event-ID / ?since=<seq> for gap-free resume.
//   GET /api/logs          — one-shot JSON snapshot of the buffer.
//
// Both accept ?level=, ?tag=, ?since=, ?limit= filters.
//
// Security: if LOG_MONITOR_TOKEN is set, a matching ?token= or
// `Authorization: Bearer <token>` is required (any source IP). If it's unset,
// access is restricted to loopback (same host/container) — safe default, since
// these logs can contain the portal MAC, portal URL and stream tokens.

'use strict';

const express = require('express');
const router = express.Router();
const log = require('../logger');

const TOKEN = process.env.LOG_MONITOR_TOKEN || '';

// Level ordering for stream-side filtering (mirrors logger.js).
const LEVELS = { debug: 0, info: 1, warn: 2, error: 3 };

// trust proxy is enabled app-wide, so req.ip honours X-Forwarded-For (spoofable).
// For the loopback gate we deliberately use the raw socket address instead.
function isLoopback(req) {
  const a = req.socket?.remoteAddress || '';
  return a === '127.0.0.1' || a === '::1' || a === '::ffff:127.0.0.1';
}

function authorize(req, res, next) {
  if (TOKEN) {
    const bearer = (req.get('authorization') || '').replace(/^Bearer\s+/i, '');
    const provided = req.query.token || bearer;
    if (provided === TOKEN) return next();
    res.set('WWW-Authenticate', 'Bearer');
    return res.status(401).json({ error: 'invalid or missing log monitor token' });
  }
  if (isLoopback(req)) return next();
  return res.status(403).json({
    error: 'log monitor restricted to localhost; set LOG_MONITOR_TOKEN to allow remote access',
  });
}

// Parse the shared ?level=&tag=&since=&limit= filter set from the query.
function parseFilters(req) {
  const f = {};
  if (req.query.level) f.level = String(req.query.level).toLowerCase();
  if (req.query.tag)   f.tag = String(req.query.tag);
  const since = parseInt(req.query.since, 10);
  if (Number.isFinite(since)) f.since = since;
  const limit = parseInt(req.query.limit, 10);
  if (Number.isFinite(limit) && limit > 0) f.limit = limit;
  return f;
}

router.use(authorize);

// GET /api/logs — JSON snapshot of the ring buffer.
router.get('/', (req, res) => {
  res.json({ logs: log.getBuffer(parseFilters(req)) });
});

// GET /api/logs/stream — SSE: replay buffer, then live-tail.
router.get('/stream', (req, res) => {
  res.set({
    'Content-Type':  'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection':    'keep-alive',
    'Access-Control-Allow-Origin': '*',
    'X-Accel-Buffering': 'no', // disable proxy buffering (nginx)
  });
  res.flushHeaders();

  const filters = parseFilters(req);
  // Resume point: explicit ?since= wins, else the SSE Last-Event-ID header.
  const lastEventId = parseInt(req.get('last-event-id'), 10);
  if (!Number.isFinite(filters.since) && Number.isFinite(lastEventId)) {
    filters.since = lastEventId;
  }

  const matches = (r) => {
    if (filters.level && LEVELS[r.level] < (LEVELS[filters.level] ?? 0)) return false;
    if (filters.tag && r.tag !== filters.tag) return false;
    return true;
  };

  const send = (r) => {
    res.write(`id: ${r.seq}\n`);
    res.write(`data: ${JSON.stringify(r)}\n\n`);
  };

  // Replay everything currently buffered (respecting since/level/tag/limit).
  let lastSeq = filters.since || 0;
  for (const r of log.getBuffer(filters)) {
    send(r);
    lastSeq = r.seq;
  }

  // Live tail. Guard against replaying records already flushed above.
  const onLog = (r) => {
    if (r.seq <= lastSeq) return;
    lastSeq = r.seq;
    if (matches(r)) send(r);
  };
  log.events.on('log', onLog);

  const hb = setInterval(() => res.write(': keepalive\n\n'), 15_000);

  const cleanup = () => {
    clearInterval(hb);
    log.events.off('log', onLog);
  };
  req.on('close', cleanup);
});

module.exports = router;
