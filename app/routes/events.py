import asyncio
import json
import os
import sqlite3

from fastapi import APIRouter
from fastapi.responses import StreamingResponse

from app.config import BOARDS_DIR

router = APIRouter()


@router.get("/api/events/stream")
async def stream_events():
    """Server-Sent Events stream of task events (reads from local DB)."""
    async def event_generator():
        last_ids = {}

        # Initialize last_ids with current max per board
        try:
            if os.path.isdir(BOARDS_DIR):
                for name in sorted(os.listdir(BOARDS_DIR)):
                    db_path = os.path.join(BOARDS_DIR, name, "kanban.db")
                    if not os.path.isfile(db_path):
                        continue
                    try:
                        c = sqlite3.connect(db_path)
                        c.execute("PRAGMA journal_mode=WAL")
                        row = c.execute("SELECT MAX(id) as mx FROM task_events").fetchone()
                        if row and row["mx"]:
                            last_ids[name] = row["mx"]
                        c.close()
                    except Exception:
                        pass
        except Exception:
            pass

        while True:
            try:
                if os.path.isdir(BOARDS_DIR):
                    for name in sorted(os.listdir(BOARDS_DIR)):
                        db_path = os.path.join(BOARDS_DIR, name, "kanban.db")
                        if not os.path.isfile(db_path):
                            continue
                        board_last_id = last_ids.get(name, 0)
                        try:
                            conn = sqlite3.connect(db_path)
                            conn.row_factory = sqlite3.Row
                            conn.execute("PRAGMA journal_mode=WAL")
                            rows = conn.execute(
                                f"SELECT * FROM task_events WHERE id > {board_last_id} ORDER BY id"
                            ).fetchall()
                            for r in rows:
                                rid = r["id"]
                                last_ids[name] = rid
                                data = json.dumps({
                                    "id": rid,
                                    "task_id": r["task_id"],
                                    "board": name,
                                    "kind": r["kind"],
                                    "payload": r["payload"],
                                    "created_at": r["created_at"],
                                })
                                yield f"id: {rid}\nevent: task_event\ndata: {data}\n\n"
                            conn.close()
                        except Exception:
                            pass
            except Exception:
                pass
            await asyncio.sleep(1)

    return StreamingResponse(event_generator(), media_type="text/event-stream")
