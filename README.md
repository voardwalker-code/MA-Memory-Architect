# MA v1.0 — Memory Architect

**MA** is a standalone AI development agent that builds, researches, writes code, manages projects, runs recurring tasks, and maintains its own persistent memory across sessions. It ships as a self-contained Node.js server with one dependency (Zod). No bundler, no framework.

Everything runs from a browser GUI or a terminal CLI.

---

## Quick Start

```bash
cd MA
npm install          # installs Zod (the only dependency)
node MA-Server-standalone.js
```

Open the URL printed in the terminal (default **http://localhost:3850**). On first launch MA copies `ma-config.example.json` into `MA-Config/ma-config.json` and opens the settings panel so you can configure your LLM provider.

### Headless / no browser

```bash
# Linux / macOS
MA_NO_OPEN_BROWSER=1 node MA-Server-standalone.js

# Windows (PowerShell)
$env:MA_NO_OPEN_BROWSER=1; node MA-Server-standalone.js
```

### Terminal CLI

```bash
node MA-cli.js
```

---

## Features

| Feature | Description |
|---------|-------------|
| **Browser IDE** | Full workspace with tabs, file tree, syntax highlighting, find/replace, drag-and-drop file attachments |
| **Multi-LLM** | OpenRouter, Ollama (local), Anthropic, OpenAI-compatible endpoints |
| **Intelligent Model Routing** | Routes tasks to the best model from a configurable roster; local-first, learns from results |
| **Task Engine** | Classifies intent, plans multi-step execution, runs tools, self-reviews output |
| **Workspace Tools** | Sandboxed file I/O (`ws_read`, `ws_write`, `ws_list`, `ws_mkdir`, `ws_move`, `ws_delete`) |
| **Command Execution** | Sandboxed shell with a configurable whitelist (30+ defaults, dangerous binaries blocked) |
| **Web Search & Fetch** | Search the web and extract page text from URLs |
| **Memory System** | Episodic + semantic memory with BM25/RAKE/YAKE keyword search; persists across sessions |
| **Memory Ingest** | Stream-ingest entire folders into memory (SSE progress) |
| **Knowledge Base** | Reference docs loaded on-demand by topic |
| **Project Archives** | Persistent project lifecycle with open/close/status and weighted graph |
| **Agent Catalog** | Specialist agents (code-reviewer, senior-coder, etc.) delegated by the router |
| **Blueprint System** | Task-type execution guides for plan/execute/summarize phases |
| **Slash Commands** | 25+ commands for health, memory, knowledge, projects, config, models, chores |
| **Pulse Engine** | Background timer-driven tasks: health scans, chore execution |
| **Token Budget** | Tracks context usage, reserves response budget, shows a usage bar (up to 1M tokens) |
| **Auto Self-Review** | Reads back written files after generation to verify completeness |
| **History Compression** | Compresses older chat turns to fit long conversations in context |
| **Chat Sessions** | Save, load, and browse conversation history from the GUI |
| **Theme Switching** | Dark and light themes via the GUI |

---

## Configuration

### LLM Setup

Edit `MA-Config/ma-config.json` or use the browser settings panel:

```json
{
  "type": "openrouter",
  "endpoint": "https://openrouter.ai/api/v1/chat/completions",
  "apiKey": "sk-or-...",
  "model": "anthropic/claude-sonnet-4",
  "maxTokens": 12288
}
```

**Ollama (local, no API key):**

```json
{
  "type": "ollama",
  "endpoint": "http://localhost:11434",
  "model": "llama3.1:8b",
  "maxTokens": 8192
}
```

When Ollama is selected in the GUI, the model field becomes a dropdown populated from your local instance. Selecting a model auto-fills `maxTokens` from the model's context window.

### Model Roster

MA can route tasks to different models based on complexity, language, and context size. Configure a roster in `MA-Config/model-roster.json` or via `/models add` in chat.

### Command Whitelist

Managed in the GUI (Settings > Whitelist tab), via `/whitelist` slash commands, or by editing `MA-Config/cmd-whitelist.json`. Dangerous binaries (`rm`, `curl`, `bash`, `powershell`) are always blocked.

---

## Architecture

```
MA/
├── MA-Server-standalone.js     Canonical HTTP server entry
├── MA-Server.js                Shim (delegates to standalone)
├── MA-cli.js                   Terminal CLI
├── ma-start.js                 Background process manager (start/stop/status)
├── package.json                One dependency: Zod
│
├── BackEnd/
│   ├── MA-core.js              Bootstrap, state, chat orchestration
│   ├── MA-routes.js            HTTP route dispatcher
│   ├── MA-workspace-tools.js   Tool call parsing + sandboxed execution
│   ├── core/                   Config, bootstrap, chat, tokens, context
│   ├── llm/                    LLM API, router, capabilities, tool adapter
│   ├── services/               Memory, tasks, agents, pulse, worklog, archive
│   ├── nlp/                    BM25, RAKE, YAKE, markdown renderer
│   ├── infra/                  Health scanner, HTTP utils, web fetch, cmd executor
│   ├── routes/                 13 HTTP route modules
│   └── tools/                  Workspace tool modules (Zod schemas, fs, web, entity)
│
├── FrontEnd/
│   ├── MA-index.html           SPA shell
│   ├── css/                    5 layered stylesheets (tokens > chat > layout > editor > modals)
│   └── js/                     19 scripts (namespace, UI state, chat, nav, editor, config, ...)
│
├── MA-Config/                  Runtime config (gitignored secrets)
├── MA-entity/                  Entity identity, agent roster, memory store
├── MA-knowledge/               Reference documentation
├── MA-blueprints/              Task execution guides
├── MA-workspace/               Sandboxed project files (gitignored)
├── MA-logs/                    Pulse and server logs (gitignored)
├── MA-scripts/                 Utilities (agent definitions, guardrails, smoke test)
└── USER-GUIDE.md               Full documentation
```

---

## Ports

| Port | Purpose |
|------|---------|
| 3850 | Default |
| 3851-3860 | Fallback range if the default is busy |

MA auto-detects busy ports and picks the next one in range.

---

## npm Scripts

Run from inside `MA/`:

| Script | What it does |
|--------|-------------|
| `npm start` | Start the server (opens browser) |
| `npm run start:bg` | Start in background (PID file in `MA-logs/`) |
| `npm run stop` | Stop background server |
| `npm run status` | Check if background server is running |
| `npm run cli` | Terminal chat |
| `npm run health` | Filesystem + syntax health scan (28 core files) |
| `npm run guardrails:standalone` | Health + require-path escape check |
| `npm run smoke:standalone` | Brief server boot + `/api/health` test |

---

## Memory & Persistence

MA maintains persistent memory across sessions using flat-file storage with full-text indexing. Conversations, tasks, and insights are automatically stored and become searchable context for future interactions.

| Type | Location | Purpose |
|------|----------|---------|
| Episodic | `MA-entity/entity_ma/memories/episodic/` | Conversation events, tasks completed |
| Semantic | `MA-entity/entity_ma/memories/semantic/` | Abstracted knowledge and patterns |
| Chat Sessions | `MA-Config/chat-sessions/` | Full GUI conversation history |

Retrieval uses RAKE + YAKE keyword extraction and BM25 relevance scoring. Memories decay naturally over time but are never fully forgotten.

---

## Tools Available to MA

MA uses `[TOOL:name {json}]` blocks in LLM output, validated with Zod schemas:

| Tool | Description |
|------|-------------|
| `ws_list` | List directory |
| `ws_read` | Read file |
| `ws_write` | Write file |
| `ws_append` | Append to file |
| `ws_delete` | Delete file/folder |
| `ws_mkdir` | Create directory |
| `ws_move` | Move/rename |
| `web_search` | Web search |
| `web_fetch` | Fetch & extract page text |
| `cmd_run` | Run whitelisted shell command |

All file tools are sandboxed to `MA-workspace/`.

---

## What Stays Local

`.gitignore` keeps the following out of version control:
- `node_modules/`
- `MA-Config/ma-config.json` (API keys)
- `MA-Config/chat-sessions/` (your conversation history)
- `MA-logs/` (server and pulse logs)
- `MA-workspace/*` (sandbox projects — except the planning kit under `MA-workspace/MA-Memory-Architect/`)
- Entity runtime data: memories, indexes, archives, agent prompt history

---

## License

MIT — see [LICENSE](LICENSE).
