#!/usr/bin/env python3
"""
Hermes Kanban Web Manager - FastAPI backend with drag-and-drop frontend
"""

import os

from fastapi import FastAPI

from app.routes import boards, tasks, profiles, events, theme, stash, static

app = FastAPI(title="Hermes Kanban Manager")

app.include_router(boards.router)
app.include_router(tasks.router)
app.include_router(profiles.router)
app.include_router(events.router)
app.include_router(theme.router)
app.include_router(stash.router)
app.include_router(static.router)

if __name__ == "__main__":
    import uvicorn

    port = int(os.environ.get("PORT", 8502))
    uvicorn.run(app, host="0.0.0.0", port=port)
