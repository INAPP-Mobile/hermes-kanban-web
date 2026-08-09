#!/bin/bash
# Railway runtime wrapper for Hermes Kanban Web.
#
# Boot modes:
#   1. Railway direct-start (startCommand runs as PID 1, no s6 init): we are
#      root here and MUST fix /opt/data ownership before dropping to hermes,
#      because Railway's volume bind-mounts as root-owned (drwxr-xr-x root root)
#      and the hermes user (UID 10000) cannot create subdirs like cron/ or
#      kanban/ in it.
#   2. Base-image s6 path (docker run with default entrypoint): stage2-hook
#      (cont-init.d/01-hermes-setup) already chowned /opt/data to hermes, and
#      main-wrapper execs this script as hermes — the root branch is skipped.
#
# After ownership is ensured we drop to the hermes user so uvicorn and every
# `hermes` CLI subprocess it spawns run as hermes (UID 10000), matching the
# base image's intended non-root model.
set -e

if [ "$(id -u)" = 0 ]; then
    echo "[kanban] running as root — ensuring /opt/data ownership for hermes"
    mkdir -p /opt/data
    chown hermes:hermes /opt/data 2>/dev/null || \
        echo "[kanban] warning: chown /opt/data failed (rootless container?) — continuing"
    # Top-level files (config.yaml, auth.json, .env, …) written by a previous
    # root run must become hermes-owned too, else the CLI hits EACCES on them.
    find /opt/data -maxdepth 1 -type f -exec chown hermes:hermes {} + 2>/dev/null || true
    for sub in cron sessions logs hooks memories skills skins plans workspace home profiles kanban; do
        if [ -e "/opt/data/$sub" ]; then
            chown -R hermes:hermes "/opt/data/$sub" 2>/dev/null || true
        fi
    done
    echo "[kanban] dropping to hermes user"
    exec /command/s6-setuidgid hermes "$0" "$@"
fi

PORT="${PORT:-8502}"
export HERMES_HOME="${HERMES_HOME:-/opt/data}"
export HOME="${HOME:-/opt/data}"

KANBAN_DIR="${HERMES_HOME}/kanban"
BOARDS_DIR="${KANBAN_DIR}/boards"
mkdir -p "${BOARDS_DIR}" "${KANBAN_DIR}/stash"

# Seed a minimal config.yaml so the kanban app can read default profile
# and configure the bundled Ollama companion if no model is set.
if [ ! -f "${HERMES_HOME}/config.yaml" ]; then
    # If no config at all, write both kanban and model
    cat > "${HERMES_HOME}/config.yaml" <<YAML
kanban:
  orchestrator_profile: "default"
  auto_decompose: true
model:
  provider: ollama
  base_url: https://ollama.railway.internal:11434
  default: qwen3:8b
YAML
    chmod 644 "${HERMES_HOME}/config.yaml"
    echo "[kanban] wrote initial config.yaml with kanban and Ollama settings"
else
    # If config exists, check if model section is missing and add it
    if ! grep -q "^model:" "${HERMES_HOME}/config.yaml" 2>/dev/null; then
        echo "[kanban] no model configured — adding Ollama companion to existing config"
        # We need to append the model section to the existing YAML.
        echo "" >> "${HERMES_HOME}/config.yaml"
        echo "model:" >> "${HERMES_HOME}/config.yaml"
        echo "  provider: ollama" >> "${HERMES_HOME}/config.yaml"
        echo "  base_url: https://ollama.railway.internal:11434" >> "${HERMES_HOME}/config.yaml"
        echo "  default: qwen3:8b" >> "${HERMES_HOME}/config.yaml"
        chmod 644 "${HERMES_HOME}/config.yaml"
    fi
fi

cd /app

# Load hermes runtime .env (provider API keys, base URLs, etc.) so that
# /api/status can detect configured providers from os.environ.
if [ -f "${HERMES_HOME}/.env" ]; then
    set -a; source "${HERMES_HOME}/.env"; set +a
    echo "[kanban] sourced ${HERMES_HOME}/.env"
fi

# Start the Hermes gateway — it hosts the embedded kanban dispatcher that
# claims 'ready' tasks and runs them on the assigned profile. Without a
# gateway (or legacy `hermes kanban daemon`) tasks sit in 'ready' forever and
# the board never executes anything. We launch it in the background so it
# ticks the dispatcher while uvicorn serves the web UI. Its log is written
# under HERMES_HOME so it survives ephemeral scratch as gateway.log.
GATEWAY_LOG="${HERMES_HOME}/kanban/gateway.log"
if ! pgrep -f "hermes gateway run" >/dev/null 2>&1; then
    echo "[kanban] starting Hermes gateway (embedded kanban dispatcher) → ${GATEWAY_LOG}"
    nohup hermes gateway run >>"${GATEWAY_LOG}" 2>&1 &
    disown || true
else
    echo "[kanban] gateway already running"
fi

exec python3 -m uvicorn main:app \
    --host 0.0.0.0 \
    --port "${PORT}"
