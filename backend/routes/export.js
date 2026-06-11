// routes/export.js
// GET /api/export/stbemu — generate and download an STBEmu-compatible backup JSON

'use strict';

const express = require('express');
const crypto  = require('crypto');
const CacheManager = require('../cache/CacheManager');
const { DEVICE_PROFILE } = require('../stalker/deviceProfile');

const STB_MODELS = ['MAG200', 'MAG250', 'MAG254', 'MAG256', 'MAG270', 'MAG322', 'MAG352', 'CUSTOM'];

const FIRMWARE_PRESETS = {
'0.2.18-r14-pub-250': { image_description: '0.2.18-r14-pub-250', image_version: '218', image_date: 'Fri Jan 15 15:20:44 EET 2016' },
  '0.2.18-r19-pub-250': { image_description: '0.2.18-r19-pub-250', image_version: '218', image_date: 'Fri Jan 15 15:20:44 EET 2016' },
  'Generic':            { image_description: 'Generic',            image_version: '000', image_date: '' },
};

// Deterministic UUID v5 (SHA-1, DNS namespace) from the MAC address.
function uuidV5(mac) {
  const ns   = Buffer.from('6ba7b8109dad11d180b400c04fd430c8', 'hex');
  const name = Buffer.from(mac.toLowerCase(), 'utf8');
  const hash = crypto.createHash('sha1').update(ns).update(name).digest();
  hash[6] = (hash[6] & 0x0f) | 0x50; // version 5
  hash[8] = (hash[8] & 0x3f) | 0x80; // variant RFC 4122
  const h = hash.toString('hex');
  return `${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20,32)}`;
}

// MAG250 → mag-250
function modelSlug(model) {
  if (model === 'CUSTOM') return 'custom';
  return model.toLowerCase().replace(/^mag(\d+)$/, 'mag-$1');
}

// mag-250-2.20.02-pub-250  (version string is hardcoded per STBEmu convention)
function firmwareString(model, customFirmware) {
  if (model === 'CUSTOM') return customFirmware || '';
  const slug = modelSlug(model);
  const num  = model.replace(/^MAG/, '');
  return `${slug}-2.20.02-pub-${num}`;
}

// Java String.hashCode — identical to CacheManager.portalHash
function portalHash(url) {
  const s = String(url).trim().replace(/\/c\/?$/, '/');
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return h;
}

