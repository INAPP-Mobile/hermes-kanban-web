import os
import sqlite3

from fastapi import HTTPException

from app.config import BOARDS_DIR


def get_db_path(board_slug: str | None = None) -> str | None:
    if board_slug:
        return os.path.join(BOARDS_DIR, board_slug, "kanban.db")
    return None


def get_conn(board_slug: str | None = None) -> sqlite3.Connection:
    db_path = get_db_path(board_slug)
    if not db_path or not os.path.exists(db_path):
        raise HTTPException(404, f"Board not found: {board_slug}")
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")
    _run_migrations(conn)
    return conn


def _run_migrations(conn: sqlite3.Connection) -> None:
    """Idempotent schema migrations for existing databases."""
    # Migration: add board_meta table if missing
    if not conn.execute(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='board_meta'"
    ).fetchone():
        conn.execute(
            """CREATE TABLE board_meta (
                key TEXT PRIMARY KEY,
                value TEXT
            )"""
        )
        conn.commit()
    # Migration: add auto_decompose column if missing
    cols = [r[1] for r in conn.execute("PRAGMA table_info(tasks)").fetchall()]
    if "auto_decompose" not in cols:
        conn.execute("ALTER TABLE tasks ADD COLUMN auto_decompose INTEGER DEFAULT 1")
        conn.commit()


def row_to_dict(row: sqlite3.Row | None) -> dict | None:
    if row is None:
        return None
    return dict(row)


def get_all_board_names() -> list[str]:
    """Return sorted board slugs that have a kanban.db."""
    if not os.path.isdir(BOARDS_DIR):
        return []
    return sorted(
        name
        for name in os.listdir(BOARDS_DIR)
        if os.path.isfile(os.path.join(BOARDS_DIR, name, "kanban.db"))
    )
