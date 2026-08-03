import os
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient

from main import app as app_main
from app.routes.setup import _PROVIDER_SPEC, post_setup, _write_env_line


def test_provider_spec_contains_expected_keys():
    """All supported providers are in the spec."""
    assert set(_PROVIDER_SPEC.keys()) == {"ollama", "openai", "openrouter", "anthropic", "groq", "deepseek"}


def test_write_env_line_creates_file(tmp_path):
    f = tmp_path / ".env"
    _write_env_line(str(f), "OLLAMA_BASE_URL", "http://localhost:11434")
    content = f.read_text()
    assert "OLLAMA_BASE_URL=http://localhost:11434" in content


def test_write_env_line_updates_existing_key(tmp_path):
    f = tmp_path / ".env"
    f.write_text("FOO=bar\nOLLAMA_BASE_URL=old\n")
    _write_env_line(str(f), "OLLAMA_BASE_URL", "http://new:1234")
    content = f.read_text()
    assert "FOO=bar" in content
    assert "OLLAMA_BASE_URL=http://new:1234" in content
    assert "old" not in content


def test_write_env_line_removes_empty_value(tmp_path):
    f = tmp_path / ".env"
    f.write_text("OLD=foo\nNEW=bar\n")
    _write_env_line(str(f), "NEW", "")
    content = open(str(f)).read()
    assert "OLD=foo" in content
    assert "NEW=" not in content


def test_post_setup_missing_provider_raises_400():
    client = TestClient(app_main)
    res = client.post("/api/setup", json={"provider": "unknown"})
    assert res.status_code == 400


def test_post_setup_missing_model_raises_400():
    client = TestClient(app_main)
    res = client.post("/api/setup", json={"provider": "ollama", "model": ""})
    assert res.status_code == 400


def test_post_setup_ollama_writes_env_file(tmp_path, monkeypatch):
    env_path = str(tmp_path / ".env")
    body = {
        "provider": "ollama",
        "base_url": "http://my-host:11434",
        "model": "qwen3:8b",
        "api_key": "",
        "profile": "worker3"
    }
    with patch("app.routes.setup._env_path", return_value=env_path), \
         patch.dict(os.environ, {"HERMES_HOME": str(tmp_path)}, clear=False):
        result = post_setup(body)
    assert result["provider"] == "ollama"
    assert result["model"] == "qwen3:8b"
    env_content = open(env_path).read()
    assert "OLLAMA_BASE_URL=http://my-host:11434" in env_content


def test_post_setup_openai_writes_api_key(tmp_path, monkeypatch):
    env_path = str(tmp_path / ".env")
    body = {
        "provider": "openai",
        "base_url": "https://api.openai.com/v1",
        "model": "gpt-4o",
        "api_key": "sk-test-key",
        "profile": "worker3"
    }
    with patch("app.routes.setup._env_path", return_value=env_path), \
         patch.dict(os.environ, {"HERMES_HOME": str(tmp_path)}, clear=False):
        result = post_setup(body)
    assert result["ok"] is True
    env_content = open(env_path).read()
    assert "OPENAI_API_KEY" in env_content or "_API_KEY" in env_content
