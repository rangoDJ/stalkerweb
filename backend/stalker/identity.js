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
    signature: '',
    ...overrides,
  };
}

/**
 * Default STB version string sent in get_profile requests.
 * Mirrors the hardcoded string in stb.c > sc_stb_get_profile_defaults().
 */
const STB_VERSION_STRING =
  'ImageDescription: 0.2.16-250; ' +
  'ImageDate: 18 Mar 2013 19:56:53 GMT+0200; ' +
  'PORTAL version: 4.9.9; ' +
  'API Version: JS API version: 328; ' +
  'STB API version: 134; ' +
  'Player Engine version: 0x566';

module.exports = { createIdentity, STB_VERSION_STRING };
