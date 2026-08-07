"""Simple opt-in bearer-token authentication for the Kanban API.

When the environment variable HERMES_KANBAN_API_TOKEN is set, every protected
route requires an `Authorization: Bearer <token>` header matching that value.
When it is NOT set (the default), authentication is disabled and all requests
are allowed — preserving backward compatibility for existing deployments.
"""

import os

from fastapi import Header, HTTPException, status

_TOKEN_VAR = "HERMES_KANBAN_API_TOKEN"


def _check_api_token(authorization: str | None = None) -> None:
    """FastAPI dependency. Raises 401 when a token is configured but missing/wrong."""
    expected = os.environ.get(_TOKEN_VAR)
    # Auth disabled by default — no token configured means open access.
    if not expected:
        return

    if not authorization:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing Authorization header",
            headers={"WWW-Authenticate": "Bearer"},
        )

    scheme, _, token = authorization.partition(" ")
    if scheme.lower() != "bearer" or token != expected:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or missing token",
            headers={"WWW-Authenticate": "Bearer"},
        )


def require_api_token():
    from fastapi import Depends
    return Depends(_check_api_token)