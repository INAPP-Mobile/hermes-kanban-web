import os

from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse, HTMLResponse

from app.config import STATIC_DIR

router = APIRouter()

# Patterns that should NOT be cached (force fresh every time)
_NOCACHE_PATTERNS = (".html", ".js", ".css")


def _nocache_headers():
    return {
        "Cache-Control": "no-cache, no-store, must-revalidate",
        "Pragma": "no-cache",
        "Expires": "0",
    }


@router.get("/favicon.ico")
def favicon():
    # Serve favicon.png (FastAPI will infer JPEG-like PNG response)
    return FileResponse(os.path.join(STATIC_DIR, "favicon.png"), media_type="image/png")


@router.get("/assets/{file_path:path}")
def serve_static(file_path: str):
    full_path = os.path.join(STATIC_DIR, file_path)
    if os.path.isfile(full_path):
        _, ext = os.path.splitext(file_path)
        headers = _nocache_headers() if ext in _NOCACHE_PATTERNS else {}
        return FileResponse(full_path, headers=headers)
    raise HTTPException(404, f"{file_path} not found")


@router.get("/", response_class=HTMLResponse)
def index():
    return FileResponse(
        os.path.join(STATIC_DIR, "index.html"),
        headers=_nocache_headers(),
    )


@router.get("/board/{board_slug}", response_class=HTMLResponse)
def board_page(board_slug: str):
    return FileResponse(
        os.path.join(STATIC_DIR, "index.html"),
        headers=_nocache_headers(),
    )
