// middleware/session.js
// Attaches the active Stalker session to every request as req.session.
// Returns 503 if the portal is not connected yet.

'use strict';

module.exports = function sessionMiddleware(appState) {
  return function (req, res, next) {
    if (!appState.sessionManager || !appState.sessionManager.isAuthenticated()) {
      return res.status(503).json({
        error: 'Not connected to a portal. POST /api/auth/connect first.',
      });
    }
    req.stalker = appState;  // expose { client, sessionManager, channelManager, guideManager }
    next();
  };
};
