import os
import subprocess

import yaml
import httpx
from fastapi import APIRouter, HTTPException

from app.config import HERMES_CONFIG_PATH, HERMES_HOME, PROFILES_DIR
from app.models import ProfileCreate

router = APIRouter()


def _cli_env():
    """Env for hermes CLI subprocesses.

    The CLI resolves its state (including wrapper scripts) relative to
    Path.home(). The container can run the web worker with HOME pointing
    somewhere un-writable for the hermes user, which makes profile
    create/delete fail on the wrapper. Pin HOME to HERMES_HOME so the
    CLI's Path.home() lands inside the same location as PROFILES_DIR.
    """
    env = dict(os.environ)
    env["HOME"] = HERMES_HOME
    return env


def _get_all_models_from_config():
    """Collect model IDs from every provider source in hermes config.

    Sources:
    1. litellm-proxy custom provider -> /v1/models endpoint
    2. model_catalog.providers -> explicit provider URLs
    3. Other providers that have a base_url (direct openai-compatible APIs)
    """
    models = set()
    if not os.path.exists(HERMES_CONFIG_PATH):
        return []

    with open(HERMES_CONFIG_PATH, "r") as f:
        cfg = yaml.safe_load(f) or {}

    providers = cfg.get("providers", {})

    # 1. Custom providers (litellm-proxy, etc.) — fetch /v1/models
    custom_providers = cfg.get("custom_providers", [])
    if isinstance(custom_providers, list):
        for cp in custom_providers:
            base_url = (cp.get("base_url") or "").rstrip("/")
            if not base_url:
                continue
            # Try /v1/models
            try:
                resp = httpx.get(f"{base_url}/v1/models", timeout=10)
                resp.raise_for_status()
                data = resp.json()
                for m in data.get("data", []):
                    mid = m.get("id", "")
                    if mid:
                        models.add(mid)
            except Exception:
                pass

    # 2. model_catalog providers
    model_catalog = cfg.get("model_catalog", {})
    catalog_providers = model_catalog.get("providers", {})
    for pname, pconf in catalog_providers.items():
        url = (pconf.get("url") or "").rstrip("/") if isinstance(pconf, dict) else ""
        if not url:
            continue
        try:
            resp = httpx.get(url, timeout=10)
            resp.raise_for_status()
            data = resp.json()
            # Could be OpenAI-style {"data": [...]} or a flat list
            if isinstance(data, dict):
                for m in data.get("data", []):
                    mid = m.get("id", "") if isinstance(m, dict) else ""
                    if mid:
                        models.add(mid)
            elif isinstance(data, list):
                for m in data:
                    if isinstance(m, dict):
                        mid = m.get("id", "")
                        if mid:
                            models.add(mid)
                    elif isinstance(m, str):
                        models.add(m)
        except Exception:
            pass

    # 3. Standard providers with base_url (openrouter, bedrock, etc.)
    skip = {"litellm-proxy"}
    for pname, pconf in providers.items():
        if pname in skip:
            continue
        if not isinstance(pconf, dict):
            continue
        base_url = (pconf.get("base_url") or "").rstrip("/")
        if not base_url:
            continue
        try:
            resp = httpx.get(f"{base_url}/v1/models", timeout=10)
            resp.raise_for_status()
            data = resp.json()
            for m in data.get("data", []):
                mid = m.get("id", "") if isinstance(m, dict) else ""
                if mid:
                    models.add(mid)
        except Exception:
            pass

    return sorted(models)


@router.get("/api/models")
def list_models():
    """List all available models from every configured provider."""
    try:
        return _get_all_models_from_config()
    except Exception:
        return []


@router.get("/api/profiles")
def list_profiles():
    """List available Hermes profiles for kanban assignment."""
    profiles = []
    if os.path.isdir(PROFILES_DIR):
        for name in sorted(os.listdir(PROFILES_DIR)):
            profile_config = os.path.join(PROFILES_DIR, name, "config.yaml")
            profile_yaml = os.path.join(PROFILES_DIR, name, "profile.yaml")
            # A profile dir may legitimately lack config.yaml (e.g. freshly
            # created via CLI with no model/clone). Don't skip it or the
            # dropdown won't show newly created profiles.
            if not os.path.isdir(os.path.join(PROFILES_DIR, name)):
                continue
            model = "\u2014"
            alias = ""
            if os.path.isfile(profile_config):
                with open(profile_config, "r") as f:
                    cfg = yaml.safe_load(f) or {}
                model_val = cfg.get("model")
                if isinstance(model_val, dict):
                    model = model_val.get("default", "—") or "—"
                elif isinstance(model_val, str) and model_val.strip():
                    model = model_val.strip()
                else:
                    model = "—"
            if os.path.isfile(profile_yaml):
                with open(profile_yaml, "r") as f:
                    pyaml = yaml.safe_load(f) or {}
                alias = pyaml.get("alias", "") or ""
            if not alias and name == "orchestrator":
                alias = "orchestrator"
            elif not alias and name.startswith("worker"):
                alias = "worker"
            profiles.append({"name": name, "model": model, "alias": alias})
    # Also include root/default
    if os.path.exists(HERMES_CONFIG_PATH):
        with open(HERMES_CONFIG_PATH, "r") as f:
            root_cfg = yaml.safe_load(f) or {}
        model_val = root_cfg.get("model")
        if isinstance(model_val, dict):
            root_model = model_val.get("default", "—")
        elif isinstance(model_val, str) and model_val.strip():
            root_model = model_val.strip()
        else:
            root_model = "—"
        if not any(p["name"] == "default" for p in profiles):
            profiles.insert(0, {"name": "default", "model": root_model, "alias": ""})
    return profiles


