// StalkerClient.js
// Mirrors: SAPI.cpp + libstalkerclient (request.c, stb.c, itv.c, watchdog.c)
//
// This is the core HTTP client that communicates with a Stalker Middleware portal.
// All protocol details are ported 1:1 from the C++ pvr.stalker addon.

'use strict';

const axios = require('axios');
const { STB_VERSION_STRING } = require('./identity');

class StalkerClient {
  constructor() {
    this.identity = null;   // sc_identity_t
    this.endpoint = '';     // m_endpoint  → e.g. http://host/server/load.php
    this.basePath = '';     // m_basePath  → e.g. http://host/
    this.referer = '';      // m_referer   → e.g. http://host/c/
    this.timeout = 10000;   // ms
  }

  setIdentity(identity) {
    this.identity = identity;
  }

  setTimeout(seconds) {
    this.timeout = seconds * 1000;
  }

  // ── Endpoint normalisation ─────────────────────────────────────────────────
  // Mirrors SAPI::SetEndpoint() exactly, including the xpcom.common.js logic.
  setEndpoint(url) {
    let server = url;

    // Ensure scheme
    if (!server.includes('://')) {
      server = 'http://' + server;
    }

    const schemeEnd = server.indexOf('://') + 3; // position after "://"
    const afterScheme = server.slice(schemeEnd);

    // Find last '/' after the scheme
    const lastSlashInPath = afterScheme.lastIndexOf('/');

    if (lastSlashInPath === -1) {
      // No path at all — append '/'
      server += '/';
    }

    // Re-derive positions after possible append
    const schemeEnd2 = server.indexOf('://') + 3;
    const afterScheme2 = server.slice(schemeEnd2);
    const pos = afterScheme2.lastIndexOf('/'); // relative to after-scheme start
    const absPos = schemeEnd2 + pos;           // absolute index in `server`

    // Check for /c/ pattern (Stalker portal portal layout)
    // mirrors: server.substr(pos - 2, 3).compare("/c/") == 0
    const threeChars = server.slice(absPos - 2, absPos + 1);

    if (threeChars === '/c/' && !server.slice(absPos + 1).includes('.php')) {
      // Strip /c/ tail → set endpoint to <base>/server/load.php
      this.basePath = server.slice(0, absPos - 1) + '/'; // strip the '/c'
      // Ensure basePath ends with /
      if (!this.basePath.endsWith('/')) this.basePath += '/';
      this.endpoint = this.basePath + 'server/load.php';
      this.referer = server.slice(0, absPos + 1); // includes /c/
    } else {
      this.basePath = server.slice(0, absPos + 1);
      this.endpoint = server;
      this.referer = this.basePath;
    }

    console.log(`[StalkerClient] basePath=${this.basePath}`);
    console.log(`[StalkerClient] endpoint=${this.endpoint}`);
    console.log(`[StalkerClient] referer=${this.referer}`);
  }

  getBasePath() {
    return this.basePath;
  }

  // ── Header building ────────────────────────────────────────────────────────
  // Mirrors sc_request_build_headers() in request.c
  _buildHeaders(isHandshake = false) {
    const id = this.identity;
    const headers = {
      Cookie: `mac=${id.mac}; stb_lang=${id.lang}; timezone=${id.time_zone}`,
      Referer: this.referer,
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
    });

    const body = response.data;

    // Portal may return plain string "Authorization failed." on auth errors
    if (typeof body === 'string') {
      if (body.includes('Authorization failed')) {
        throw new StalkerError('AUTHORIZATION', 'Portal returned: Authorization failed.');
      }
      throw new StalkerError('API', `Unexpected string response: ${body}`);
    }

    return body; // parsed JSON object
  }

  // ── STB: handshake ─────────────────────────────────────────────────────────
  // Mirrors SAPI::STBHandshake() + stb.c sc_stb_handshake_defaults()
  async stbHandshake() {
    const params = {
      type: 'stb',
      action: 'handshake',
      token: this.identity.token || '',
    };
    return this._stalkerCall(params, /* isHandshake= */ true);
  }

  // ── STB: get_profile ───────────────────────────────────────────────────────
  // Mirrors SAPI::STBGetProfile() + stb.c sc_stb_get_profile_defaults()
  async stbGetProfile(authSecondStep = false) {
    const id = this.identity;
    const params = {
      type: 'stb',
      action: 'get_profile',
      stb_type: 'MAG250',
      sn: id.serial_number || '0000000000000',
      ver: STB_VERSION_STRING,
      not_valid_token: id.valid_token ? '0' : '1',
      auth_second_step: authSecondStep ? '1' : '0',
      hd: '1',
      num_banks: '1',
      image_version: '216',
      hw_version: '1.7-BD-00',
    };

    if (id.device_id) params.device_id = id.device_id;
    if (id.device_id2) params.device_id2 = id.device_id2;
    if (id.signature) params.signature = id.signature;

    return this._stalkerCall(params);
  }

  // ── STB: do_auth ──────────────────────────────────────────────────────────
  // Mirrors SAPI::STBDoAuth() + stb.c sc_stb_do_auth_defaults()
  async stbDoAuth() {
    const id = this.identity;
    const params = {
      type: 'stb',
      action: 'do_auth',
      login: id.login || id.mac, // fallback: use MAC as login (common pattern)
      password: id.password || '',
    };
    if (id.device_id) params.device_id = id.device_id;
    if (id.device_id2) params.device_id2 = id.device_id2;

    return this._stalkerCall(params);
  }

  // ── ITV: get_all_channels ─────────────────────────────────────────────────
  // Mirrors SAPI::ITVGetAllChannels()
  async itvGetAllChannels() {
    return this._stalkerCall({ type: 'itv', action: 'get_all_channels' });
  }

  // ── ITV: get_ordered_list ─────────────────────────────────────────────────
  // Mirrors SAPI::ITVGetOrderedList() + itv.c sc_itv_get_ordered_list_defaults()
  async itvGetOrderedList(genre = '*', page = 1) {
    return this._stalkerCall({
      type: 'itv',
      action: 'get_ordered_list',
      genre: String(genre),
      fav: '0',
      sortby: 'number',
      p: String(page),
    });
  }

  // ── ITV: create_link ──────────────────────────────────────────────────────
  // Mirrors SAPI::ITVCreateLink() + itv.c sc_itv_create_link_defaults()
  async itvCreateLink(cmd) {
    return this._stalkerCall({
      type: 'itv',
      action: 'create_link',
      cmd,
      forced_storage: 'undefined',
      disable_ad: '0',
    });
  }

  // ── ITV: get_genres ───────────────────────────────────────────────────────
  // Mirrors SAPI::ITVGetGenres()
  async itvGetGenres() {
    return this._stalkerCall({ type: 'itv', action: 'get_genres' });
  }

  // ── ITV: get_epg_info ─────────────────────────────────────────────────────
  // Mirrors SAPI::ITVGetEPGInfo()
  async itvGetEPGInfo(period = 24) {
    return this._stalkerCall({ type: 'itv', action: 'get_epg_info', period: String(period) });
  }

  // ── Watchdog: get_events ──────────────────────────────────────────────────
  // Mirrors SAPI::WatchdogGetEvents() + watchdog.c
  async watchdogGetEvents(curPlayType = 1, eventActiveId = 0) {
    return this._stalkerCall({
      type: 'watchdog',
      action: 'get_events',
      init: '0',
      cur_play_type: String(curPlayType),
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
      const parts2 = body.trim().split(' ');
      return parts2[parts2.length - 1];
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
