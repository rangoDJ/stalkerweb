'use strict';

const { STB_VERSION_STRING } = require('./identity');

function parseVersionString(ver) {
  const get = (key) => {
    const m = ver.match(new RegExp(key + ':\\s*([^;]+)'));
    return m ? m[1].trim() : null;
  };
  return {
    image_description:     get('ImageDescription'),
    image_date:            get('ImageDate'),
    portal_version:        get('PORTAL version'),
    js_api_version:        get('JS API version'),
    stb_api_version:       get('STB API version'),
    player_engine_version: get('Player Engine version'),
  };
}

const DEVICE_PROFILE = {
  stb_type:     'MAG250',
  hw_version:   '1.7-BD-00',
  image_version: '216',
  user_agent:   'Mozilla/5.0 (QtEmbedded; U; Linux; C) AppleWebKit/533.3 (KHTML, like Gecko) MAG200 stb mergotv/4.2.16.40 Safari/533.3',
  x_user_agent: 'Model: MAG250; Link: WiFi',
  ...parseVersionString(STB_VERSION_STRING),
};

module.exports = { DEVICE_PROFILE };
