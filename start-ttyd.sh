#!/bin/sh
# ttyd web terminal launcher
# - binds to loopback only (nginx exposes /terminal/ on the public port)
# - runs with BOTH ttyd's own auth layers:
#     -c user:pass   -> AuthToken first-message check (token comes only from
#                       the auth-protected /terminal/token endpoint)
#     -H X-Auth-User -> nginx injects this header; ttyd checks presence so the
#                       WS handshake itself does not need HTTP Basic auth
#                       (browsers never send cached basic credentials on
#                       WebSocket handshakes, so nginx auth_basic can't gate it)
# - credential source: /etc/nginx/.ttyd-credential (written by the cont-init
#   boot hook, which also writes nginx's .htpasswd) or ADMIN_USERNAME/ADMIN_PASSWORD
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
    exec ttyd -W -i 127.0.0.1 -p 7681 -c "${CRED}" -H X-Auth-User /usr/local/bin/terminal-shell.sh
fi

# No credential available anywhere — refuse to start open. The boot hook always
# writes /etc/nginx/.ttyd-credential, so this is a last-resort guard.
echo "[ttyd] FATAL: no terminal credential found (/etc/nginx/.ttyd-credential or ADMIN_PASSWORD)" >&2
exit 1