@router.post("/api/profiles")
def create_profile(body: ProfileCreate):
    """Create a new Hermes profile via CLI."""
    name = body.name.strip()
    if not name or not name.replace("-", "").replace("_", "").isalnum():
        raise HTTPException(400, "Invalid profile name (only alphanumeric, hyphens, underscores)")
    if os.path.isdir(os.path.join(PROFILES_DIR, name)):
        raise HTTPException(409, f"Profile already exists: {name}")
    cmd = ["hermes", "profile", "create", name]
    if body.clone_from:
        cmd.extend(["--clone-from", body.clone_from])
    if body.description:
        cmd.extend(["--description", body.description])
    try:
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=30, env=_cli_env())
        if result.returncode != 0:
            raise HTTPException(500, result.stderr or result.stdout)
    except FileNotFoundError:
        raise HTTPException(500, "hermes CLI not found")
    # Set model if provided
    if body.model:
        profile_config_path = os.path.join(PROFILES_DIR, name, "config.yaml")
        cfg = {}
        if os.path.isfile(profile_config_path):
            with open(profile_config_path, "r") as f:
                cfg = yaml.safe_load(f) or {}
        # Use the flat "model: <str>" schema the CLI writes; freshly created
        # profiles have no config.yaml so we create/seed it here.
        cfg["model"] = body.model
        with open(profile_config_path, "w") as f:
            yaml.safe_dump(cfg, f, default_flow_style=False)
    return {"ok": True, "name": name}


@router.put("/api/profiles/{profile_name}")
def update_profile(profile_name: str, body: ProfileCreate):
    """Update a Hermes profile (rename, change model, update description).

    Uses CLI for rename and describe where possible; model is set via
    config.yaml since there is no CLI command for per-profile model.
    """
    old_name = profile_name
    if not os.path.isdir(os.path.join(PROFILES_DIR, old_name)):
        raise HTTPException(404, f"Profile not found: {old_name}")

    new_name = body.name.strip()
    if not new_name or not new_name.replace("-", "").replace("_", "").isalnum():
        raise HTTPException(400, "Invalid profile name (only alphanumeric, hyphens, underscores)")

    # 1. Rename via CLI if name changed
    if new_name != old_name:
        new_path = os.path.join(PROFILES_DIR, new_name)
        if os.path.isdir(new_path):
            raise HTTPException(409, f"Profile already exists: {new_name}")
        try:
            result = subprocess.run(
                ["hermes", "profile", "rename", old_name, new_name],
                capture_output=True, text=True, timeout=30, env=_cli_env(),
            )
            if result.returncode != 0:
                raise HTTPException(500, result.stderr or result.stdout)
        except FileNotFoundError:
            raise HTTPException(500, "hermes CLI not found")

    # 2. Set description via CLI
    if body.description:
        try:
            result = subprocess.run(
                ["hermes", "profile", "describe", new_name, "--text", body.description],
                capture_output=True, text=True, timeout=30, env=_cli_env(),
            )
            if result.returncode != 0:
                raise HTTPException(500, result.stderr or result.stdout)
        except FileNotFoundError:
            raise HTTPException(500, "hermes CLI not found")

    # 3. Set model via config.yaml (no CLI command for this)
    if body.model:
        profile_config_path = os.path.join(PROFILES_DIR, new_name, "config.yaml")
        if os.path.isfile(profile_config_path):
            with open(profile_config_path, "r") as f:
                cfg = yaml.safe_load(f) or {}
            cfg.setdefault("model", {})["default"] = body.model
            with open(profile_config_path, "w") as f:
                yaml.safe_dump(cfg, f, default_flow_style=False)

    return {"ok": True, "name": new_name}


@router.delete("/api/profiles/{profile_name}")
def delete_profile(profile_name: str):
    """Delete a Hermes profile via CLI."""
    if not os.path.isdir(os.path.join(PROFILES_DIR, profile_name)):
        raise HTTPException(404, f"Profile not found: {profile_name}")
    try:
        result = subprocess.run(
            ["hermes", "profile", "delete", profile_name, "-y"],
            capture_output=True,
            text=True,
            timeout=30,
            env=_cli_env(),
        )
        if result.returncode != 0:
            raise HTTPException(500, result.stderr or result.stdout)
    except FileNotFoundError:
        raise HTTPException(500, "hermes CLI not found")
    return {"ok": True}
