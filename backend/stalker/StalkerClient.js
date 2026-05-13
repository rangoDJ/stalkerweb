// StalkerClient.js
// Mirrors: SAPI.cpp + libstalkerclient (request.c, stb.c, itv.c, watchdog.c)
//
// This is the core HTTP client that communicates with a Stalker Middleware portal.
// All protocol details are ported 1:1 from the C++ pvr.stalker addon.

'use strict';

const axios = require('axios');
const { wrapper } = require('axios-cookiejar-support');
const { CookieJar, Cookie } = require('tough-cookie');
const { STB_VERSION_STRING } = require('./identity');

// The STB user-agent is critical — portals detect it to decide whether
// to return their browser HTML UI or the JSON API responses.
// This exact string comes from pvr.stalker / libstalkerclient.
const STB_USER_AGENT =
  'Mozilla/5.0 (QtEmbedded; U; Linux; C) AppleWebKit/533.3 (KHTML, like Gecko) ' +
  'MAG200 stb mergotv/4.2.16.40 Safari/533.3';

class StalkerClient {
  constructor() {
    this.identity = null;   // sc_identity_t
    this.endpoint = '';     // m_endpoint  → e.g. http://host/stalker_portal/server/load.php
    this.basePath = '';     // m_basePath  → e.g. http://host/stalker_portal/
    this.referer  = '';     // m_referer   → e.g. http://host/stalker_portal/c/
    this.timeout  = 10000; // ms
    this.jar = new CookieJar();
    this.http = wrapper(axios.create({
      jar: this.jar,
      withCredentials: true,
      maxRedirects: 10
    }));
  }

  setIdentity(identity) {
    this.identity = identity;
  }

  setTimeout(seconds) {
    this.timeout = seconds * 1000;
  }

  updateTokenCookie(token) {
    if (!this.basePath) return;
    try {
      const uri = new URL(this.basePath);
      const domainUrl = `${uri.protocol}//${uri.host}`;
      const cookie = new Cookie({ key: 'token', value: token });
      this.jar.setCookieSync(cookie, domainUrl, { ignoreError: true });
    } catch (e) {
      console.warn('[StalkerClient] Failed to set token cookie', e.message);
    }
  }

  async initialize(url) {
    let server = url.trim();
    if (!server.includes('://')) server = 'http://' + server;

    console.log(`[StalkerClient] Discovering portal redirects for: ${server}`);

    // Fresh jar + client for each auth attempt (mirrors C# creating a new HttpClient)
    this.jar = new CookieJar();
    this.http = wrapper(axios.create({ jar: this.jar, withCredentials: true, maxRedirects: 10 }));

    // Set initial raw cookies
    // Note: We don't URL encode these as per C# reference.
    const id = this.identity;
    const uri = new URL(server);
    const domainUrl = `${uri.protocol}//${uri.host}`;
    
    const setRawCookie = (key, value, targetDomain = domainUrl) => {
      if (value !== undefined && value !== null) {
        const cookie = new Cookie({ key, value: String(value) });
        this.jar.setCookieSync(cookie, targetDomain, { ignoreError: true });
      }
    };

    setRawCookie('mac', id.mac);
    setRawCookie('stb_lang', id.lang || 'en');
    setRawCookie('timezone', id.time_zone || 'America/New_York');
    if (id.serial_number) setRawCookie('sn', id.serial_number);
    if (id.device_id) setRawCookie('device_id', id.device_id);
    if (id.device_id2) setRawCookie('device_id2', id.device_id2);
    if (id.signature) setRawCookie('sig', id.signature);

    try {
      const resp = await this.http.get(server, { 
        headers: { 'User-Agent': STB_USER_AGENT, 'X-User-Agent': 'Model: MAG250; Link: WiFi' },
        timeout: this.timeout,
        validateStatus: () => true 
      });
      // Get the effective URL after any redirects
      const effectiveUrl = resp.request && resp.request.res ? resp.request.res.responseUrl : server;
      if (effectiveUrl && effectiveUrl !== server) {
        console.log(`[StalkerClient] Redirect discovered. Effective URL: ${effectiveUrl}`);
        server = effectiveUrl;
        
        // Copy cookies to new domain
        const newUri = new URL(server);
        const newDomainUrl = `${newUri.protocol}//${newUri.host}`;
        setRawCookie('mac', id.mac, newDomainUrl);
        setRawCookie('stb_lang', id.lang || 'en', newDomainUrl);
        setRawCookie('timezone', id.time_zone || 'America/New_York', newDomainUrl);
        if (id.serial_number) setRawCookie('sn', id.serial_number, newDomainUrl);
        if (id.device_id) setRawCookie('device_id', id.device_id, newDomainUrl);
        if (id.device_id2) setRawCookie('device_id2', id.device_id2, newDomainUrl);
        if (id.signature) setRawCookie('sig', id.signature, newDomainUrl);
      }
    } catch (e) {
      console.warn('[StalkerClient] Could not discover redirects (non-fatal)', e.message);
    }

    // Set endpoints based on effective server URL
    this.setEndpoint(server);

    // Load portal page to establish PHPSESSID
    const portalPageUrl = `${this.basePath}c/`;
    console.log(`[StalkerClient] Loading portal page to establish session: ${portalPageUrl}`);
    try {
      await this.http.get(portalPageUrl, {
        headers: { 'User-Agent': STB_USER_AGENT, 'X-User-Agent': 'Model: MAG250; Link: WiFi' },
        timeout: this.timeout,
        validateStatus: () => true
      });
    } catch (e) {
      console.warn('[StalkerClient] Could not load portal page (non-fatal)', e.message);
    }
  }

