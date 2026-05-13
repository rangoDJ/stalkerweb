// identity.js — mirrors libstalkerclient/identity.c + identity.h
// Provides the sc_identity_t equivalent as a plain JS object

/**
 * Create a default identity object.
 * All fields mirror the sc_identity_t struct from libstalkerclient.
 */
function createIdentity(overrides = {}) {
  return {
    mac: '00:1A:79:00:00:00',
    lang: 'en',
    time_zone: 'America/New_York',
    token: '',
    valid_token: false,
    login: '',
    password: '',
    serial_number: '0000000000000',
    device_id: '',
    device_id2: '',
    signature: '',        // user-configured device signature (sent on first auth)
    portal_signature: '', // signature returned by the portal (used after first auth)
    ...overrides,
  };
}

/**
 * Default STB version string sent in get_profile requests.
 * Mirrors the hardcoded string in stb.c > sc_stb_get_profile_defaults().
 */
const STB_VERSION_STRING =
  'ImageDescription: 2.20.02-pub-520; ' +
  'ImageDate: Thu Apr 29 15:17:55 EEST 2021; ' +
  'PORTAL version: 5.6.1; ' +
  'API Version: JS API version: 343; ' +
  'STB API version: 146; ' +
  'Player Engine version: 0x588';

module.exports = { createIdentity, STB_VERSION_STRING };
