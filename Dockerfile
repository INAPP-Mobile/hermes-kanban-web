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

# HERMES_HOME is the canonical data root in the base image (/opt/data).
# The kanban app reads config from $HERMES_HOME and shells out to `hermes`.
ENV HERMES_HOME=/opt/data \
    PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1

# The app serves the port Railway injects via $PORT. Default fallback is 8502.
EXPOSE 8502

# Healthcheck: the root path serves index.html with a 200.
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
    CMD python3 -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:${PORT:-8502}/', timeout=5)" || exit 1

# The base image's ENTRYPOINT is ["/init", "/opt/hermes/docker/main-wrapper.sh"].
# main-wrapper.sh routes args: if the first arg is an executable, it exec's
# it directly (dropping to the hermes user). /app/start.sh is executable and
# runs as hermes — the s6-overlay /init PID 1 manages the process and
# reaps zombies.
CMD ["/app/start.sh"]
