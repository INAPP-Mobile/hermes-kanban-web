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


def _merged_env(hermes_home):
    """Return os.environ overlaid with the runtime .env file (file wins), so
    provider settings written by /api/setup are seen immediately without a
    container restart."""
    env = dict(os.environ)
    # Mirrors app/routes/setup.py::_env_path: the .env sits as a sibling of
    # config.yaml (i.e. under HERMES_CONFIG_PATH's dir when that is set).
    cfg = os.environ.get("HERMES_CONFIG_PATH") or os.path.join(hermes_home, "config.yaml")
    env_path = os.path.join(os.path.dirname(cfg), ".env")
    if not os.path.exists(env_path):
        return env
    with open(env_path) as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, _, val = line.partition("=")
            key = key.strip()
            if key:
                env[key] = val.strip()
    return env


def _model_from_config(config_path):
    """Extract the model name from config.yaml, handling both the legacy string
    form (`model: qwen3:8b`) and the CLI dict form
    (`model: {provider:…, default: qwen3:8b, base_url:…}`)."""
    if not config_path or not os.path.exists(config_path):
        return ""
    try:
        with open(config_path) as f:
            cfg = yaml.safe_load(f) or {}
    except Exception:
        return ""
    raw = cfg.get("model")
    if isinstance(raw, dict):
        return str(raw.get("default") or raw.get("name") or "").strip()
    if isinstance(raw, str):
        return raw.strip()
    return ""


def _env_file_has_provider(hermes_home):
    """True if the runtime .env FILE (not os.environ) sets any provider key."""
    # Mirrors app/routes/setup.py::_env_path: the .env sits as a sibling of
    # config.yaml.
    cfg = os.environ.get("HERMES_CONFIG_PATH") or os.path.join(hermes_home, "config.yaml")
    env_path = os.path.join(os.path.dirname(cfg), ".env")
    if not os.path.exists(env_path):
        return False
    with open(env_path) as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key = line.partition("=")[0].strip()
            if any(key == k or key.startswith(k + "_") or key.startswith(p + "_")
                   for k in _PROVIDER_ENV_KEYS
                   for p in _PROVIDER_KEY_PREFIXES):
                return True
    return False


def _detect_current_config(hermes_home):
    """Return (provider_key, base_url, model) from current env/config."""
    config_path = _config_path()
    model = _model_from_config(config_path)

    # Detect provider against merged env (os.environ + .env file) so that a
    # freshly saved setup is recognized on the next page reload.
    env = _merged_env(hermes_home)
    for pk, (url_var, key_var) in _PROVIDER_MAP.items():
        url_val = env.get(url_var, "") or ""
        key_val = env.get(key_var, "") or ""
        if url_val.strip() and not url_val.startswith("#"):
            return pk, url_val.strip(), model
        if key_val.strip() and not key_val.startswith("#"):
            # For openrouter without explicit base_url, use default
            base = env.get(url_var, _OPENROUTER_DEFAULT) or _OPENROUTER_DEFAULT
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
