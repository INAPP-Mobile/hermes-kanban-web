#!/command/with-contenv sh
# Root boot hook (s6 cont-init): generate the nginx runtime config and the
# /terminal/ basic-auth htpasswd before the main program starts.
# - nginx.conf is rendered from nginx.conf.template with $PORT substituted
#   (Railway injects PORT; fallback 8502 matches the template default).
# - .htpasswd is always written so nginx never 500s on a missing file and
#   the terminal is never left open: ADMIN_* unset -> random password is
#   generated and printed to the boot log.
set -e

PORT="${PORT:-8502}"
echo "[kanban-nginx] configuring nginx to listen on ${PORT}"

mkdir -p /etc/nginx/conf.d
sed "s|__PORT__|${PORT}|g" /etc/nginx/nginx.conf.template > /etc/nginx/nginx.conf

ADMIN_USERNAME="${ADMIN_USERNAME:-admin}"
if [ -n "${ADMIN_PASSWORD:-}" ]; then
    htpasswd -bc /etc/nginx/.htpasswd "$ADMIN_USERNAME" "$ADMIN_PASSWORD" 2>/dev/null \
        || printf '%s:%s\n' "$ADMIN_USERNAME" "$(openssl passwd -apr1 "$ADMIN_PASSWORD")" > /etc/nginx/.htpasswd
    echo "[kanban-nginx] /terminal/ basic auth enabled for user ${ADMIN_USERNAME}"
else
    ADMIN_PASSWORD="$(openssl rand -hex 8)"
    htpasswd -bc /etc/nginx/.htpasswd "$ADMIN_USERNAME" "$ADMIN_PASSWORD" 2>/dev/null \
        || printf '%s:%s\n' "$ADMIN_USERNAME" "$(openssl passwd -apr1 "$ADMIN_PASSWORD")" > /etc/nginx/.htpasswd
    echo "[kanban-nginx] WARNING: ADMIN_PASSWORD unset — /terminal/ uses a generated password"
    echo "[kanban-nginx] user=${ADMIN_USERNAME} password=${ADMIN_PASSWORD} (see Railway logs)"
fi
chmod 644 /etc/nginx/.htpasswd

# Writable runtime dirs for the non-root nginx (hermes user)
mkdir -p /tmp/nginx-client-temp /tmp/nginx-proxy-temp /tmp/nginx-fastcgi-temp /tmp/nginx-uwsgi-temp /tmp/nginx-scgi-temp
chown hermes:hermes /tmp/nginx-client-temp /tmp/nginx-proxy-temp /tmp/nginx-fastcgi-temp /tmp/nginx-uwsgi-temp /tmp/nginx-scgi-temp 2>/dev/null || true
