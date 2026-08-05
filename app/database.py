import os
import sqlite3

from fastapi import HTTPException

from app.config import BOARDS_DIR


def get_db_path(board_slug: str | None = None) -> str | None:
    if board_slug:
        return os.path.join(BOARDS_DIR, board_slug, "kanban.db")
    return None


def get_conn(board_slug: str | None = None) -> sqlite3.Connection:
    """Open a read/write connection to a board's kanban.db.

    The board schema is owned exclusively by the Hermes CLI (created via
    `hermes kanban boards create`). This app never CREATE/ALTERs the schema —
    it only reads task/event/comment/run rows that the CLI's canonical schema
    already defines. No app-side migrations exist here (removed): adding or
    renaming a column in the CLI would otherwise silently drift the board DB
    away from what the daemon/gateway expects (e.g. `task_runs.summary`).
    """
    db_path = get_db_path(board_slug)
    if not db_path or not os.path.exists(db_path):
        raise HTTPException(404, f"Board not found: {board_slug}")
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")
    return conn


def row_to_dict(row: sqlite3.Row | None) -> dict | None:
    if row is not None:
        return dict(row)
    return None


def get_all_board_names() -> list[str]:
    """Return sorted board slugs that have a kanban.db."""
    if not os.path.isdir(BOARDS_DIR):
        return []
    return sorted(
        n
        for n in os.listdir(BOARDS_DIR)
        if n != "_archived" and os.path.isfile(os.path.join(BOARDS_DIR, n, "kanban.db"))
    )