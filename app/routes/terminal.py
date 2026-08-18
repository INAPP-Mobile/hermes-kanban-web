"""Terminal credential endpoint.

Lets the frontend auto-fill the ttyd web-terminal Basic auth (so the ttyd
login prompt never appears) when the user already has board access.

Security model (intentionally permissive, matching "board access == terminal
access"): the endpoint reuses the SAME gate as the rest of the board API
(`app.security._check_api_token`). So
  - HERMES_KANBAN_API_TOKEN unset (board open)  -> endpoint is open
  - HERMES_KANBAN_API_TOKEN set (board locked)  -> only a valid bearer token
      (i.e. an unlocked board user) can read the credential.

The credential mirrors start-ttyd.sh: /etc/nginx/.ttyd-credential if present,
else ADMIN_USERNAME / ADMIN_PASSWORD from the environment.

Returned as a JSON object (username + password) rather than as an
Authorization header, so the client can build its own Basic auth URL without a
header round-trip, and so the value is inspectable / reusable.
"""

import os

from fastapi import APIRouter, Depends, HTTPException, status

from app.security import _check_api_token

router = APIRouter(
    prefix="/api",
    tags=["terminal"],
    dependencies=[Depends(_check_api_token)],
)

_CRED_FILE = "/etc/nginx/.ttyd-credential"


def _resolve_credential():
    """Mirror start-ttyd.sh's credential resolution.

    Returns (username, password) or (None, None) when nothing is configured.
    """
    user = pw = ""
    try:
        if os.path.isfile(_CRED_FILE) and os.access(_CRED_FILE, os.R_OK):
            with open(_CRED_FILE) as f:
                cred = f.read().strip()
            if ":" in cred:
                user, _, pw = cred.partition(":")
    except Exception:
        user = pw = ""
    if not (user and pw):
        user = os.environ.get("ADMIN_USERNAME", "")
        pw = os.environ.get("ADMIN_PASSWORD", "")
    if user and pw:
        return user, pw
    return None, None


@router.get("/terminal-credential")
def terminal_credential():
    """Return the ttyd web-terminal username + password.

    Gated by the board API token (same as every other protected route) so the
    credential is only handed out to an unlocked board user (or to anyone when
    the board is intentionally open).
    """
    user, pw = _resolve_credential()
    if not user or not pw:
        raise HTTPException(
            status.HTTP_503_SERVICE_UNAVAILABLE,
            "terminal credential not configured in this container",
        )
    return {"username": user, "password": pw}
