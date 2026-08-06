import json
import time
import uuid
import subprocess

from fastapi import APIRouter, HTTPException

from app.database import get_conn, row_to_dict
from app.models import TaskCreate, TaskUpdate, DependencyCreate, CommentCreate

router = APIRouter()


@router.get("/api/tasks/{board_slug}")
def get_tasks(board_slug: str):
    conn = get_conn(board_slug)
    rows = conn.execute(
        """SELECT t.*,
                  GROUP_CONCAT(DISTINCT tl.parent_id) as parents,
                  GROUP_CONCAT(DISTINCT tl2.child_id) as children
           FROM tasks t
           LEFT JOIN task_links tl ON t.id = tl.child_id
           LEFT JOIN task_links tl2 ON t.id = tl2.parent_id
           GROUP BY t.id
           ORDER BY
             CASE t.status
               WHEN 'in_progress' THEN 1
               WHEN 'ready' THEN 2
               WHEN 'blocked' THEN 3
               WHEN 'todo' THEN 4
               WHEN 'done' THEN 5
               ELSE 6
             END,
             t.priority DESC,
             t.created_at DESC"""
    ).fetchall()
    result = []
    for row in rows:
        d = dict(row)
        d["parents"] = d["parents"].split(",") if d["parents"] else []
        d["children"] = d["children"].split(",") if d["children"] else []
        result.append(d)
    conn.close()
    return result


@router.get("/api/tasks/{board_slug}/{task_id}")
def get_task(board_slug: str, task_id: str):
    conn = get_conn(board_slug)
    row = conn.execute("SELECT * FROM tasks WHERE id = ?", (task_id,)).fetchone()
    if not row:
        conn.close()
        raise HTTPException(404, "Task not found")
    d = row_to_dict(row)
    parents = conn.execute("SELECT parent_id FROM task_links WHERE child_id = ?", (task_id,)).fetchall()
    d["parents"] = [r["parent_id"] for r in parents]
    children = conn.execute("SELECT child_id FROM task_links WHERE parent_id = ?", (task_id,)).fetchall()
    d["children"] = [r["child_id"] for r in children]
    conn.close()
    return d


_VALID_STATUSES = {"todo", "ready", "in_progress", "blocked", "done"}

@router.post("/api/tasks/{board_slug}")
def create_task(board_slug: str, task: TaskCreate):
    """Create via Hermes CLI."""
    try:
        cmd = ["hermes", "kanban"]
        if board_slug:
            cmd.extend(["--board", board_slug])
        cmd.extend(["create", "--assignee", task.assignee or "worker"])
        if task.parent_ids:
            for pid in task.parent_ids:
                cmd.extend(["--parent", pid])
        if task.workspace_path:
            cmd.extend(["--workspace", "dir:" + task.workspace_path])
        if task.body:
            cmd.extend(["--body", task.body])
        cmd.append(task.title)
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=60)
        if result.returncode != 0:
            error_msg = (result.stderr or result.stdout).strip()
            raise HTTPException(500, f"hermes CLI error: {error_msg}")
        # Extract task ID from output like "Created t_xxx"
        output = result.stdout.strip()
        task_id = ""
        for word in output.split():
            if word.startswith("t_"):
                task_id = word
                break
        if not task_id:
            raise HTTPException(500, f"Could not parse task ID from: {output}")
    except FileNotFoundError:
        raise HTTPException(500, "hermes CLI not found")
    return {"id": task_id}


@router.patch("/api/tasks/{board_slug}/{task_id}")
def update_task(board_slug: str, task_id: str, update: TaskUpdate):
    """Update task status (status changes go through the Hermes CLI).

    Only 'status' is a supported mutation — the Hermes CLI has no command
    to edit a live task's title/body/priority/workspace/assignee, and this
    app must not write CLI-owned columns directly. Any other field is
    rejected by the TaskUpdate schema (extra="forbid"); users delete+
    recreate to change task content.
    """
    if update.status is None:
        return {"ok": True}
    return change_task_status(board_slug, task_id, {"status": update.status})


@router.delete("/api/tasks/{board_slug}/{task_id}")
def delete_task(board_slug: str, task_id: str):
    """Archive via Hermes CLI instead of raw DB delete."""
    try:
        cmd = ["hermes", "kanban"]
        if board_slug:
            cmd.extend(["--board", board_slug])
        cmd.extend(["archive", task_id])
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=60)
        if result.returncode != 0:
            error_msg = (result.stderr or result.stdout).strip()
            raise HTTPException(500, f"hermes CLI error: {error_msg}")
    except FileNotFoundError:
        raise HTTPException(500, "hermes CLI not found")
    return {"ok": True}


# --- Status via Hermes CLI ---

