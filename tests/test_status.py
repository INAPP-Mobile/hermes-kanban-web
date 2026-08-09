import os
import tempfile
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient

from main import app


@pytest.fixture(autouse=True)
def _temp_hermes_home(tmp_path):
    env = {"HERMES_HOME": str(tmp_path)}
    with patch.dict(os.environ, env, clear=False):
        yield


@pytest.mark.asyncio
async def test_status_unconfigured():
    """No config.yaml and no provider keys -> llm_configured=False."""
    client = TestClient(app)
    res = client.get("/api/status")
    assert res.status_code == 200
    data = res.json()
    assert data["llm_configured"] is False
    assert data["model"] == ""
    assert data["provider_count"] == 0


@pytest.mark.asyncio
async def test_status_with_model_and_provider():
    """config.yaml has model, env has OLLAMA_BASE_URL -> llm_configured=True."""
    import yaml
    home = os.environ["HERMES_HOME"]
    cfg_path = os.path.join(home, "config.yaml")
    with open(cfg_path, "w") as f:
        yaml.safe_dump({"model": "qwen3:8b"}, f)

    client = TestClient(app)
    with patch.dict(os.environ, {"OLLAMA_BASE_URL": "http://localhost:11434"}):
        res = client.get("/api/status")
    assert res.status_code == 200
    data = res.json()
    assert data["llm_configured"] is True
    assert data["model"] == "qwen3:8b"


@pytest.mark.asyncio
async def test_status_model_dict_form_detected():
    """config.yaml uses the CLI dict form (model: {provider, default, base_url})
    and the provider base URL lives in the .env FILE, not os.environ. This is the
    exact post-setup layout on Railway; previously the wizard re-opened because
    llm_configured stayed False (dict .strip() raised, swallowed to '')."""
    import yaml
    home = os.environ["HERMES_HOME"]
    cfg_path = os.path.join(home, "config.yaml")
    with open(cfg_path, "w") as f:
        yaml.safe_dump({
            "model": {
                "provider": "ollama",
                "default": "qwen3:8b",
                "base_url": "https://ollama.railway.internal:11434",
            }
        }, f)

    env_path = os.path.join(home, ".env")
    with open(env_path, "w") as f:
        f.write("OLLAMA_BASE_URL=https://ollama.railway.internal:11434\n")

    client = TestClient(app)
    res = client.get("/api/status")
    assert res.status_code == 200
    data = res.json()
    assert data["llm_configured"] is True
    assert data["model"] == "qwen3:8b"
    assert data["provider_key"] == "ollama"
    assert data["base_url"] == "https://ollama.railway.internal:11434"


@pytest.mark.asyncio
async def test_status_provider_in_envfile():
    """Provider key absent from env but present in ~/.hermes/.env -> configured."""
    import yaml
    home = os.environ["HERMES_HOME"]
    cfg_path = os.path.join(home, "config.yaml")
    with open(cfg_path, "w") as f:
        yaml.safe_dump({"model": "gpt-4o"}, f)

    env_path = os.path.join(home, ".env")
    with open(env_path, "w") as f:
        f.write("OPENAI_API_KEY=sk-test\n")

    client = TestClient(app)
    with patch.dict(os.environ, {}, clear=False):
        res = client.get("/api/status")
    assert res.status_code == 200
    data = res.json()
    assert data["llm_configured"] is True


@pytest.mark.asyncio
async def test_status_provider_key_prefix_matching():
    """Lines like ANTHROPIC_BASE_URL=... in .env should match provider prefixes."""
    import yaml
    home = os.environ["HERMES_HOME"]
    cfg_path = os.path.join(home, "config.yaml")
    with open(cfg_path, "w") as f:
        yaml.safe_dump({"model": "claude-3-5"}, f)

    env_path = os.path.join(home, ".env")
    with open(env_path, "w") as f:
        f.write("ANTHROPIC_BASE_URL=https://api.anthropic.com\nANTHROPIC_API_KEY=sk-ant-xxx\n")

    client = TestClient(app)
    res = client.get("/api/status")
    assert res.status_code == 200
    data = res.json()
    assert data["llm_configured"] is True


@pytest.mark.asyncio
async def test_status_comment_lines_skipped():
    """Comment lines in .env should not be treated as provider keys."""
    import yaml
    home = os.environ["HERMES_HOME"]
    cfg_path = os.path.join(home, "config.yaml")
    with open(cfg_path, "w") as f:
        yaml.safe_dump({"model": "qwen3:8b"}, f)

    env_path = os.path.join(home, ".env")
    with open(env_path, "w") as f:
        f.write("# OLLAMA_BASE_URL=http://localhost:11434\n")

    client = TestClient(app)
    res = client.get("/api/status")
    assert res.status_code == 200
    data = res.json()
    # Only model in config, no actual provider key in env -> False
    assert data["llm_configured"] is False


@pytest.mark.asyncio
async def test_status_provider_count_counts_all_keys():
    """provider_count reflects the number of matched env keys."""
    client = TestClient(app)
    with patch.dict(os.environ, {
        "OLLAMA_BASE_URL": "http://localhost:11434",
        "OPENAI_API_KEY": "sk-xxx",
    }):
        res = client.get("/api/status")
    assert res.status_code == 200
    data = res.json()
    assert data["provider_count"] == 2
