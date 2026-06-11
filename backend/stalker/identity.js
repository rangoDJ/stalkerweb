// identity.js — mirrors libstalkerclient/identity.c + identity.h
// Provides the sc_identity_t equivalent as a plain JS object

/**
 * Create a default identity object.
 * All fields mirror the sc_identity_t struct from libstalkerclient.
 */
function randomSerial() {
  return 'STB' + Math.random().toString(36).slice(2, 10).toUpperCase();
}

function createIdentity(overrides = {}) {
  return {
    mac: '00:1A:79:00:00:00',
    lang: 'en',
    time_zone: 'America/New_York',
    token: '',
    valid_token: false,
    login: '',
    password: '',
    serial_number: randomSerial(),
    device_id: '',
    device_id2: '',
    signature: '',        // user-configured device signature (sent on first auth)
    portal_signature: '', // signature returned by the portal (used after first auth)
    // Extra STBemu fingerprint fields (sent to mimic the MAG250 STB exactly).
    // All optional — when blank, StalkerClient derives a stable value from
    // mac/serial so the request *shape* still matches STBemu. Set these to the
    // values from your real STB/STBemu profile for byte-exact mimicry.
    adid: '',             // advertising id — cookie on every portal call
    prehash: '',          // sent on handshake + get_profile (anti-clone hash)
    hw_version_2: '',     // secondary hw hash sent on get_profile
    metrics_random: '',   // "random" field inside the get_profile metrics JSON
    ...overrides,
  };
}

/**
 * Default STB version string sent in get_profile requests.
 * Mirrors the hardcoded string in stb.c > sc_stb_get_profile_defaults().
 */
// Matches the `ver` parameter STBemu (MAG250 profile) sends in get_profile,
// captured from a live STBemu session.
const STB_VERSION_STRING =
  'ImageDescription: 0.2.16-234; ' +
  'ImageDate: Fri Jan 15 15:20:44 EET 2016; ' +
  'PORTAL version: 5.6.1; ' +
  'API Version: JS API version: 343; ' +
  'STB API version: 146; ' +
  'Player Engine version: 0x588';

module.exports = { createIdentity, STB_VERSION_STRING };