@router.post("/api/tasks/{board_slug}/{task_id}/status")
def change_task_status(board_slug: str, task_id: str, body: dict):
    """Change task status via Hermes CLI (forward transitions only)."""
    new_status = (body.get("status") or "").strip()
    if not new_status:
        raise HTTPException(400, "status is required")
    
    # Get current status
    conn = get_conn(board_slug)
    row = conn.execute("SELECT status FROM tasks WHERE id = ?", (task_id,)).fetchone()
    conn.close()
    if not row:
        raise HTTPException(404, "Task not found")
    current_status = row["status"]
    
    # Define valid forward transitions per Hermes CLI
    # promote: todo/blocked -> ready/running
    # block: any -> blocked
    # unblock: blocked/scheduled -> ready
    # complete: any -> done
    # schedule: any -> scheduled
    valid_transitions = {
        "todo": {"ready", "running", "blocked", "scheduled", "done"},
        "ready": {"running", "blocked", "scheduled", "done"},
        "running": {"blocked", "scheduled", "done"},
        "blocked": {"ready", "running", "blocked", "scheduled", "done"},  # unblock/promote/block/complete/schedule
        "done": set(),  # No forward transitions from done
        "scheduled": {"ready", "running", "blocked", "done"},
    }
    
    if new_status not in valid_transitions.get(current_status, set()):
        raise HTTPException(400, f"Cannot transition from '{current_status}' to '{new_status}'. Hermes only supports forward transitions.")
    
    cli_cmd_map = {
        "ready": "promote",
        "running": "promote",
        "blocked": "block",
        "done": "complete",
        "scheduled": "schedule",
    }
    cli_cmd = cli_cmd_map.get(new_status, new_status)
    try:
        cmd = ["hermes", "kanban"]
        if board_slug:
            cmd.extend(["--board", board_slug])
        cmd.extend([cli_cmd, task_id])
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=60)
        if result.returncode != 0:
            error_msg = (result.stderr or result.stdout).strip()
            raise HTTPException(500, f"hermes CLI error: {error_msg}")
    except FileNotFoundError:
        raise HTTPException(500, "hermes CLI not found")
    return {"ok": True}


# --- Dependencies ---

@router.post("/api/tasks/{board_slug}/{task_id}/dependencies")
def add_dependency(board_slug: str, task_id: str, dep: DependencyCreate):
    conn = get_conn(board_slug)
    conn.execute(
        "INSERT OR IGNORE INTO task_links (parent_id, child_id) VALUES (?, ?)",
        (dep.parent_id, dep.child_id),
    )
    conn.commit()
    conn.close()
    return {"ok": True}


@router.delete("/api/tasks/{board_slug}/{task_id}/dependencies")
def remove_dependency(board_slug: str, task_id: str, dep: DependencyCreate):
    conn = get_conn(board_slug)
    conn.execute(
        "DELETE FROM task_links WHERE parent_id = ? AND child_id = ?",
        (dep.parent_id, dep.child_id),
    )
    conn.commit()
    conn.close()
    return {"ok": True}


# --- Comments ---

@router.get("/api/tasks/{board_slug}/{task_id}/comments")
def get_comments(board_slug: str, task_id: str):
    conn = get_conn(board_slug)
    rows = conn.execute(
        "SELECT * FROM task_comments WHERE task_id = ? ORDER BY created_at DESC", (task_id,)
    ).fetchall()
    conn.close()
    return [row_to_dict(r) for r in rows]


@router.post("/api/tasks/{board_slug}/{task_id}/comments")
def add_comment(board_slug: str, task_id: str, comment: CommentCreate):
    """Add comment via Hermes CLI."""
    try:
        cmd = ["hermes", "kanban"]
        if board_slug:
            cmd.extend(["--board", board_slug])
        cmd.extend(["comment", task_id, comment.body])
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=60)
        if result.returncode != 0:
            error_msg = (result.stderr or result.stdout).strip()
            raise HTTPException(500, f"hermes CLI error: {error_msg}")
    except FileNotFoundError:
        raise HTTPException(500, "hermes CLI not found")
    return {"ok": True}


# --- Events ---

@router.get("/api/tasks/{board_slug}/{task_id}/events")
def get_events(board_slug: str, task_id: str):
    conn = get_conn(board_slug)
    rows = conn.execute(
        "SELECT * FROM task_events WHERE task_id = ? ORDER BY created_at DESC LIMIT 50",
        (task_id,),
    ).fetchall()
    conn.close()
    return [row_to_dict(r) for r in rows]


# --- Runs ---

@router.get("/api/tasks/{board_slug}/{task_id}/runs")
def get_runs(board_slug: str, task_id: str):
    conn = get_conn(board_slug)
    rows = conn.execute(
        "SELECT * FROM task_runs WHERE task_id = ? ORDER BY started_at DESC",
        (task_id,),
    ).fetchall()
    conn.close()
    return [row_to_dict(r) for r in rows]


# --- Stats ---

@router.get("/api/stats/{board_slug}")
def get_stats(board_slug: str):
    conn = get_conn(board_slug)
    rows = conn.execute("SELECT status, COUNT(*) as cnt FROM tasks GROUP BY status").fetchall()
    stats = {}
    for r in rows:
        stats[r["status"]] = r["cnt"]
    stats["total"] = sum(stats.values())
    conn.close()
    return stats


# --- Worker Log ---

@router.get("/api/tasks/{board_slug}/{task_id}/log")
def get_worker_log(board_slug: str, task_id: str, tail: int = 0):
    """Return the worker's subprocess stdout log for a task."""
    from app.config import BOARDS_DIR
    import os

    log_dir = os.path.join(BOARDS_DIR, board_slug, "logs")
    log_path = os.path.join(log_dir, f"{task_id}.log")
    if not os.path.isfile(log_path):
        return {"content": "", "size": 0}
    try:
        size = os.path.getsize(log_path)
        if tail > 0 and size > tail:
            with open(log_path, "rb") as f:
                f.seek(size - tail)
                content = f.read().decode("utf-8", errors="replace")
        else:
            with open(log_path, "rb") as f:
                content = f.read().decode("utf-8", errors="replace")
        return {"content": content, "size": size, "path": log_path}
    except Exception as e:
        return {"content": f"Error reading log: {e}", "size": 0}
