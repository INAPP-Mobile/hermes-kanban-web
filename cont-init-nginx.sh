#!/bin/sh
# Render nginx.conf from template and create terminal auth files.
# Runs as root during container boot (s6 cont-init or Railway direct-start).
# Installed by the Dockerfile as /etc/cont-init.d/90-kanban-nginx.
#
# - nginx.conf is rendered from nginx.conf.template with $PORT substituted
#   (Railway injects PORT; fallback 8502 matches the template default).
# - .ttyd-credential is always written so ttyd has a credential for its
#   AuthToken first-message check: ADMIN_* unset -> random password is
#   generated and printed to the boot log.
# - No nginx auth_basic / .htpasswd is created: Railway's edge proxy
#   (railway-hikari) returns 407 when an Authorization header reaches a
#   terminal-like path, so all terminal auth is delegated to ttyd (-c).

set -e

PORT="${PORT:-8502}"
ADMIN_USERNAME="${ADMIN_USERNAME:-admin}"
ADMIN_PASSWORD="${ADMIN_PASSWORD:-}"

echo "[kanban-nginx] configuring nginx to listen on ${PORT}"

# Substitute __PORT__ in nginx template
sed "s/__PORT__/${PORT}/g" /etc/nginx/nginx.conf.template > /etc/nginx/nginx.conf

# Create .ttyd-credential for ttyd's -c option (username:password)
# ttyd reads this for the AuthToken first-message check
if [ -n "${ADMIN_PASSWORD}" ]; then
    CRED="${ADMIN_USERNAME}:${ADMIN_PASSWORD}"
else
    # Generate random password if not provided
    CRED="${ADMIN_USERNAME}:$(openssl rand -base64 16 | tr -d '=+/')"
    echo "[kanban-nginx] WARNING: ADMIN_PASSWORD unset — /kanban-terminal/ uses a generated password"
    echo "[kanban-nginx] user=${ADMIN_USERNAME} password=${CRED#*:} (see Railway logs)"
fi

echo "${CRED}" > /etc/nginx/.ttyd-credential
chmod 600 /etc/nginx/.ttyd-credential
chown hermes:hermes /etc/nginx/.ttyd-credential 2>/dev/null || true

# Ensure nginx can read its config (nginx runs as hermes user via supervisord)
chown hermes:hermes /etc/nginx/nginx.conf 2>/dev/null || true
