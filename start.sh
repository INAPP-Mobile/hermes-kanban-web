#!/bin/bash
# Railway runtime wrapper for Hermes Kanban Web.
# 1. Ensures HERMES_HOME (default /opt/data) exists and kanban subdirs are present.
# 2. Seeds a minimal config.yaml if none exists (orchestrator_profile default).
# 3. Launches uvicorn on the PORT Railway injects (default 8502 for local dev).
set -e

PORT="${PORT:-8502}"
export HERMES_HOME="${HERMES_HOME:-/opt/data}"
export HOME="${HOME:-/opt/data}"

KANBAN_DIR="${HERMES_HOME}/kanban"
BOARDS_DIR="${KANBAN_DIR}/boards"
mkdir -p "${BOARDS_DIR}" "${KANBAN_DIR}/stash"

# Seed a minimal config.yaml so the kanban app can read default profile
if [ ! -f "${HERMES_HOME}/config.yaml" ]; then
    cat > "${HERMES_HOME}/config.yaml" <<YAML
kanban:
  orchestrator_profile: "worker3"
  auto_decompose: true
YAML
    chmod 644 "${HERMES_HOME}/config.yaml"
fi

cd /app

exec python3 -m uvicorn main:app \
    --host 0.0.0.0 \
    --port "${PORT}"
