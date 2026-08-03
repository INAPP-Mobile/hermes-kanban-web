import os
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient

from main import app as app_main


@pytest.fixture(autouse=True)
def _temp_hermes_home(tmp_path):
    home = str(tmp_path / "hermes")
    kanban_dir = str(tmp_path / "kanban")
    theme_config = os.path.join(kanban_dir, "theme.json")
    os.makedirs(home, exist_ok=True)
    os.makedirs(kanban_dir, exist_ok=True)
    with patch("app.routes.theme.THEME_CONFIG_PATH", theme_config), \
         patch.dict(os.environ, {
             "HERMES_HOME": home,
             "KANBAN_DIR": kanban_dir,
         }, clear=False):
        yield


def test_get_theme_defaults_light():
    """No theme.json -> defaults to light."""
    client = TestClient(app_main)
    res = client.get("/api/theme")
    assert res.status_code == 200
    assert res.json()["theme"] == "light"


def test_set_dark_persists():
    """Setting dark writes json and round-trips."""
    client = TestClient(app_main)
    res = client.put("/api/theme", json={"theme": "dark"})
    assert res.status_code == 200
    data = res.json()
    assert data["ok"] is True
    assert data["theme"] == "dark"

    res2 = client.get("/api/theme")
    assert res2.json()["theme"] == "dark"


def test_set_invalid_rejected():
    """Non-light/dark theme must return 400."""
    client = TestClient(app_main)
    res = client.put("/api/theme", json={"theme": "midnight"})
    assert res.status_code == 400
    body = res.json()
    assert "theme must be" in body["detail"].lower()


def test_set_empty_defaults_light():
    """Empty theme falls back to light."""
    client = TestClient(app_main)
    res = client.put("/api/theme", json={"theme": ""})
    assert res.status_code == 200
    data = res.json()
    assert data["theme"] == "light"


def test_set_whitespace_stripped():
    """Whitespace around theme value is trimmed."""
    client = TestClient(app_main)
    res = client.put("/api/theme", json={"theme": "  dark  "})
    assert res.status_code == 200
    data = res.json()
    assert data["theme"] == "dark"
