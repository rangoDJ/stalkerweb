// WatchdogService.js
// Mirrors: CWatchdog.cpp + watchdog.c
//
// Sends a periodic keepalive ping to the Stalker portal's watchdog endpoint.
// The portal requires this to keep the session alive (default every 90 seconds).

'use strict';

const log = require('../logger');
const TAG = 'Watchdog';

class WatchdogService {
  constructor(intervalSeconds, client, errorCallback) {
    this.intervalSeconds = intervalSeconds || 90;
    this.client = client;
    this.errorCallback = errorCallback; // (errCode: string) => void
    this._timer = null;
    this._active = false;
    this.lastPingAt = null;   // ISO timestamp of last successful ping
    this.pingCount  = 0;
  }

  start() {
    if (this._active) return;
    this._active = true;
    log.info(TAG, `starting (interval=${this.intervalSeconds}s)`);
    this._scheduleNext();
  }

  stop() {
    this._active = false;
    if (this._timer) {
      clearTimeout(this._timer);
      this._timer = null;
    }
    log.info(TAG, 'stopped');
  }

  _scheduleNext() {
    if (!this._active) return;
    this._timer = setTimeout(() => this._tick(), this.intervalSeconds * 1000);
  }

  async _tick() {
    if (!this._active) return;

    try {
      await this.client.watchdogGetEvents(1, 0);
      this.lastPingAt = new Date().toISOString();
      this.pingCount++;
      log.info(TAG, `ping ok (total=${this.pingCount})`);
    } catch (err) {
      log.error(TAG, `ping failed: ${err.message}`);
      const code = err.code || 'UNKNOWN';
      if (this.errorCallback) this.errorCallback(code);
    }

    this._scheduleNext();
  }
}

module.exports = WatchdogService;
