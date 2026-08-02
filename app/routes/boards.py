import os
import sqlite3
import subprocess

from fastapi import APIRouter, HTTPException

from app.config import BOARDS_DIR, HERMES_CONFIG_PATH
from app.database import get_conn, row_to_dict
from app.models import BoardCreate

import yaml

router = APIRouter()


@router.get("/api/boards")
def list_boards():
    boards = []
    if os.path.isdir(BOARDS_DIR):
        for name in sorted(os.listdir(BOARDS_DIR)):
            db_path = os.path.join(BOARDS_DIR, name, "kanban.db")
            if os.path.isfile(db_path):
                boards.append({"slug": name, "path": db_path})
    return boards


@router.post("/api/boards")
def create_board(body: BoardCreate):
    slug = body.slug.strip()
    if not slug or not slug.replace("-", "").replace("_", "").isalnum():
        raise HTTPException(400, "Invalid board slug (only alphanumeric, hyphens, underscores)")
    board_dir = os.path.join(BOARDS_DIR, slug)
    db_path = os.path.join(board_dir, "kanban.db")
    if os.path.exists(db_path):
        raise HTTPException(409, f"Board already exists: {slug}")
    os.makedirs(board_dir, exist_ok=True)
    os.makedirs(os.path.join(board_dir, "workspaces"), exist_ok=True)
    os.makedirs(os.path.join(board_dir, "logs"), exist_ok=True)
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute(
        """CREATE TABLE IF NOT EXISTS tasks (
            id TEXT PRIMARY KEY,
            title TEXT,
            body TEXT,
            assignee TEXT DEFAULT 'worker',
            status TEXT DEFAULT 'todo',
            priority INTEGER DEFAULT 0,
            created_by TEXT,
            created_at INTEGER,
            started_at INTEGER,
            completed_at INTEGER,
            workspace_kind TEXT DEFAULT 'scratch',
            workspace_path TEXT,
            branch_name TEXT,
            claim_lock TEXT,
            claim_expires INTEGER,
            tenant TEXT,
            result TEXT,
            idempotency_key TEXT,
            consecutive_failures INTEGER DEFAULT 0,
            worker_pid INTEGER,
            last_failure_error TEXT,
            max_runtime_seconds INTEGER,
            last_heartbeat_at INTEGER,
            current_run_id TEXT,
            workflow_template_id TEXT,
            current_step_key TEXT,
            skills TEXT,
            model_override TEXT,
            max_retries INTEGER,
            goal_mode INTEGER DEFAULT 0,
            goal_max_turns INTEGER,
            session_id TEXT,
            workflow TEXT,
            completion_note TEXT,
            project_id TEXT
        )"""
    )
    conn.execute(
        """CREATE TABLE IF NOT EXISTS task_links (
            parent_id TEXT,
            child_id TEXT,
            PRIMARY KEY (parent_id, child_id)
        )"""
    )
    conn.execute(
        """CREATE TABLE IF NOT EXISTS task_comments (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            task_id TEXT,
            author TEXT,
            body TEXT,
            created_at INTEGER
        )"""
    )
    conn.execute(
        """CREATE TABLE IF NOT EXISTS task_events (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            task_id TEXT,
            run_id TEXT,
            kind TEXT,
            payload TEXT,
            created_at INTEGER
        )"""
    )
    conn.execute(
        """CREATE TABLE IF NOT EXISTS task_runs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            task_id TEXT,
            status TEXT,
            outcome TEXT,
            started_at INTEGER,
            ended_at INTEGER,
            error TEXT,
            worker_pid INTEGER
        )"""
    )
    conn.execute(
        """CREATE TABLE IF NOT EXISTS board_meta (
            key TEXT PRIMARY KEY,
            value TEXT
        )"""
    )
    if body.default_workdir:
        conn.execute(
            "INSERT OR REPLACE INTO board_meta (key, value) VALUES (?, ?)",
            ("default_workdir", body.default_workdir),
        )
    conn.commit()
    conn.close()

    # Ensure auto_decompose column exists
    try:
        conn2 = sqlite3.connect(db_path)
        conn2.execute("PRAGMA journal_mode=WAL")
        cols = [r[1] for r in conn2.execute("PRAGMA table_info(tasks)").fetchall()]
        if "auto_decompose" not in cols:
            conn2.execute("ALTER TABLE tasks ADD COLUMN auto_decompose INTEGER DEFAULT 1")
            conn2.commit()
        conn2.close()
    except Exception:
        pass

    return {"ok": True, "slug": slug}


