# MA Memory Architect — REQUIREMENTS (reverse engineered)

> Generated from the existing `MA/` codebase. Used as the source for `BUILD-ORDER.md`, manifests, and stubs. **Not** an original product brief.

---

## 1. Vision

**MA Memory Architect** is a local-first “AI workspace” application: a Node HTTP server exposes a browser SPA where the user chats with an LLM, edits files in a mounted workspace, manages memory ingestion, blueprints, projects/archives, session worklog, todos/chores, and terminal commands — with tool execution and memory services on the backend.

**Who:** Developers and operators running MA on their machine (default HTTP port in tree: 3850).

**Why:** One UI to orchestrate LLM configuration, chat with streaming progress, file tools, and structured memory — without shipping a separate client build step (plain `<script>` tags).

---

## 2. Features (must-haves)

1. **Chat** — Multi-turn history, sessions, SSE streaming with step progress, attachments, slash commands, token usage display, continuation handling.
2. **LLM config** — Provider, model, keys, Anthropic capability toggles, Ollama model list/pull/show, connection status indicator.
3. **Workspace** — Tree, open/save/rename/delete/mkdir, folder browser modal, dirty-tab beforeunload warning, blueprint tabs, FSA/local file paths.
4. **Memory** — Archive listing, folder ingest with SSE progress and abort.
5. **Projects/archives** — List projects, state transitions, node trees, open node as read-only tab.
6. **Session/worklog** — Task editor, recent work, conversation grouping, `/api/worklog` sync.
7. **Chores/todos** — Todos in `localStorage`; chores CRUD via API.
8. **Terminal** — Drawer runs commands via `/api/terminal/exec` (server-sandboxed).
9. **Mode** — Chat vs Work mode synced with server + `localStorage`.
10. **Security UX** — `escHtml` / `escAttr` for dynamic HTML; JSON POST helper for consistent API calls.

---

## 3. Tech stack

| Area | Technology |
|------|------------|
| Server | Node.js, `http` / MA-Server entry, modular `BackEnd/` |
| Client | Single-page `MA-index.html`, vanilla JS (`ma-ui-namespace.js` first, then `window.MA.*` + legacy globals), five `ma-ui-*.css` files in fixed order |
| API | Same-origin REST + SSE (`/api/chat/stream`, ingest stream, etc.) |
| Storage | Server: config, workspace, memory index, projects; client: `localStorage` for theme, mode, todos, autopilot |
| LLM | Pluggable providers (OpenRouter-style, Anthropic, Ollama, …) via backend |

---

## 4. Data domains (contracts touch these)

- **Chat message** — role, content, optional attachments metadata.
- **Chat request payload** — message, short history window, autopilot flag.
- **Editor tab** — id, path/name, content, dirty, mode, blueprint flags, optional handles.
- **API JSON envelope** — success/error shapes per route (many ad hoc; contracts capture the few shared ones).

---

## 5. Interfaces

### 5.1 Browser → server (representative)

- `GET/POST /api/config`, `/api/whitelist/*`, `/api/ollama/*`
- `POST /api/chat`, `POST /api/chat/stream` (SSE)
- `GET/POST` workspace: tree, read, save, browse, open-folder, terminal, …
- `GET/POST` memory, projects, blueprints, worklog, chores, mode, slash, commands

### 5.2 Client module graph (load order)

`ma-ui.js` → `ma-ui-dom.js` → `ma-ui-api.js` → `ma-ui-chat.js` → `ma-ui-nav.js` → config → editor chain → workspace chain → `ma-ui-input.js` → `ma-ui-bootstrap.js`.

### 5.3 External

- User’s OS folder as workspace root (via server).
- LLM vendor HTTP APIs (server-side).

---

## 6. Non-goals (for this planning kit)

- Rewriting MA into a bundler (Webpack/Vite) — out of scope for requirements capture.
- Replacing Zod/tool schemas — backend already has real implementations; stubs model the **front** scripts only.

---

## Checklist (architect.md)

| Area | Status |
|------|--------|
| Vision | Covered |
| Features | Covered |
| Tech | Covered |
| Data | Covered |
| Interfaces | Covered |

No `TBD` blocks — this document describes the **current** system.