  // ── Endpoint normalisation ─────────────────────────────────────────────────
  // Direct port of SAPI::SetEndpoint() including the xpcom.common.js logic.
  //
  // Given:  http://host/stalker_portal/c/
  // Result: basePath = http://host/stalker_portal/
  //         endpoint = http://host/stalker_portal/server/load.php
  //         referer  = http://host/stalker_portal/c/
  //
  // Given:  http://host/stalker_portal/server/load.php
  // Result: basePath = http://host/stalker_portal/server/
  //         endpoint = http://host/stalker_portal/server/load.php
  //         referer  = http://host/stalker_portal/server/
  setEndpoint(url) {
    let server = url.trim();

    // Strip query string and fragment if any
    const qMark = server.indexOf('?');
    if (qMark !== -1) {
      server = server.slice(0, qMark);
    }
    const hashMark = server.indexOf('#');
    if (hashMark !== -1) {
      server = server.slice(0, hashMark);
    }

    // Ensure scheme
    if (!server.includes('://')) {
      server = 'http://' + server;
    }

    const schemeEnd = server.indexOf('://') + 3; // index of first char after "://"
    const afterScheme = server.slice(schemeEnd);

    // Find last '/' in the path portion
    let lastSlash = afterScheme.lastIndexOf('/');

    if (lastSlash === -1) {
      // No slash at all after scheme — append one
      server += '/';
      lastSlash = server.length - schemeEnd - 1;
    }

    // Absolute index of the last slash in `server`
    const pos = schemeEnd + lastSlash; // mirrors: pos += startPos in SAPI.cpp

    // Check for /c/ pattern — server.substr(pos - 2, 3) == "/c/"
    const threeChars = server.slice(pos - 2, pos + 1);
    const afterLastSlash = server.slice(pos + 1);

    if (threeChars === '/c/' && !afterLastSlash.includes('.php')) {
      // Strip the /c segment:
      //   m_basePath = server.substr(0, pos - 1)   (cuts off "c/")
      //   m_endpoint = m_basePath + "server/load.php"
      //   m_referer  = server.substr(0, pos + 1)   (keeps "c/")
      this.basePath = server.slice(0, pos - 2) + '/'; // up to and including slash before "c"
      this.endpoint = this.basePath + 'server/load.php';
      this.referer  = server.slice(0, pos + 1); // includes trailing slash of /c/
    } else {
      // Non-/c/ URL — use as-is
      this.basePath = server.slice(0, pos + 1); // up to and including last slash
      this.endpoint = server;
      this.referer  = this.basePath;
    }

    console.log(`[StalkerClient] basePath=${this.basePath}`);
    console.log(`[StalkerClient] endpoint=${this.endpoint}`);
    console.log(`[StalkerClient] referer=${this.referer}`);
  }

  getBasePath() {
    return this.basePath;
  }

  // ── Header building ────────────────────────────────────────────────────────
  // Mirrors sc_request_build_headers() in request.c + SAPI::StalkerCall() extras
  //
  // request.c sets:   Cookie, Authorization (non-handshake)
  // SAPI.cpp adds:    Referer, X-User-Agent, X-Requested-With, Accept
  // We add:           User-Agent (STB string — CRITICAL for portal JSON responses)
  _buildHeaders(isHandshake = false) {
    const id = this.identity;
    const headers = {
      'User-Agent':        STB_USER_AGENT,
      'Referer':           this.referer,
      'X-User-Agent':      'Model: MAG250; Link: WiFi',
      'X-Requested-With':  'XMLHttpRequest',
      'Accept':            'application/json, text/javascript, */*; q=0.01',
    };

    if (!isHandshake && id.token) {
      headers['Authorization'] = `Bearer ${id.token}`;
    }

    return headers;
  }