@router.put("/api/boards/{board_slug}")
def update_board(board_slug: str, body: BoardCreate):
    """Update a board's settings (rename slug, workdir, auto_decompose)."""
    old_slug = board_slug
    board_dir = os.path.join(BOARDS_DIR, old_slug)
    db_path = os.path.join(board_dir, "kanban.db")
    if not os.path.exists(db_path):
        raise HTTPException(404, f"Board not found: {old_slug}")

    new_slug = body.slug.strip().lower().replace("/", "").replace(" ", "")
    if not new_slug or not new_slug.replace("-", "").replace("_", "").isalnum():
        raise HTTPException(400, "Invalid board slug")

    # Rename board directory if slug changed
    if new_slug != old_slug:
        new_path = os.path.join(BOARDS_DIR, new_slug)
        if os.path.exists(new_path):
            raise HTTPException(409, f"Board already exists: {new_slug}")
        os.rename(board_dir, new_path)

    # Update default_workdir in DB
    new_db_path = os.path.join(BOARDS_DIR, new_slug, "kanban.db")
    conn = sqlite3.connect(new_db_path)
    conn.row_factory = sqlite3.Row
    if body.default_workdir:
        conn.execute(
            "INSERT OR REPLACE INTO board_meta (key, value) VALUES (?, ?)",
            ("default_workdir", body.default_workdir),
        )
    else:
        conn.execute("DELETE FROM board_meta WHERE key='default_workdir'")
    conn.commit()
    conn.close()

    # Update auto_decompose via CLI
    try:
        result = subprocess.run(
            ["hermes", "config", "set", "kanban.auto_decompose", "true" if body.auto_decompose else "false"],
            capture_output=True, text=True, timeout=15,
        )
        if result.returncode != 0:
            raise HTTPException(500, result.stderr or result.stdout)
    except FileNotFoundError:
        raise HTTPException(500, "hermes CLI not found")

    return {"ok": True, "slug": new_slug}


@router.delete("/api/boards/{board_slug}")
def delete_board(board_slug: str):
    import shutil

    board_dir = os.path.join(BOARDS_DIR, board_slug)
    db_path = os.path.join(board_dir, "kanban.db")
    if not os.path.exists(db_path):
        raise HTTPException(404, f"Board not found: {board_slug}")
    try:
        for suffix in ["-wal", "-shm"]:
            wal = db_path + suffix
            if os.path.exists(wal):
                os.remove(wal)
        os.remove(db_path)
        shutil.rmtree(board_dir, ignore_errors=True)
    except Exception as e:
        raise HTTPException(500, f"Failed to delete board: {e}")
    return {"ok": True}


@router.get("/api/boards/{board_slug}/meta")
def get_board_meta(board_slug: str):
    conn = get_conn(board_slug)
    try:
        row = conn.execute("SELECT value FROM board_meta WHERE key='default_workdir'").fetchone()
        default_workdir = row["value"] if row else None
    except Exception:
        default_workdir = None
    conn.close()
    return {"default_workdir": default_workdir}


@router.post("/boards/{board_slug}/set-auto-decompose")
def set_auto_decompose(board_slug: str, body: dict):
    """Enable auto-decompose in Hermes config via CLI."""
    enabled = body.get("enabled", True)
    try:
        result = subprocess.run(
            ["hermes", "config", "set", "kanban.auto_decompose", "true" if enabled else "false"],
            capture_output=True,
            text=True,
            timeout=15,
        )
        if result.returncode != 0:
            raise HTTPException(500, result.stderr or result.stdout)
    except FileNotFoundError:
        raise HTTPException(500, "hermes CLI not found")
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
    try:
        result = subprocess.run(
            ["hermes", "config", "set", "kanban.orchestrator_profile", new_profile],
            capture_output=True,
            text=True,
            timeout=15,
        )
        if result.returncode != 0:
            raise HTTPException(500, result.stderr or result.stdout)
    except FileNotFoundError:
        raise HTTPException(500, "hermes CLI not found")
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
        else:
            d["pid_alive"] = None
        result.append(d)
    conn.close()
    return result