function nowTimestamp() {
  const d   = new Date();
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

module.exports = function exportModule(config) {
  const router = express.Router();
  const cache  = new CacheManager(config.dataDir);

  // Shared handler. GET exports the currently-connected/saved config; POST
  // exports an arbitrary profile supplied in the body (so the user can pick any
  // of the profiles created in the UI, connected or not). Profiles live in the
  // browser's localStorage, so the client sends the chosen one here.
  function handleExport(req, res) {
    const saved = cache.load() || {};
    const body  = (req.method === 'POST' && req.body) ? req.body : {};

    // Per-field: explicit body value wins, else fall back to the saved config.
    const pick = (b, s) => (b !== undefined && b !== null && b !== '' ? b : s);
    const src = {
      portal:          pick(body.portal,          saved.portal),
      mac:             pick(body.mac,             saved.mac),
      timezone:        pick(body.timezone,        saved.timezone),
      serial_number:   pick(body.serial_number,   saved.serial_number),
      device_id:       pick(body.device_id,       saved.device_id),
      device_id2:      pick(body.device_id2,      saved.device_id2),
      signature:       pick(body.signature,       saved.signature),
      profile_name:    pick(body.stbemu_profile_name, saved.stbemu_profile_name),
      stb_model:       pick(body.stb_model,       saved.stbemu_stb_model),
      firmware:        pick(body.firmware,        saved.stbemu_firmware),
      custom_firmware: pick(body.custom_firmware, saved.stbemu_custom_firmware),
      token:           body.token,
    };

    if (!src.portal || !src.mac) {
      return res.status(400).json({ error: 'Portal URL and MAC are required to export a profile' });
    }

    const model       = STB_MODELS.includes(src.stb_model) ? src.stb_model : 'MAG250';
    const profileName = (src.profile_name || '').trim() || 'My IPTV Profile';
    const fwPreset    = FIRMWARE_PRESETS[src.firmware] || FIRMWARE_PRESETS['0.2.18-r14-pub-250'];

    // Token: prefer a token already cached for THIS profile's portal, else the
    // token the client sent for the profile, else any globally-saved token.
    const tokenKey = `stalker_${portalHash(src.portal)}`;
    const tokenVal = saved[tokenKey]?.token || src.token || saved.token || '';

    const uuid = uuidV5(src.mac);

    const now = new Date();
    const createdAt = [
      now.getFullYear(), now.getMonth() + 1, now.getDate(),
      now.getHours(), now.getMinutes(), now.getSeconds(),
      now.getMilliseconds() * 1_000_000,
    ];

    const backup = {
      metadata: {
        app_flavor:  'googleplay_pro',
        app_version: 20012042,
        created_at:  createdAt,
      },

      settings: {
        id:                          1,
        app_version_code:            20012042,
        app_prev_version_code:       20012042,
        app_mod_name:                'googleplay_pro',
        is_first_start:              false,
        profile_id:                  2,
        video_aspect_ratio:          'SURFACE_AUTO',
        app_language:                'default',
        hide_navigation_bar:         true,
        always_show_overlay_buttons: true,
        screen_orientation:          'sensor',
        controls_display_timeout:    5000,
        settings_password_protected: false,
        settings_password:           '0000',
        virtual_remote_control: { enabled: true, device_name: 'SM-T500', password: '' },
        auto_start_on_boot:          false,
        upnp_enabled:                false,
        pause_media_in_background:   true,
        network_enable_cache:        true,
        network_cache_size:          20480,
        soft_keyboard_im:            0,
        keyboard_type:               0,
        browser_scale_mode:          0,
        use_recommendation_service:  false,
        temp_dir_for_updates:        '',
        pip_mode_on_pause:           false,
        use_system_volume_level:     false,
        use_media_sessions:          true,
      },

      profiles: [{
        profile: {
          id:                   2,
          uuid,
          name:                 profileName,
          stb_model:            modelSlug(model),
          portal_url:           src.portal,
          is_internal_portal:   false,
          display_resolution:   '1280x720',
          video_resolution:     '1080p60',
          mac_address:          src.mac,
          serial_number:        src.serial_number || '',
          user_agent:           'default',
          language:             'en',
          device_id:            src.device_id  || '',
          use_mac_based_device_id: false,
          mac_seed_net_interface:  '',
          device_id_seed:          '',
          send_device_id:          true,
          device_id2:              src.device_id2 || '',
          device_custom_dev_id2:   true,
          device_signature:        src.signature || '',
          timezone:                src.timezone || 'Europe/London',
          firmware:                firmwareString(model, src.custom_firmware),
          media_player:            'exo',
          firmware_player_engine_ver: DEVICE_PROFILE.player_engine_version || '0x566',
          firmware_js_api_ver:        DEVICE_PROFILE.js_api_version        || '328',
          firmware_stb_api_ver:       DEVICE_PROFILE.stb_api_version       || '134',
          firmware_image_version:     fwPreset.image_version,
          firmware_image_description: fwPreset.image_description,
          firmware_image_date:        fwPreset.image_date,
          hardware_vendor:            'TeleTec',
          hardware_version:           '1.7-BD-00',
          udpxy_enabled:              false,
          udpxy_url:                  '',
          overwrite_stream_protocol:  '',
          use_http_proxy:             false,
          http_proxy_host:            '',
          http_proxy_port:            80,
          allow_emulator_user_agent_info:      false,
          fix_background_color:                false,
          fix_local_file_scheme:               false,
          fix_ajax:                            false,
          use_custom_user_agent:               false,
          custom_user_agent:                   '',
          external_player_send_key_event:      false,
          external_player_send_back_key_event: false,
          external_player_send_exit_key_event: false,
          external_player_send_ok_key_event:   false,
          apply_css_patches:          'stalker_input_patch.css',
          created_by_user:            false,
          enable_ministra_compatibility: true,
          use_browser_forwarding:        false,
        },

        data: [
          { tag: 'config', name: 'portal_device_id2',  value: src.device_id2 || '' },
          { tag: 'env',    name: 'defaultLedLevel',     value: '10' },
          { tag: 'env',    name: 'pri_audio_lang',      value: 'eng' },
          { tag: 'env',    name: 'sec_audio_lang',      value: 'eng' },
          { tag: 'env',    name: 'ssaverDelay',         value: '0' },
          { tag: 'env',    name: 'standbyLedLevel',     value: '90' },
          { tag: 'env',    name: 'subtitle_color',      value: '0' },
          { tag: 'env',    name: 'subtitle_size',       value: '0' },
          { tag: 'env',    name: 'subtitles_on',        value: 'false' },
          { tag: 'user',   name: 'ad.json',             value: '' },
          { tag: 'user',   name: 'multiplex.json',      value: '' },
          ...(tokenVal ? [{ tag: 'user', name: tokenKey, value: JSON.stringify({ token: tokenVal }) }] : []),
        ],
      }],

      remote_controls: [{
        rc:   { name: '-preset-', descriptor: '' },
        keys: [
          { key: 4,   action: 'BTN_EXIT',            long_press: false, is_default: true },
          { key: 4,   action: 'APP_ACTION_APP_EXIT', long_press: true,  is_default: true },
          { key: 66,  action: 'BTN_OK',              long_press: false, is_default: true },
          { key: 23,  action: 'BTN_OK',              long_press: false, is_default: true },
          { key: 85,  action: 'BTN_VIDEO_PLAY_PAUSE',long_press: false, is_default: true },
          { key: 126, action: 'BTN_VIDEO_PLAY_PAUSE',long_press: false, is_default: true },
        ],
      }],
    };

    const filename = `stbemu_backup-${nowTimestamp()}.json`;
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Type', 'application/json');
    res.send(JSON.stringify(backup, null, 2));
  }

  router.get('/stbemu', handleExport);   // exports the connected/saved profile
  router.post('/stbemu', handleExport);  // exports an arbitrary profile from the body

  return router;
};
