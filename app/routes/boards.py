import json
import os
import subprocess

from fastapi import APIRouter, HTTPException

from app.config import BOARDS_DIR, HERMES_CONFIG_PATH
from app.database import get_conn, get_all_board_names
from app.models import BoardCreate

import yaml

router = APIRouter()


def _run_cli(cmd: list[str], timeout: int = 60) -> str:
    """Run a hermes CLI subcommand, raising HTTPException on failure."""
    try:
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout)
    except FileNotFoundError:
        raise HTTPException(500, "hermes CLI not found")
    if result.returncode != 0:
        raise HTTPException(500, (result.stderr or result.stdout).strip())
    return result.stdout


@router.get("/api/boards")
def list_boards():
    return [{"slug": name, "path": os.path.join(BOARDS_DIR, name, "kanban.db")}
            for name in get_all_board_names()]


@router.post("/api/boards")
def create_board(body: BoardCreate):
    """Create a board via the Hermes CLI (CLI owns the schema)."""
    slug = body.slug.strip()
    if not slug or not slug.replace("-", "").replace("_", "").isalnum():
        raise HTTPException(400, "Invalid board slug (only alphanumeric, hyphens, underscores)")
    board_dir = os.path.join(BOARDS_DIR, slug)
    db_path = os.path.join(board_dir, "kanban.db")
    if os.path.exists(db_path):
        raise HTTPException(409, f"Board already exists: {slug}")

    # CLI owns the DB schema — create the board through it so the daemon /
    # gateway can claim and run tasks on the resulting kanban.db.
    _run_cli(["hermes", "kanban", "boards", "create", slug])

    if body.default_workdir:
        _run_cli(["hermes", "kanban", "boards", "set-default-workdir", slug, body.default_workdir])
    # auto_decompose is a global config toggle, persisted via CLI config.
    if body.auto_decompose:
        _run_cli(["hermes", "config", "set", "kanban.auto_decompose", "true"])

    return {"ok": True, "slug": slug}


@router.put("/api/boards/{board_slug}")
def update_board(board_slug: str, body: BoardCreate):
    """Update a board's settings (default_workdir, auto_decompose).

    Slug rename is intentionally no longer supported: the canonical board
    identity lives in the CLI's kanban database once created, so renaming the
    directory would orphan it. Recreate the board instead.
    """
    board_dir = os.path.join(BOARDS_DIR, board_slug)
    db_path = os.path.join(board_dir, "kanban.db")
    if not os.path.exists(db_path):
        raise HTTPException(404, f"Board not found: {board_slug}")

    # default_workdir is stored by the CLI in the board's board.json.
    if body.default_workdir is not None:
        _run_cli(["hermes", "kanban", "boards", "set-default-workdir", board_slug, body.default_workdir])
    else:
        _run_cli(["hermes", "kanban", "boards", "set-default-workdir", board_slug])

    # auto_decompose is a global config setting.
    _run_cli(["hermes", "config", "set", "kanban.auto_decompose", "true" if body.auto_decompose else "false"])

    return {"ok": True, "slug": board_slug}


@router.delete("/api/boards/{board_slug}")
def delete_board(board_slug: str):
    """Delete a board via the Hermes CLI (archives then hard-deletes)."""
    board_dir = os.path.join(BOARDS_DIR, board_slug)
    db_path = os.path.join(board_dir, "kanban.db")
    if not os.path.exists(db_path):
        raise HTTPException(404, f"Board not found: {board_slug}")
    _run_cli(["hermes", "kanban", "boards", "rm", "--delete", board_slug])
    return {"ok": True}


@router.get("/api/boards/{board_slug}/meta")
def get_board_meta(board_slug: str):
    """Read default_workdir from the CLI-owned board.json (not the DB)."""
    board_json = os.path.join(BOARDS_DIR, board_slug, "board.json")
    default_workdir = None
    if os.path.isfile(board_json):
        try:
            with open(board_json, "r") as f:
                meta = json.load(f)
                default_workdir = meta.get("default_workdir")
        except Exception:
            default_workdir = None
    return {"default_workdir": default_workdir}


@router.post("/boards/{board_slug}/set-auto-decompose")
def set_auto_decompose(board_slug: str, body: dict):
    """Enable auto-decompose in Hermes config via CLI."""
    enabled = body.get("enabled", True)
    _run_cli(["hermes", "config", "set", "kanban.auto_decompose", "true" if enabled else "false"])
    return {"ok": True}


@router.get("/api/boards/{board_slug}/orchestrator-profile")
def get_orchestrator_profile(board_slug: str):
    orchestrator_profile = "worker3"
    if os.path.exists(HERMES_CONFIG_PATH):
        with open(HERMES_CONFIG_PATH, "r") as f:
            config = yaml.safe_load(f)
            orchestrator_profile = config.get("kanban", {}).get("orchestrator_profile", "worker3")
    conn = get_conn(board_slug)
    row = conn.execute(
        "SELECT COUNT(*) as cnt FROM tasks WHERE assignee = ?",
        (orchestrator_profile,),
    ).fetchone()
    task_count = row["cnt"] if row else 0
    conn.close()
    return {"profile": orchestrator_profile, "task_count": task_count}


@router.put("/api/boards/{board_slug}/orchestrator-profile")
def set_orchestrator_profile(board_slug: str, body: dict):
    """Update orchestrator_profile via hermes CLI."""
    new_profile = (body.get("profile") or "").strip()
    if not new_profile:
        raise HTTPException(400, "profile is required")
    _run_cli(["hermes", "config", "set", "kanban.orchestrator_profile", new_profile], timeout=15)
    return {"ok": True}


@router.get("/api/boards/{board_slug}/active-workers")
def get_active_workers(board_slug: str):
    conn = get_conn(board_slug)
    runs = conn.execute("SELECT * FROM task_runs WHERE status = 'running'").fetchall()
    result = []
    for r in runs:
        d = dict(r)
        pid = d.get("worker_pid")
        if pid:
            try:
                subprocess.run(["kill", "-0", str(pid)], capture_output=True, check=True)
                d["pid_alive"] = True
            except Exception:
                d["pid_alive"] = False
        result.append(d)
    conn.close()
    return result