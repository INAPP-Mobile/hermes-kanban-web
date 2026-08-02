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


def _config_path():
    hermes_home = os.environ.get("HERMES_HOME", os.path.expanduser("~/.hermes"))
    return os.environ.get("HERMES_CONFIG_PATH") or os.path.join(hermes_home, "config.yaml")


@router.get("/status")
def get_status():
    model = ""
    config_path = _config_path()
    if config_path and os.path.exists(config_path):
        try:
            with open(config_path) as f:
                cfg = yaml.safe_load(f) or {}
            model = (cfg.get("model") or "").strip()
        except Exception:
            cfg = {}
    has_provider = any(os.environ.get(k) for k in _PROVIDER_ENV_KEYS)
    return {
        "llm_configured": bool(model and has_provider),
        "model": model,
        "provider_count": sum(1 for k in _PROVIDER_ENV_KEYS if os.environ.get(k)),
        "active_profile": "worker3",
    }
