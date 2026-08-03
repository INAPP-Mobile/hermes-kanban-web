import os
from fastapi import APIRouter
import yaml

router = APIRouter(prefix="/api", tags=["status"])

_PROVIDER_ENV_KEYS = (
    "OLLAMA_BASE_URL", "OLLAMA_API_KEY",
    "OPENAI_BASE_URL", "OPENAI_API_KEY",
    "ANTHROPIC_API_KEY", "ANTHROPIC_BASE_URL",
    "GROQ_API_KEY", "GROQ_BASE_URL",
    "DEEPSEEK_API_KEY", "DEEPSEEK_BASE_URL",
    "OPENROUTER_API_KEY",
)

_PROVIDER_KEY_PREFIXES = tuple(
    k.partition("_")[0] for k in _PROVIDER_ENV_KEYS
)


def _config_path():
    hermes_home = os.environ.get("HERMES_HOME", os.path.expanduser("~/.hermes"))
    return os.environ.get("HERMES_CONFIG_PATH") or os.path.join(hermes_home, "config.yaml")


def _env_file_has_provider(hermes_home):
    env_path = os.path.join(hermes_home, ".env")
    if not os.path.exists(env_path):
        return False
    with open(env_path) as f:
        for line in f:
            if "=" in line and not line.startswith("#"):
                key = line.partition("=")[0].strip()
                if any(key == k or key.startswith(k + "_") or key.startswith(p + "_")
                       for k in _PROVIDER_ENV_KEYS
                       for p in _PROVIDER_KEY_PREFIXES):
                    return True
    return False


@router.get("/status")
def get_status():
    model = ""
    hermes_home = os.environ.get("HERMES_HOME", os.path.expanduser("~/.hermes"))
    config_path = _config_path()
    if config_path and os.path.exists(config_path):
        try:
            with open(config_path) as f:
                cfg = yaml.safe_load(f) or {}
            model = (cfg.get("model") or "").strip()
        except Exception:
            cfg = {}
    has_provider_env = any(os.environ.get(k) for k in _PROVIDER_ENV_KEYS)
    has_provider_envfile = not has_provider_env and _env_file_has_provider(hermes_home)
    return {
        "llm_configured": bool(model and (has_provider_env or has_provider_envfile)),
        "model": model,
        "provider_count": sum(1 for k in _PROVIDER_ENV_KEYS if os.environ.get(k)),
        "active_profile": "default",
    }
