#!/bin/bash
# Interactive shell for the /terminal/ web terminal (spawned by ttyd).
# Prints a usage banner, then hands off to an interactive bash.
# The hermes CLI stays on PATH so `hermes ...` works out of the box.
export HOME="${HOME:-/opt/data}"
export HERMES_HOME="${HERMES_HOME:-/opt/data}"
case ":$PATH:" in
  *":/opt/hermes/bin:"*) ;;
  *) export PATH="/opt/hermes/bin:/opt/hermes/.venv/bin:${PATH}" ;;
esac

cat <<'BANNER'
┌──────────────────────────────────────────────────────────────┐
│  Hermes Kanban Web — container terminal                       │
│                                                              │
│  The full `hermes` CLI is on your PATH.                       │
│    • Boards    : hermes kanban boards list                    │
│    • New task  : hermes kanban task --board <slug> --create   │
│    • Profiles  : hermes profile list                          │
│    • CLI help  : hermes --help                                │
│                                                              │
│  Data root     : /opt/data (HERMES_HOME)                      │
│  Gateway log   : tail -f /opt/data/kanban/gateway.log         │
│                                                              │
│  Type exit to close this terminal.                            │
└──────────────────────────────────────────────────────────────┘
BANNER

exec bash
