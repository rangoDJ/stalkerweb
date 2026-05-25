#!/bin/sh
# Runs as root, fixes ownership of the (possibly bind-mounted) data directory,
# then drops privileges and exec's the real process as appuser.
set -e

chown -R appuser:appgroup /app/data

exec su-exec appuser "$@"
