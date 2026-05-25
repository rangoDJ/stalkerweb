#!/bin/sh
# Runs as root. Attempts to fix ownership of the bind-mounted data directory,
# then drops privileges and exec's the real process as appuser.
# chown failures are non-fatal (rootless Docker / user-namespace setups).

chown -R appuser:appgroup /app/data 2>/dev/null || \
  chmod -R a+rwX /app/data 2>/dev/null || true

exec su-exec appuser "$@"
