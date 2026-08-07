"""Tests for the optional bearer-token authentication module."""

import pytest
from fastapi import HTTPException

from app.security import _check_api_token


def test_no_token_configured_allows_all(monkeypatch):
    """When HERMES_KANBAN_API_TOKEN is unset, auth is a no-op (open access)."""
    monkeypatch.delenv("HERMES_KANBAN_API_TOKEN", raising=False)
    # Should not raise
    _check_api_token(None, None)
    _check_api_token("Bearer anything", None)


def test_missing_token_401(monkeypatch):
    monkeypatch.setenv("HERMES_KANBAN_API_TOKEN", "secret123")
    with pytest.raises(HTTPException) as exc:
        _check_api_token(None, None)
    assert exc.value.status_code == 401


def test_invalid_scheme_401(monkeypatch):
    monkeypatch.setenv("HERMES_KANBAN_API_TOKEN", "secret123")
    with pytest.raises(HTTPException) as exc:
        _check_api_token("Basic abcdef", None)
    assert exc.value.status_code == 401


def test_wrong_token_401(monkeypatch):
    monkeypatch.setenv("HERMES_KANBAN_API_TOKEN", "secret123")
    with pytest.raises(HTTPException) as exc:
        _check_api_token("Bearer wrong", None)
    assert exc.value.status_code == 401


def test_correct_header_token_passes(monkeypatch):
    monkeypatch.setenv("HERMES_KANBAN_API_TOKEN", "secret123")
    # Should not raise
    _check_api_token("Bearer secret123", None)


def test_correct_query_token_passes(monkeypatch):
    """SSE EventSource cannot set headers; token must also work as ?token=."""
    monkeypatch.setenv("HERMES_KANBAN_API_TOKEN", "secret123")
    # Should not raise
    _check_api_token(None, "secret123")


def test_header_wins_over_query(monkeypatch):
    monkeypatch.setenv("HERMES_KANBAN_API_TOKEN", "secret123")
    with pytest.raises(HTTPException) as exc:
        _check_api_token("Bearer wrong", "secret123")
    assert exc.value.status_code == 401