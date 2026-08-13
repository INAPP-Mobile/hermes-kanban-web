#!/bin/sh
# ttyd web terminal launcher
# - binds to loopback only (nginx exposes /terminal/ on the public port)
# - ttyd's native credential auth as a second layer behind nginx HTTP Basic Auth
# - shell is a banner script that prints usage instructions, then execs bash
# Runs as the hermes user via supervisord.
set -e

if [ -n "${ADMIN_USERNAME:-}" ] && [ -n "${ADMIN_PASSWORD:-}" ]; then
    exec ttyd -W -i 127.0.0.1 -p 7681 -c "${ADMIN_USERNAME}:${ADMIN_PASSWORD}" /usr/local/bin/terminal-shell.sh
fi

exec ttyd -W -i 127.0.0.1 -p 7681 /usr/local/bin/terminal-shell.sh
