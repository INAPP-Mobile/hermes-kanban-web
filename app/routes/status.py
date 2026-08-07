import os
from fastapi import APIRouter, Depends
import yaml

from app.security import _check_api_token

router = APIRouter(prefix="/api", tags=["status"], dependencies=[Depends(_check_api_token)])

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

# Map provider key -> (base_url_env, api_key_env)
_PROVIDER_MAP = {
    "ollama":   ("OLLAMA_BASE_URL", "OLLAMA_API_KEY"),
    "openai":   ("OPENAI_BASE_URL", "OPENAI_API_KEY"),
    "anthropic":("ANTHROPIC_BASE_URL", "ANTHROPIC_API_KEY"),
    "groq":     ("GROQ_BASE_URL", "GROQ_API_KEY"),
    "deepseek": ("DEEPSEEK_BASE_URL", "DEEPSEEK_API_KEY"),
    "openrouter":("OPENROUTER_DEFAULT_URL", "OPENROUTER_API_KEY"),  # no base_url in env, use constant
}

_OPENROUTER_DEFAULT = "https://openrouter.ai/api/v1"


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


def _detect_current_config(hermes_home):
    """Return (provider_key, base_url, model) from current env/config."""
    config_path = _config_path()
    model = ""
    if config_path and os.path.exists(config_path):
        try:
            with open(config_path) as f:
                cfg = yaml.safe_load(f) or {}
            model = (cfg.get("model") or "").strip()
        except Exception:
            pass

    # Detect provider by checking which group has a key/url set
    for pk, (url_var, key_var) in _PROVIDER_MAP.items():
        url_val = os.environ.get(url_var, "") or ""
        key_val = os.environ.get(key_var, "") or ""
        if url_val.strip() and not url_val.startswith("#"):
            return pk, url_val.strip(), model
        if key_val.strip() and not key_val.startswith("#"):
            # For openrouter without explicit base_url, use default
            base = os.environ.get(url_var, _OPENROUTER_DEFAULT) or _OPENROUTER_DEFAULT
            return pk, base.strip(), model

    return "", "", model


@router.get("/status")
def get_status():
    hermes_home = os.environ.get("HERMES_HOME", os.path.expanduser("~/.hermes"))
    provider_key, base_url, model = _detect_current_config(hermes_home)

    has_provider_env = bool(provider_key)
    has_provider_envfile = not has_provider_env and _env_file_has_provider(hermes_home)

    return {
        "llm_configured": bool(model and (has_provider_env or has_provider_envfile)),
        "model": model,
        "provider_key": provider_key if has_provider_env else "",
        "base_url": base_url if has_provider_env else "",
        "provider_count": sum(1 for k in _PROVIDER_ENV_KEYS if os.environ.get(k)),
        "active_profile": "default",
    }
