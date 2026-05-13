// WatchdogService.js
// Mirrors: CWatchdog.cpp + watchdog.c
//
// Sends a periodic keepalive ping to the Stalker portal's watchdog endpoint.
// The portal requires this to keep the session alive (default every 90 seconds).

'use strict';

class WatchdogService {
  constructor(intervalSeconds, client, errorCallback) {
    this.intervalSeconds = intervalSeconds || 90;
    this.client = client;
    this.errorCallback = errorCallback; // (errCode: string) => void
    this._timer = null;
    this._active = false;
  }

  start() {
    if (this._active) return;
    this._active = true;
    console.log(`[Watchdog] starting (interval=${this.intervalSeconds}s)`);
    this._scheduleNext();
  }

  stop() {
    this._active = false;
    if (this._timer) {
      clearTimeout(this._timer);
      this._timer = null;
    }
    console.log('[Watchdog] stopped');
  }

  _scheduleNext() {
    if (!this._active) return;
    this._timer = setTimeout(() => this._tick(), this.intervalSeconds * 1000);
  }

  async _tick() {
    if (!this._active) return;

    try {
      // curPlayType=1 (TV), eventActiveId=0 — hardcoded as in CWatchdog::Process()
      await this.client.watchdogGetEvents(1, 0);
      console.log('[Watchdog] ping ok');
    } catch (err) {
      console.error('[Watchdog] ping failed:', err.message);
      const code = err.code || 'UNKNOWN';
      if (this.errorCallback) this.errorCallback(code);
    }

    this._scheduleNext();
  }
}

module.exports = WatchdogService;
