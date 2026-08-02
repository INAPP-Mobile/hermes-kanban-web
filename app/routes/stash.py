import json
import os
import time
import uuid

from fastapi import APIRouter, HTTPException

from app.config import STASH_DIR

router = APIRouter()


def _stash_path(board_slug: str) -> str:
    return os.path.join(STASH_DIR, f"{board_slug}.json")


def _load_stash(board_slug: str) -> list[dict]:
    path = _stash_path(board_slug)
    if not os.path.isfile(path):
        return []
    try:
        with open(path, "r") as f:
            data = json.load(f)
        if isinstance(data, list):
            return data
    except Exception:
        pass
    return []


def _save_stash(board_slug: str, tasks: list[dict]) -> None:
    os.makedirs(STASH_DIR, exist_ok=True)
    with open(_stash_path(board_slug), "w") as f:
        json.dump(tasks, f, indent=2)


@router.get("/api/stash/{board_slug}")
def get_stash(board_slug: str):
    """Return all stash tasks for a board (local drafts, not server tasks)."""
    return _load_stash(board_slug)


@router.put("/api/stash/{board_slug}")
def replace_stash(board_slug: str, body: dict):
    """Replace the entire stash for a board."""
    tasks = body.get("tasks", [])
    if not isinstance(tasks, list):
        raise HTTPException(400, "tasks must be a list")
    _save_stash(board_slug, tasks)
    return {"ok": True, "count": len(tasks)}


@router.post("/api/stash/{board_slug}")
def add_stash_task(board_slug: str, body: dict):
    """Add a single task to the stash."""
    title = (body.get("title") or "").strip()
    if not title:
        raise HTTPException(400, "title is required")
    tasks = _load_stash(board_slug)
    task = {
        "id": body.get("id") or f"s_{uuid.uuid4().hex[:12]}",
        "title": title,
        "body": body.get("body", ""),
        "assignee": body.get("assignee", "worker"),
        "priority": body.get("priority", 0),
        "goal_mode": body.get("goal_mode", False),
        "workspace_path": body.get("workspace_path"),
        "auto_decompose": body.get("auto_decompose", True),
        "created_at": int(time.time()),
    }
    tasks.append(task)
    _save_stash(board_slug, tasks)
    return {"ok": True, "id": task["id"]}


@router.delete("/api/stash/{board_slug}/{task_id}")
def delete_stash_task(board_slug: str, task_id: str):
    """Remove a single task from the stash."""
    tasks = _load_stash(board_slug)
    before = len(tasks)
    tasks = [t for t in tasks if t.get("id") != task_id]
    if len(tasks) == before:
        raise HTTPException(404, "Stash task not found")
    _save_stash(board_slug, tasks)
    return {"ok": True}
