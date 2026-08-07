"""Tests for the optional bearer-token authentication module."""

import os

import pytest
from fastapi import HTTPException

from app.security import _check_api_token


def test_no_token_configured_allows_all(monkeypatch):
    """When HERMES_KANBAN_API_TOKEN is unset, auth is a no-op (open access)."""
    monkeypatch.delenv("HERMES_KANBAN_API_TOKEN", raising=False)
    # Should not raise
    _check_api_token(None)
    _check_api_token("Bearer anything")


def test_missing_header_401(monkeypatch):
    monkeypatch.setenv("HERMES_KANBAN_API_TOKEN", "secret123")
    with pytest.raises(HTTPException) as exc:
        _check_api_token(None)
    assert exc.value.status_code == 401


def test_invalid_scheme_401(monkeypatch):
    monkeypatch.setenv("HERMES_KANBAN_API_TOKEN", "secret123")
    with pytest.raises(HTTPException) as exc:
        _check_api_token("Basic abcdef")
    assert exc.value.status_code == 401


def test_wrong_token_401(monkeypatch):
    monkeypatch.setenv("HERMES_KANBAN_API_TOKEN", "secret123")
    with pytest.raises(HTTPException) as exc:
        _check_api_token("Bearer wrong")
    assert exc.value.status_code == 401


def test_correct_token_passes(monkeypatch):
    monkeypatch.setenv("HERMES_KANBAN_API_TOKEN", "secret123")
    # Should not raise
    _check_api_token("Bearer secret123")