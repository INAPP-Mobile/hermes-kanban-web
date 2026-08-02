import json
import os

from fastapi import APIRouter, HTTPException

from app.config import THEME_CONFIG_PATH

router = APIRouter()


def get_saved_theme() -> str:
    try:
        if os.path.isfile(THEME_CONFIG_PATH):
            with open(THEME_CONFIG_PATH, "r") as f:
                data = json.load(f)
            return data.get("theme", "light")
    except Exception:
        pass
    return "light"


def set_saved_theme(theme: str) -> None:
    os.makedirs(os.path.dirname(THEME_CONFIG_PATH), exist_ok=True)
    with open(THEME_CONFIG_PATH, "w") as f:
        json.dump({"theme": theme}, f)


@router.get("/api/theme")
def get_theme():
    """Return the persisted theme preference from the server."""
    return {"theme": get_saved_theme()}


@router.put("/api/theme")
def set_theme(body: dict):
    """Persist theme preference on the server."""
    theme = (body.get("theme") or "light").strip()
    if theme not in ("light", "dark"):
        raise HTTPException(400, "theme must be 'light' or 'dark'")
    set_saved_theme(theme)
    return {"ok": True, "theme": theme}
