'use strict';

// Structured logger with log levels. Set LOG_LEVEL env var to control output.
// Levels: debug < info < warn < error  (default: info)

const LEVELS = { debug: 0, info: 1, warn: 2, error: 3 };
const MIN = LEVELS[process.env.LOG_LEVEL?.toLowerCase()] ?? LEVELS.info;

function write(level, tag, msg) {
  if (LEVELS[level] < MIN) return;
  const ts = new Date().toISOString();
  const line = `[${ts}] [${level.toUpperCase().padEnd(5)}] [${tag}] ${msg}`;
  if (level === 'error') console.error(line);
  else if (level === 'warn')  console.warn(line);
  else console.log(line);
}

module.exports = {
  debug: (tag, msg) => write('debug', tag, msg),
  info:  (tag, msg) => write('info',  tag, msg),
  warn:  (tag, msg) => write('warn',  tag, msg),
  error: (tag, msg) => write('error', tag, msg),
};
