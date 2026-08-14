# Hermes Kanban Web

A web-based Kanban board for managing Hermes agent tasks. Features drag-and-drop task management, live event streaming via Server-Sent Events (SSE), dark/light mode, stash/restore, multi-board support, a profile manager, and a built-in web terminal with the full `hermes` CLI — all backed by a shared persistent volume with the Hermes agent.

## Screenshots

![Kanban Board](https://raw.githubusercontent.com/INAPP-Mobile/hermes-kanban-web/main/.github/screens/board.png)

![Task Detail](https://raw.githubusercontent.com/INAPP-Mobile/hermes-kanban-web/main/.github/screens/detail.png)

# Deploy and Host

Host your own Hermes Kanban board in minutes with a single click. The template provisions a FastAPI + vanilla JS single-page application running inside the official `nousresearch/hermes-agent` Docker image, with SSH-free persistent storage for all board and profile data plus a ttyd web terminal at `/terminal/`.

## Deploy to Railway

[![Deploy to Railway](https://railway.app/button.svg)](https://railway.com/deploy/hermes-kanban-web-1)

Click the button above to deploy this template to Railway. The template provisions two services: the **hermes-kanban-web** app (from the `nousresearch/hermes-agent` Docker image) with a persistent volume at `/opt/data` (boards, profiles, config), plus a companion **Ollama** service (from `ollama/ollama`) with a volume at `/root/.ollama` for local LLM inference. The app's `OLLAMA_BASE_URL` is auto-linked to the sibling over the internal Railway network.

## Dependencies for

The template is self-contained: it needs no external databases, caches, or third-party APIs for local LLM inference.

### Deployment Dependencies

- A Railway account with adequate quota for two small containers (Hobby or Pro plan).
- Provisioned automatically: the **hermes-kanban-web** app service + persistent volume (`/opt/data`), and the **Ollama** companion service + persistent volume (`/root/.ollama`), which pre-pulls `qwen3:8b` on first start.
- Optional: a cloud LLM provider (OpenAI-compatible, OpenAI, OpenRouter, Anthropic, or Groq) instead of the bundled Ollama.

## About Hosting

The app runs **inside the `nousresearch/hermes-agent` Docker image**, so the `hermes` CLI is on PATH and all persistent state (boards, profiles, config) lives under `HERMES_HOME` (`/opt/data`) on a Railway volume. Boards, profiles, stashed cards and theme survive redeploys and restarts.

### Updating Hermes

The Hermes runtime (`hermes` CLI + agent) is baked into the Docker image. The `/opt/hermes` directory in the container is the image's own runtime — it is **not** a persistent volume (Railway allows one volume per service, which is used for `/opt/data`).

- To update `hermes`, open the web terminal at `/terminal/` and run `hermes update` (or `pip install -U hermes-agent`). The update installs to the image's `/opt/hermes` but **does not survive redeploys** — it will revert to the base-image version on the next deploy.
- If you need a persistent custom Hermes install, you would need a separate template/service pattern (not supported in this single-service template).

## Why Deploy

- **Zero-config self-hosting** — one-click deploy, persistent volume provided, no external services to wire up.
- **AI-agent-aware task board** — task lifecycle operations shell out to the real `hermes` CLI, so the board you manage is the same system your agents run on.
- **Real-time by default** — SSE keeps multiple browser tabs in sync without polling.
- **Optional auth** — lock the board behind a bearer token in one env var; leave it empty for an open team board.
- **Built-in web terminal** — run `hermes` CLI maintenance commands right from the browser at `/terminal/`.

## Common Use Cases

- Managing and visually tracking Hermes agent task queues across Todo, Ready, In Progress, Blocked, and Done.
- A lightweight team kanban that reuses existing Hermes profiles and config instead of a separate issue tracker.

# Overview

Hermes Kanban Web is a FastAPI + vanilla JS single-page application providing a browser-based UI for Hermes agent tasks. Boards are SQLite databases, task lifecycle operations shell out to the `hermes` CLI, and real-time updates stream via SSE.

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
- **Web terminal** — a ttyd terminal at `/terminal/` (HTTP Basic Auth) gives you a bash shell with the full `hermes` CLI on PATH for maintenance

## Authentication (optional)

By default the board is **open with no authentication**. To protect the API, set `HERMES_KANBAN_API_TOKEN` (Railway Vars tab): leave it empty for an open board, or set it to a secret value and every API request (including the live SSE stream) must send `Authorization: Bearer <token>`. Generate one with `openssl rand -hex 32`.

## Web Terminal

A **ttyd** web terminal is available at **`/terminal/`** (or `https://<your-app>.up.railway.app/terminal/`), protected by **HTTP Basic Auth**:

- Credentials come from `ADMIN_USERNAME` / `ADMIN_PASSWORD` (the template generates a random `ADMIN_PASSWORD` by default — read it in the Railway Variables tab after deploy; if empty at boot, a random one is printed to the container logs).
- The shell is bash, running as the `hermes` user with `HERMES_HOME=/opt/data`, and the full **`hermes` CLI is on PATH** — e.g. `hermes kanban boards list`, `hermes kanban task --board <slug> --create "..."`, `hermes profile list`. A welcome banner lists the most useful commands.

Architecture: nginx (the public `PORT`) routes `/` to the FastAPI app (uvicorn on `127.0.0.1:12700`) and `/terminal/` to ttyd (`127.0.0.1:7681`) behind `auth_basic`; supervisord supervises nginx, uvicorn, the Hermes gateway, and ttyd. The terminal is never exposed directly.

## Self-hosting (Docker)

```bash
docker run -d --name hermes-kanban-web -p 8502:8502 -e PORT=8502 -e HERMES_HOME=/opt/data -v hermes-data:/opt/data ghcr.io/inapp-mobile/hermes-kanban-web:latest
```

# Configuration

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `PORT` | `8502` | HTTP port nginx listens on (Railway injects this automatically) |
| `ADMIN_USERNAME` | `admin` | Username for the `/terminal/` web terminal basic-auth gate |
| `ADMIN_PASSWORD` | *(generated)* | Password for the `/terminal/` web terminal basic-auth gate |
| `HERMES_HOME` | `/opt/data` | Root directory for all Hermes persistent state (boards, profiles, config) |
| `HOME` | `$HERMES_HOME` | Set to match HERMES_HOME so `~` resolves to the volume |
| `HERMES_KANBAN_API_TOKEN` | *(empty)* | Optional bearer token. When set, all API requests require `Authorization: Bearer <token>`. |

## Persistent Volume

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

In Railway, the volume is mounted at `/opt/data` (the default `HERMES_HOME` in the base image). `start.sh` ensures `kanban/boards/` and `kanban/stash/` exist and seeds a minimal `config.yaml` if none is present.

## LLM Setup

A bundled **Ollama** companion service runs on deploy (pre-pulled `qwen3:8b`), and a **setup wizard** appears on first open. Pick a provider, base URL, model, and API key (if any), then **Save & Reload**. The wizard writes provider env vars to `/opt/data/.env` and sets the model via `hermes config set model`. For the bundled Ollama the base URL is already wired to `https://ollama.railway.internal:11434` — just confirm the model. The modal won't reappear after setup; to change the LLM later, edit `/opt/data/.env` and run `hermes config set model <model>`.

### Supported Providers

Ollama, OpenAI, OpenRouter, Anthropic, Groq, and DeepSeek — each maps to its own base-URL/API-key env vars (e.g. `OLLAMA_BASE_URL`, `OPENAI_BASE_URL`, `OPENAI_API_KEY`) written to `/opt/data/.env`.

### Advanced: Manual Configuration

To point at a different Ollama host/model instead of the bundled companion: set `OLLAMA_BASE_URL` / `HERMES_MODEL` via `railway variables set`, then `railway ssh -- sh -c 'hermes config set model qwen3:8b'`. Env changes take effect after a redeploy (uvicorn does not hot-reload `.env`); the wizard instead reloads the page after save.

# Architecture Notes

- **Hermes CLI dependency**: Task operations, profile management, and board settings shell out to the `hermes` CLI via `subprocess.run` (from the base image's venv).
- **SSE over WebSocket**: The frontend uses `EventSource` on `GET /api/events/stream`; an in-process stream polls board SQLite databases — no external gateway connection required.
- **SQLite WAL mode**: All board databases use WAL journal mode with idempotent schema migrations.
- **Four supervised processes**: nginx (public proxy on `$PORT`), uvicorn (app on `127.0.0.1:12700`), the Hermes gateway (embedded kanban dispatcher), and ttyd (web terminal on `127.0.0.1:7681`) run under **supervisord**; s6-overlay's `/init` (PID 1) manages lifecycle and reaps zombies, and a `cont-init.d` boot hook renders nginx.conf from `$PORT` and writes the `/terminal/` htpasswd.
- **Ollama companion service**: A separate `ollama/ollama` container runs alongside on the internal Railway network at `https://ollama.railway.internal:11434`, persists models at `/root/.ollama`, and pre-pulls `qwen3:8b` on first start. The app reaches it via `OLLAMA_BASE_URL`, auto-linked to the sibling.