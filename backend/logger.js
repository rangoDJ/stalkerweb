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

function ts() {
  const d = new Date();
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  const ss = String(d.getSeconds()).padStart(2, '0');
  return `${hh}:${mm}:${ss}`;
}

function write(level, tag, msg) {
  if (LEVELS[level] < MIN) return;
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
};