  // ── Core HTTP call ─────────────────────────────────────────────────────────
  // Mirrors SAPI::StalkerCall()
  async _stalkerCall(queryParams, isHandshake = false) {
    const headers = this._buildHeaders(isHandshake);

    // JsHttpRequest=1-xml is required on all calls so the portal returns JSON
    // instead of the browser HTML UI. The C# reference appends it to every URL.
    const params = new URLSearchParams({ ...queryParams, JsHttpRequest: '1-xml' });
    let url = `${this.endpoint}?${params.toString()}`;

    // 404 Fallback logic for handshake
    if (isHandshake) {
      const urlsToTry = [
        url,
        `${this.basePath}stalker_portal/server/load.php?${params.toString()}`,
        `${this.basePath}portal/server/load.php?${params.toString()}`
      ];

      let lastError = null;
      for (const tryUrl of urlsToTry) {
        console.log(`[StalkerClient] GET ${tryUrl}`);
        try {
          const response = await this.http.get(tryUrl, {
            headers,
            timeout: this.timeout,
            validateStatus: (status) => status < 500 // Accept 404 so we can inspect it
          });

          if (response.status === 429) {
            throw new StalkerError('RATE_LIMITED', 'Portal rate-limited handshake (HTTP 429).');
          }
          if (response.status === 404) {
            console.log(`[StalkerClient] 404 Not Found at ${tryUrl}, trying fallback...`);
            continue; // try next
          }
          if (response.status >= 400) {
            throw new Error(`HTTP ${response.status}`);
          }

          // Use the final URL after any redirect, fall back to the URL we tried
          const landedUrl = (response.request?.res?.responseUrl) || tryUrl;

          // Always update endpoints from wherever the handshake actually landed.
          // Mirrors C# which re-derives _effectiveBaseUrl from the final request URI.
          // Strip query string then extract basePath from the /server/load.php position.
          const landedPath = landedUrl.split('?')[0];
          const serverIdx  = landedPath.indexOf('/server/load.php');
          if (serverIdx !== -1) {
            this.basePath = landedPath.substring(0, serverIdx) + '/';
            this.endpoint = landedPath;
            this.referer  = landedPath.substring(0, serverIdx) + '/c/';
          } else {
            this.setEndpoint(landedPath);
          }
          console.log(`[StalkerClient] Handshake landed at ${landedPath} → basePath=${this.basePath}`);

          return this._parseResponse(response.data);
        } catch (e) {
          lastError = e;
        }
      }
      throw new StalkerError('API', `Handshake failed on all paths. Last error: ${lastError ? lastError.message : '404 Not Found'}`);
    } else {
      console.log(`[StalkerClient] GET ${url}`);
      let response;
      try {
        response = await this.http.get(url, {
          headers,
          timeout: this.timeout,
          validateStatus: (s) => s < 500,
        });
      } catch (err) {
        if (err.response?.status === 429) {
          throw new StalkerError('RATE_LIMITED', 'Portal rate-limited this request (HTTP 429).');
        }
        throw err;
      }
      if (response.status === 429) {
        throw new StalkerError('RATE_LIMITED', 'Portal rate-limited this request (HTTP 429).');
      }
      if (response.status >= 400) {
        throw new StalkerError('API', `HTTP ${response.status}`);
      }
      return this._parseResponse(response.data);
    }
  }

  _parseResponse(body) {
    if (typeof body === 'string') {
      if (body.includes('Authorization failed')) {
        throw new StalkerError('AUTHORIZATION', 'Portal returned: Authorization failed.');
      }
      if (body.trimStart().startsWith('<!') || body.trimStart().startsWith('<html')) {
        throw new StalkerError(
          'API',
          `Portal returned HTML instead of JSON. Check your portal URL — it should ` +
          `end in /c/ (e.g. http://host/stalker_portal/c/). ` +
          `Received: ${body.slice(0, 120)}...`
        );
      }
      throw new StalkerError('API', `Unexpected string response: ${body.slice(0, 300)}`);
    }

    return body; // parsed JSON object
  }

