// config.js — centralised configuration loaded from environment variables

const path = require('path');

const config = {
  port: parseInt(process.env.PORT || '3000', 10),
  dataDir: process.env.DATA_DIR || path.join(__dirname, '..', 'data'),
  nodeEnv: process.env.NODE_ENV || 'development',

  // Optional pre-seeded portal from env
  preseeded: {
    portal: process.env.PORTAL_URL || null,
    mac: process.env.PORTAL_MAC || null,
    timezone: process.env.PORTAL_TIMEZONE || null,
  },
};

config.cacheDir = path.join(config.dataDir, 'cache');
config.configFile = path.join(config.dataDir, 'config.json');

module.exports = config;
