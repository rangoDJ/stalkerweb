// StalkerClient.js
// Mirrors: SAPI.cpp + libstalkerclient (request.c, stb.c, itv.c, watchdog.c)
//
// This is the core HTTP client that communicates with a Stalker Middleware portal.
// All protocol details are ported 1:1 from the C++ pvr.stalker addon.

'use strict';

const axios = require('axios');
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
  }

  setIdentity(identity) {
    this.identity = identity;
  }

  setTimeout(seconds) {
    this.timeout = seconds * 1000;
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
  // SAPI.cpp adds:    Referer, X-User-Agent
  // We add:           User-Agent (STB string — CRITICAL for portal JSON responses)
  _buildHeaders(isHandshake = false) {
    const id = this.identity;
    const headers = {
      'User-Agent':   STB_USER_AGENT,
      'Cookie':       `mac=${id.mac}; stb_lang=${id.lang}; timezone=${id.time_zone}`,
      'Referer':      this.referer,
      'X-User-Agent': 'Model: MAG250; Link: WiFi',
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

    const params = new URLSearchParams(queryParams);
    const url = `${this.endpoint}?${params.toString()}`;

    console.log(`[StalkerClient] GET ${url}`);

    const response = await axios.get(url, {
      headers,
      timeout: this.timeout,
      // Follow redirects but keep our custom headers
      maxRedirects: 5,
    });

    const body = response.data;

    // Stalker portals return plain-text "Authorization failed." on auth errors
    if (typeof body === 'string') {
      if (body.includes('Authorization failed')) {
        throw new StalkerError('AUTHORIZATION', 'Portal returned: Authorization failed.');
      }
      // Detect HTML responses — means wrong URL or missing STB User-Agent
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

    const response = await axios.get(matrixUrl, {
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
