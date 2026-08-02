import os
import shlex
import subprocess
from fastapi import APIRouter, Body, HTTPException

router = APIRouter(prefix="/api", tags=["setup"])

# Map wizard provider key -> (base_url_env_key, api_key_env_key, default_base_url)
_PROVIDER_SPEC = {
    "ollama":     ("OLLAMA_BASE_URL", None,                 "http://localhost:11434"),
    "openai":     ("OPENAI_BASE_URL",  "OPENAI_API_KEY",   "https://api.openai.com/v1"),
    "openrouter": ("OPENAI_BASE_URL",  "OPENAI_API_KEY",   "https://openrouter.ai/api/v1"),
    "anthropic":  ("ANTHROPIC_BASE_URL", "ANTHROPIC_API_KEY", "https://api.anthropic.com"),
    "groq":       ("GROQ_BASE_URL",    "GROQ_API_KEY",    "https://api.groq.com/openai/v1"),
    "deepseek":   ("DEEPSEEK_BASE_URL", "DEEPSEEK_API_KEY", "https://api.deepseek.com/v1"),
}

def _env_path():
    """Return the path to the hermes runtime .env file (sibling of config.yaml)."""
    hermes_home = os.environ.get("HERMES_HOME", os.path.expanduser("~/.hermes"))
    cfg = os.environ.get("HERMES_CONFIG_PATH") or os.path.join(hermes_home, "config.yaml")
    return os.path.join(os.path.dirname(cfg), ".env")

def _write_env_line(path, key, value):
    """Set/remove a single key=value line in the env file."""
    os.makedirs(os.path.dirname(path), exist_ok=True)
    lines = []
    if os.path.exists(path):
        with open(path) as f:
            lines = [l for l in f.read().splitlines() if l and not l.strip().startswith(f"{key}=")]
    if value:
        lines.append(f"{key}={shlex.quote(value)}")
    with open(path, "w") as f:
        f.write("\n".join(lines) + "\n")

@router.post("/setup")
def post_setup(body: dict = Body(...)):
    provider = (body.get("provider") or "ollama").lower()
    if provider not in _PROVIDER_SPEC:
        raise HTTPException(400, f"unknown provider: {provider}")
    model = (body.get("model") or "").strip()
    if not model:
        raise HTTPException(400, "model required")
    base_url = (body.get("base_url") or "").strip()
    api_key = (body.get("api_key") or "").strip()

    spec = _PROVIDER_SPEC[provider]
    env_path = _env_path()

    # Always write the base URL — providers need an endpoint to scrape /v1/models
    _write_env_line(env_path, spec[0], base_url)

    # Write API key if this provider uses one and the user supplied it
    if spec[1] and api_key:
        _write_env_line(env_path, spec[1], api_key)

    # Set the selected model via the hermes CLI (writes top-level `model:` to config.yaml)
    res = subprocess.run(
        ["hermes", "config", "set", "model", model],
        capture_output=True, text=True,
        env={**os.environ, "HERMES_HOME": os.environ.get("HERMES_HOME", "/opt/data")},
    )
    if res.returncode != 0:
        # Fallback: write model directly to config.yaml
        import yaml
        cfg_path = os.environ.get("HERMES_CONFIG_PATH")
        if not cfg_path:
            raise HTTPException(500, "HERMES_CONFIG_PATH not set")
        cfg = {}
        if os.path.exists(cfg_path):
            with open(cfg_path) as f:
                cfg = yaml.safe_load(f) or {}
        cfg["model"] = model
        with open(cfg_path, "w") as f:
            yaml.safe_dump(cfg, f, default_flow_style=False)

    return {"ok": True, "provider": provider, "model": model, "env_path": env_path}
