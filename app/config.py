import os

# Project root (where main.py lives)
PROJECT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

STATIC_DIR = PROJECT_DIR

# HERMES_HOME resolves persistent state location. In the Hermes agent
# container this is /opt/data (env-injected by the Dockerfile). Locally
# it falls back to ~/.hermes so existing installations keep working.
HERMES_HOME = os.environ.get("HERMES_HOME") or os.path.expanduser("~/.hermes")
KANBAN_DIR = os.path.join(HERMES_HOME, "kanban")

BOARDS_DIR = os.path.join(KANBAN_DIR, "boards")
STASH_DIR = os.path.join(KANBAN_DIR, "stash")
THEME_CONFIG_PATH = os.path.join(KANBAN_DIR, "theme.json")
HERMES_CONFIG_PATH = os.path.join(HERMES_HOME, "config.yaml")
PROFILES_DIR = os.path.join(HERMES_HOME, "profiles")
