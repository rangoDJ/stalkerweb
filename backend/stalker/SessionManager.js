// SessionManager.js
// Mirrors: SessionManager.cpp + DoHandshake/DoAuth/GetProfile/Authenticate logic
//
// Manages the full Stalker authentication lifecycle:
//   1. Handshake  → get token
//   2. GetProfile → check status (0=ok, 2=need credentials, 1=error)
//   3. DoAuth     → send login/password (only if status=2)
//   4. GetProfile(authSecondStep=true)
//
// After authentication, starts the WatchdogService to keep the session alive.

'use strict';

const WatchdogService = require('./WatchdogService');

const MAX_RETRIES = 5;
const RETRY_DELAY_MS = 5000;
const AUTH_CHECK_INTERVAL_MS = 30000;

class SessionManager {
  constructor(client) {
    this.client = client;           // StalkerClient instance
    this.identity = null;           // reference to shared identity object
    this.profile = null;            // STB profile from get_profile response
    this.authenticated = false;
    this.isAuthenticating = false;
    this.hasManualToken = false;
    this.lastError = null;
    this._watchdog = null;
    this._authTimer = null;
    this._statusCallback = null;    // (status: 'ok'|'lost'|'error') => void
  }

  setIdentity(identity, hasManualToken = false) {
    this.identity = identity;
    this.hasManualToken = hasManualToken;
  }

  setStatusCallback(cb) {
    this._statusCallback = cb;
  }

  isAuthenticated() {
    return this.authenticated;
  }

  getProfile() {
    return this.profile;
  }

  // ── Handshake ──────────────────────────────────────────────────────────────
  // Mirrors SessionManager::DoHandshake()
  async _doHandshake() {
    const data = await this.client.stbHandshake();

    if (!data || !data.js) throw new Error('Handshake: empty response');

    if (data.js.token) {
      this.identity.token = data.js.token;
      this.client.setIdentity(this.identity); // propagate token to client
      console.log(`[SessionManager] handshake token=${this.identity.token}`);
    }

    if (data.js.not_valid !== undefined) {
      this.identity.valid_token = !Number(data.js.not_valid);
    }
  }

  // ── DoAuth ─────────────────────────────────────────────────────────────────
  // Mirrors SessionManager::DoAuth()
  async _doAuth() {
    const data = await this.client.stbDoAuth();

    if (data && data.js === false) {
      throw new Error('do_auth: authentication rejected by portal');
    }
    
    // Check for token rotation
    if (data && data.js && typeof data.js === 'object') {
      if (typeof data.js.token === 'string' && data.js.token && data.js.token !== this.identity.token) {
        console.log(`[SessionManager] Token rotated during do_auth! Old: ${this.identity.token}, New: ${data.js.token}`);
        this.identity.token = data.js.token;
        this.client.setIdentity(this.identity);
        this.client.updateTokenCookie(data.js.token);
      }
    }
  }

  // ── GetProfile ─────────────────────────────────────────────────────────────
  // Mirrors SessionManager::GetProfile() — recursive on status=2
  async _getProfile(authSecondStep = false) {
    const data = await this.client.stbGetProfile(authSecondStep);

    if (!data || !data.js) throw new Error('get_profile: empty response');

    // Check for token rotation
    if (data && data.js && typeof data.js === 'object') {
      if (typeof data.js.token === 'string' && data.js.token && data.js.token !== this.identity.token) {
        console.log(`[SessionManager] Token rotated during get_profile! Old: ${this.identity.token}, New: ${data.js.token}`);
        this.identity.token = data.js.token;
        this.client.setIdentity(this.identity);
        this.client.updateTokenCookie(data.js.token);
      }
    }

    const js = data.js;
    this.profile = {
      store_auth_data_on_stb: !!js.store_auth_data_on_stb,
      status: js.status !== undefined ? Number(js.status) : -1,
      msg: js.msg || '',
      block_msg: js.block_msg || '',
      watchdog_timeout: js.watchdog_timeout !== undefined ? Number(js.watchdog_timeout) : 120,
      timeslot: js.timeslot !== undefined ? Number(js.timeslot) : 90,
    };

    console.log(`[SessionManager] profile status=${this.profile.status} timeslot=${this.profile.timeslot}`);

    switch (this.profile.status) {
      case 0:
        return; // authenticated!

      case 2:
        // Need credentials
        await this._doAuth();
        await this._getProfile(true); // recursive second step
        return;

      case 1:
      default:
        throw new Error(`Portal blocked: ${this.profile.msg || this.profile.block_msg || 'unknown'}`);
    }
  }

  // ── Full authenticate sequence ─────────────────────────────────────────────
  // Mirrors SessionManager::Authenticate() with retry loop
  async authenticate() {
    if (this.isAuthenticating) return;

    this.isAuthenticating = true;
    this.authenticated = false;
    this.lastError = null;

    if (this._statusCallback && this.authenticated) {
      this._statusCallback('lost');
    }

    this._stopWatchdog();

    let attempt = 0;
    while (!this.authenticated && ++attempt <= MAX_RETRIES) {
      try {
        if (attempt > 1) {
          console.log(`[SessionManager] retry ${attempt}/${MAX_RETRIES} in ${RETRY_DELAY_MS}ms`);
          await _sleep(RETRY_DELAY_MS);
        }

        if (!this.hasManualToken) {
          await this._doHandshake();
        }

        await this._getProfile();

        this.authenticated = true;
        console.log('[SessionManager] authenticated ✓');

      } catch (err) {
        this.lastError = err.message;
        console.error(`[SessionManager] auth attempt ${attempt} failed: ${err.message}`);
        if (attempt === 2 && this._statusCallback) {
          this._statusCallback('error');
        }
      }
    }

    this.isAuthenticating = false;

    if (this.authenticated) {
      if (this._statusCallback) this._statusCallback('ok');
      this._startWatchdog();
      this._startAuthChecker();
    }

    if (!this.authenticated) {
      throw new Error(`Authentication failed after ${MAX_RETRIES} attempts: ${this.lastError}`);
    }
  }

  // ── Watchdog ───────────────────────────────────────────────────────────────
  _startWatchdog() {
    if (this._watchdog) return;
    const timeslot = this.profile?.timeslot || 90;
    this._watchdog = new WatchdogService(timeslot, this.client, (err) => {
      if (err === 'AUTHORIZATION') {
        console.warn('[SessionManager] watchdog signalled session lost — re-authenticating');
        this.authenticated = false;
      }
    });
    this._watchdog.start();
  }

  _stopWatchdog() {
    if (this._watchdog) {
      this._watchdog.stop();
      this._watchdog = null;
    }
  }

  // ── Auth checker (re-auth loop) ────────────────────────────────────────────
  // Mirrors SessionManager::StartAuthInvoker()
  _startAuthChecker() {
    if (this._authTimer) return;
    this._authTimer = setInterval(async () => {
      if (!this.authenticated && !this.isAuthenticating) {
        console.log('[SessionManager] auth checker triggering re-auth');
        try {
          await this.authenticate();
        } catch (e) {
          console.error('[SessionManager] re-auth failed:', e.message);
        }
      }
    }, AUTH_CHECK_INTERVAL_MS);
  }

  destroy() {
    if (this._authTimer) {
      clearInterval(this._authTimer);
      this._authTimer = null;
    }
    this._stopWatchdog();
    this.authenticated = false;
  }
}

function _sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

module.exports = SessionManager;
