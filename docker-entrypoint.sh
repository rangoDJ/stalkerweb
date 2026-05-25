#!/bin/sh
# Fix data directory ownership if possible; ignore failures in rootless setups.
chown -R appuser:appgroup /app/data 2>/dev/null || \
  chmod -R a+rwX /app/data 2>/dev/null || true

# Drop privileges to appuser.  Rootless Docker lacks CAP_SETGID so su-exec
# cannot call setgroups() — probe first and fall back to the current user.
if su-exec appuser true 2>/dev/null; then
  exec su-exec appuser "$@"
else
  exec "$@"
fi
