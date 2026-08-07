"""Simple opt-in bearer-token authentication for the Kanban API.

When the environment variable HERMES_KANBAN_API_TOKEN is set, every protected
route requires a token. The token may be supplied either as an
`Authorization: Bearer <token>` header or as a `?token=<token>` query
parameter (needed by EventSource, which cannot set headers).

When the env var is NOT set (the default), authentication is disabled and all
requests are allowed — preserving backward compatibility for existing
deployments.
"""

import os

from fastapi import Header, HTTPException, Query, status

_TOKEN_VAR = "HERMES_KANBAN_API_TOKEN"


def _check_api_token(
    authorization: str | None = Header(default=None),
    token: str | None = Query(default=None),
) -> None:
    """FastAPI dependency. Raises 401 when a token is configured but missing/wrong."""
    expected = os.environ.get(_TOKEN_VAR)
    # Auth disabled by default — no token configured means open access.
    if not expected:
        return

    # Accept token via Authorization header OR ?token= query param (SSE).
    supplied = None
    if authorization:
        scheme, _, tok = authorization.partition(" ")
        if scheme.lower() == "bearer":
            supplied = tok
    if supplied is None:
        supplied = token

    if supplied != expected:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or missing token",
            headers={"WWW-Authenticate": "Bearer"},
        )