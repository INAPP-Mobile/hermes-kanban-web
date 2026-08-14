#!/bin/sh
# ttyd web terminal launcher
# - binds to loopback only (nginx exposes /kanban-terminal/ on the public port)
# - runs with ttyd's built-in token auth:
#     -c user:pass   -> AuthToken first-message check (token from ttyd login page)
# - credential source: /etc/nginx/.ttyd-credential (written by the cont-init
#   boot hook) or ADMIN_USERNAME/ADMIN_PASSWORD
# - shell is a banner script that prints usage instructions, then execs bash
# Runs as the hermes user via supervisord.
set -e

CRED=""
if [ -r /etc/nginx/.ttyd-credential ]; then
    CRED="$(cat /etc/nginx/.ttyd-credential 2>/dev/null || true)"
fi

if [ -z "${CRED}" ] && [ -n "${ADMIN_USERNAME:-}" ] && [ -n "${ADMIN_PASSWORD:-}" ]; then
    CRED="${ADMIN_USERNAME}:${ADMIN_PASSWORD}"
fi

if [ -n "${CRED}" ]; then
    exec ttyd -W -i 127.0.0.1 -p 7681 -c "${CRED}" /usr/local/bin/terminal-shell.sh
fi

# No credential available anywhere — refuse to start open. The boot hook always
# writes /etc/nginx/.ttyd-credential, so this is a last-resort guard.
echo "[ttyd] FATAL: no terminal credential found (/etc/nginx/.ttyd-credential or ADMIN_PASSWORD)" >&2
exit 1
