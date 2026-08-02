# Hermes Kanban Web

A web-based Kanban board for managing Hermes agent tasks. Features drag-and-drop task management, live event streaming via Server-Sent Events (SSE), dark/light mode, stash/restore, multi-board support, and a profile manager — all backed by a shared persistent volume with the Hermes agent.

## Overview

Hermes Kanban Web is a FastAPI + vanilla JS single-page application that provides a browser-based UI for managing Hermes agent tasks. It serves as a frontend for the Hermes agent ecosystem: boards are stored as SQLite databases, task creation/status changes/comments/archive operations shell out to the `hermes` CLI, and real-time updates are delivered via SSE.

The app runs **inside the `nousresearch/hermes-agent` Docker image**, so the `hermes` CLI is available on PATH and all persistent state (boards, profiles, config) lives under `HERMES_HOME` (`/opt/data`) on a Railway volume shared with the Hermes agent runtime.

## Features

- **Multi-board support** — each board is a SQLite database under `HERMES_HOME/kanban/boards/`
- **Drag-and-drop task management** — move tasks between Todo, Ready, In Progress, Blocked, and Done columns
- **Live event streaming** — SSE endpoint (`GET /api/events/stream`) polls board DBs every second and broadcasts task events to the frontend
- **Dark / light theme** — persisted to browser localStorage
- **Task stashing** — save task cards locally (disconnected from any board)
- **Profile management** — list, create, rename, and delete Hermes profiles; set model/describe per profile
- **Dependency tracking** — parent/child task links with clickable navigation
- **Active worker monitoring** — real-time PID liveness checks on running task workers
- **Hermes CLI integration** — all task lifecycle operations (create, promote, block, complete, schedule, archive, comment) delegate to the `hermes` CLI

## Deploy

### Deploy to Railway

[![Deploy to Railway](https://railway.app/button.svg)](https://railway.com/deploy/-aYE-b)

Click the button above to deploy this template to Railway. The template creates a single service from the `nousresearch/hermes-kanban-web` Docker image with a persistent volume mounted at `/opt/data` for all board and profile data.

### Self-hosting (Docker)

```bash
docker run -d \
  --name hermes-kanban-web \
  -p 8502:8502 \
  -e PORT=8502 \
  -e HERMES_HOME=/opt/data \
  -v hermes-data:/opt/data \
  ghcr.io/inapp-mobile/hermes-kanban-web:latest
```

### Local Development

```bash
# Clone the repo
git clone https://github.com/INAPP-Mobile/hermes-kanban-web.git
cd hermes-kanban-web

# Install dependencies (requires Python 3.11+)
pip install fastapi uvicorn pydantic httpx pyyaml

# The app shells out to `hermes` CLI — ensure it's on PATH
# or set HERMES_HOME to an existing ~/.hermes or /opt/data directory

# Run locally
./start.sh
```

The app runs on http://localhost:8502.

## Configuration

### Environment Variables

| Variable | Default | Description |
|---|---|---|
| `PORT` | `8502` | HTTP port the app binds to (Railway injects this automatically) |
| `HERMES_HOME` | `/opt/data` | Root directory for all Hermes persistent state (boards, profiles, config.yaml) |
| `HOME` | `$HERMES_HOME` | Set to match HERMES_HOME so `~` resolves to the volume |

### Persistent Volume

The app stores all state under `HERMES_HOME/kanban/`:

```
HERMES_HOME/
├── config.yaml          # Hermes configuration (kanban settings, profiles)
├── profiles/            # Hermes agent profiles (one dir per profile)
│   ├── worker1/config.yaml
│   └── worker2/profile.yaml
├── kanban/
│   ├── boards/          # Per-board SQLite databases
│   │   └── <slug>/kanban.db
│   ├── stash/           # Local task stash (disconnected from boards)
│   └── theme.json       # Dark/light theme preference
```

In Railway, the volume is mounted at `/opt/data` (the default `HERMES_HOME` in the base image). The `start.sh` wrapper ensures `kanban/boards/`, `kanban/stash/` subdirectories exist and seeds a minimal `config.yaml` if none is present.

## LLM Setup

On a fresh deploy, no LLM provider is configured. When you open the app, a **setup wizard** modal appears automatically. Choose a provider, enter your base URL, model name, and API key (if applicable), then click **Save & Reload**. The wizard writes provider env vars to `/opt/data/.env` and sets the model in `config.yaml` via `hermes config set model`.

After setup, the modal will not reappear on subsequent visits. If you need to change your LLM configuration later, re-add the env vars to `/opt/data/.env` (via `railway ssh` or volume mount) and set the model with `hermes config set model <model-name>`.

### Supported Providers

| Provider | Base URL env | API Key env | Default Base URL |
|---|---|---|---|
| Ollama | `OLLAMA_BASE_URL` | *(none)* | `http://localhost:11434` |
| OpenAI | `OPENAI_BASE_URL` | `OPENAI_API_KEY` | `https://api.openai.com/v1` |
| OpenRouter | `OPENAI_BASE_URL` | `OPENAI_API_KEY` | `https://openrouter.ai/api/v1` |
| Anthropic | `ANTHROPIC_BASE_URL` | `ANTHROPIC_API_KEY` | `https://api.anthropic.com` |
| Groq | `GROQ_BASE_URL` | `GROQ_API_KEY` | `https://api.groq.com/openai/v1` |
| DeepSeek | `DEEPSEEK_BASE_URL` | `DEEPSEEK_API_KEY` | `https://api.deepseek.com/v1` |

### Advanced: Manual Configuration

You can also set these directly on the Railway service via the Railway dashboard or CLI:

```bash
# Example: configure Ollama
railway variables set \
  OLLAMA_BASE_URL=http://host.docker.internal:11434 \
  HERMES_HOME=/opt/data
railway variables set --secret HERMES_MODEL=qwen3:8b
# Then set the model in config.yaml:
railway ssh -- sh -c 'hermes config set model qwen3:8b'
```

> **Note**: Setting env vars on the service only takes effect after a redeploy (the running uvicorn process does not hot-reload `.env`). The wizard handles this by requiring a page reload after save.

## Architecture Notes

- **Hermes CLI dependency**: Task operations, profile management, and board settings shell out to the `hermes` CLI via `subprocess.run`. The `hermes` binary is provided by the `nousresearch/hermes-agent` base image's venv.
- **SSE over WebSocket**: The frontend uses `EventSource` to connect to `GET /api/events/stream` for real-time updates. This is an in-process SSE stream that polls board SQLite databases — no external gateway connection required.
- **SQLite WAL mode**: All board databases use WAL journal mode with idempotent schema migrations.
- **Single container**: The kanban web app runs as the sole process inside the Hermes agent container. s6-overlay's `/init` (PID 1) manages the process lifecycle and reaps zombies.