  // ── STB: handshake ─────────────────────────────────────────────────────────
  // Mirrors SAPI::STBHandshake() + stb.c sc_stb_handshake_defaults()
  async stbHandshake() {
    const params = {
      type:   'stb',
      action: 'handshake',
      token:  this.identity.token || '',
    };
    return this._stalkerCall(params, /* isHandshake= */ true);
  }

  // ── STB: get_profile ───────────────────────────────────────────────────────
  // Mirrors SAPI::STBGetProfile() + stb.c sc_stb_get_profile_defaults()
  async stbGetProfile(authSecondStep = false) {
    const id = this.identity;
    const params = {
      type:             'stb',
      action:           'get_profile',
      stb_type:         'MAG250',
      sn:               id.serial_number || '0000000000000',
      ver:              STB_VERSION_STRING,
      not_valid_token:  id.valid_token ? '0' : '1',
      auth_second_step: authSecondStep ? '1' : '0',
      hd:               '1',
      num_banks:        '1',
      image_version:    '216',
      hw_version:       '1.7-BD-00',
    };

    if (id.device_id)  params.device_id  = id.device_id;
    if (id.device_id2) params.device_id2 = id.device_id2;
    if (id.signature)  params.signature  = id.signature;

    return this._stalkerCall(params);
  }

  // ── STB: do_auth ──────────────────────────────────────────────────────────
  // Mirrors SAPI::STBDoAuth() + stb.c sc_stb_do_auth_defaults()
  async stbDoAuth() {
    const id = this.identity;
    const params = {
      type:     'stb',
      action:   'do_auth',
      login:    id.login || id.mac, // fallback: use MAC as login (common pattern)
      password: id.password || '',
    };
    if (id.device_id)  params.device_id  = id.device_id;
    if (id.device_id2) params.device_id2 = id.device_id2;

    return this._stalkerCall(params);
  }

  // ── ITV: get_all_channels ─────────────────────────────────────────────────
  async itvGetAllChannels() {
    return this._stalkerCall({ type: 'itv', action: 'get_all_channels' });
  }

  // ── ITV: get_ordered_list ─────────────────────────────────────────────────
  async itvGetOrderedList(genre = '*', page = 1) {
    return this._stalkerCall({
      type:   'itv',
      action: 'get_ordered_list',
      genre:  String(genre),
      fav:    '0',
      sortby: 'number',
      p:      String(page),
    });
  }

  // ── ITV: create_link ──────────────────────────────────────────────────────
  async itvCreateLink(cmd) {
    return this._stalkerCall({
      type:            'itv',
      action:          'create_link',
      cmd,
      forced_storage:  'undefined',
      disable_ad:      '0',
    });
  }

  // ── ITV: get_genres ───────────────────────────────────────────────────────
  async itvGetGenres() {
    return this._stalkerCall({ type: 'itv', action: 'get_genres' });
  }

  // ── ITV: get_epg_info ─────────────────────────────────────────────────────
  async itvGetEPGInfo(period = 24) {
    return this._stalkerCall({ type: 'itv', action: 'get_epg_info', period: String(period) });
  }

  // ── Watchdog: get_events ──────────────────────────────────────────────────
  async watchdogGetEvents(curPlayType = 1, eventActiveId = 0) {
    return this._stalkerCall({
      type:            'watchdog',
      action:          'get_events',
      init:            '0',
      cur_play_type:   String(curPlayType),
      event_active_id: String(eventActiveId),
    });
  }

  // ── Matrix channel URL resolution ─────────────────────────────────────────
  // Mirrors the matrix block in StalkerInstance::GetChannelStreamURL()
  async resolveMatrixUrl(cmd) {
    const parts = cmd.split('/');
    const channel = parts[parts.length - 1];
    const matrixUrl =
      `${this.basePath}server/api/matrix.php` +
      `?channel=${encodeURIComponent(channel)}` +
      `&mac=${encodeURIComponent(this.identity.mac)}`;

    const response = await this.http.get(matrixUrl, {
      headers: this._buildHeaders(),
      timeout: this.timeout,
    });

    const body = response.data;
    if (typeof body === 'string') {
      const p = body.trim().split(' ');
      return p[p.length - 1];
    }
    return null;
  }
}

// Custom error class for Stalker protocol errors
class StalkerError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'StalkerError';
    this.code = code; // 'AUTHORIZATION' | 'API' | 'AUTHENTICATION' | 'UNKNOWN'
  }
}

module.exports = { StalkerClient, StalkerError };
