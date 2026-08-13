FROM nousresearch/hermes-agent:latest

LABEL org.opencontainers.image.title="hermes-kanban-web" \
      org.opencontainers.image.description="Web-based Kanban board for managing Hermes agent tasks" \
      org.opencontainers.image.source="https://github.com/INAPP-Mobile/hermes-kanban-web"

# The Hermes agent image ships with uvicorn, fastapi, pydantic, httpx, and
# pyyaml already installed in its venv. We copy the kanban app source into
# /app and let the existing venv provide runtime dependencies.

WORKDIR /app

# Copy the application source (kanban code only — the hermes CLI/runtime
# lives in /opt/hermes from the base image)
COPY --chown=hermes:hermes . /app/

# Ensure the kanban app entry point is executable
RUN chmod +x /app/start.sh

# Persistent Hermes install snapshot: a Railway volume mounted at /opt/hermes
# shadows this directory and starts EMPTY, so first boot re-seeds it from a
# pristine copy. Hardlinks keep the image size flat (no data duplicated);
# fall back to a full copy if the filesystem rejects hardlinks.
RUN cp -al /opt/hermes /opt/hermes.image 2>/dev/null || \
    cp -a /opt/hermes /opt/hermes.image 2>/dev/null || \
    echo "[kanban] warning: /opt/hermes not found — volume seeding disabled"

# --- Web terminal + process supervision + reverse proxy (hexo-template parity) ---
# nginx fronts the public PORT and routes /terminal/ to ttyd behind HTTP
# Basic Auth; supervisord supervises nginx, uvicorn, the gateway and ttyd.
RUN apt-get update \
 && apt-get install -y --no-install-recommends nginx supervisor apache2-utils \
 && rm -rf /var/lib/apt/lists/* \
 && rm -f /etc/nginx/sites-enabled/default

# ttyd 1.7.7 (web terminal, static binary)
RUN curl -fsSL https://github.com/tsl0922/ttyd/releases/download/1.7.7/ttyd.x86_64 -o /usr/local/bin/ttyd \
 && chmod +x /usr/local/bin/ttyd

# ttyd launcher (injects basic-auth credential from env when set) + banner shell
COPY start-ttyd.sh /usr/local/bin/start-ttyd.sh
COPY terminal-shell.sh /usr/local/bin/terminal-shell.sh
RUN chmod +x /usr/local/bin/start-ttyd.sh /usr/local/bin/terminal-shell.sh

# nginx runtime config (rendered at boot with $PORT) + supervisord programs
COPY nginx.conf.template /etc/nginx/nginx.conf.template
COPY supervisord.conf /etc/supervisor/supervisord.conf
# Root boot hook: renders nginx.conf and writes /etc/nginx/.htpasswd for /terminal/
COPY cont-init-nginx.sh /etc/cont-init.d/90-kanban-nginx
RUN chmod +x /etc/cont-init.d/90-kanban-nginx

# HERMES_HOME is the canonical data root in the base image (/opt/data).
# The kanban app reads config from $HERMES_HOME and shells out to `hermes`.
ENV HERMES_HOME=/opt/data \
    PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1

# nginx fronts the port Railway injects via $PORT (rendered at boot into
# nginx.conf). Default fallback is 8502. Keep PORT above 1024 — nginx runs
# as the non-root hermes user.
EXPOSE 8502

# Healthcheck: the root path serves index.html with a 200.
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
    CMD python3 -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:${PORT:-8502}/', timeout=5)" || exit 1

# The base image's ENTRYPOINT is ["/init", "/opt/hermes/docker/main-wrapper.sh"].
# main-wrapper.sh routes args: if the first arg is an executable, it exec's
# it directly (dropping to the hermes user). /app/start.sh is executable and
# runs as hermes — the s6-overlay /init PID 1 manages the process and
# reaps zombies.
# Build cache bust: web terminal (nginx + ttyd + supervisord) added 2026-08-13
CMD ["/app/start.sh"]
