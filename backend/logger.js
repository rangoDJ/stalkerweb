'use strict';

// Structured logger. Set LOG_LEVEL env var to control verbosity.
// Levels: debug < info < warn < error  (default: info)
// Colors are emitted only when stdout is a TTY (disabled in Docker/CI pipes).

const LEVELS = { debug: 0, info: 1, warn: 2, error: 3 };
const MIN    = LEVELS[process.env.LOG_LEVEL?.toLowerCase()] ?? LEVELS.info;
const COLOR  = process.stdout.isTTY;

const C = {
  reset: '\x1b[0m',
  dim:   '\x1b[2m',
  debug: '\x1b[90m',  // gray
  info:  '\x1b[36m',  // cyan
  warn:  '\x1b[33m',  // yellow
  error: '\x1b[31m',  // red
  tag:   '\x1b[35m',  // magenta
};

const BADGE = { debug: 'DEBUG', info: 'INFO ', warn: 'WARN ', error: 'ERROR' };

function c(color, text) { return COLOR ? `${C[color]}${text}${C.reset}` : text; }

// ── Live log capture ─────────────────────────────────────────────────────────
// In addition to the pretty console output, every record is pushed into a
// bounded ring buffer and broadcast to subscribers. This feeds the live log
// monitor (routes/logs.js) without changing any call site or the console output.
const { EventEmitter } = require('events');

const RING_MAX = parseInt(process.env.LOG_BUFFER_SIZE || '1000', 10);
const ring = [];           // [{ seq, ts, level, tag, msg }]
let seq = 0;

const emitter = new EventEmitter();
emitter.setMaxListeners(0); // unbounded subscribers; we manage cleanup ourselves

function capture(level, tag, msg) {
  const record = { seq: ++seq, ts: Date.now(), level, tag, msg: String(msg) };
  ring.push(record);
  if (ring.length > RING_MAX) ring.shift();
  emitter.emit('log', record);
}

// Returns buffered records, optionally filtered. Used by GET /api/logs.
function getBuffer({ since = 0, level, tag, limit } = {}) {
  let out = ring;
  if (since)  out = out.filter(r => r.seq > since);
  if (level)  out = out.filter(r => LEVELS[r.level] >= (LEVELS[level] ?? 0));
  if (tag)    out = out.filter(r => r.tag === tag);
  if (limit && out.length > limit) out = out.slice(out.length - limit);
  return out;
}

function ts() {
  const d = new Date();
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  const ss = String(d.getSeconds()).padStart(2, '0');
  return `${hh}:${mm}:${ss}`;
}

function write(level, tag, msg) {
  if (LEVELS[level] < MIN) return;
  capture(level, tag, msg);
  const line = [
    c('dim', ts()),
    c(level, BADGE[level]),
    c('tag', tag.padEnd(14)),
    msg,
  ].join('  ');
  if (level === 'error') console.error(line);
  else if (level === 'warn') console.warn(line);
  else console.log(line);
}

module.exports = {
  debug: (tag, msg) => write('debug', tag, msg),
  info:  (tag, msg) => write('info',  tag, msg),
  warn:  (tag, msg) => write('warn',  tag, msg),
  error: (tag, msg) => write('error', tag, msg),

  // Live log monitor hooks (see routes/logs.js)
  events: emitter,   // emits 'log' with each captured record
  getBuffer,         // snapshot of the ring buffer, with optional filters
};
