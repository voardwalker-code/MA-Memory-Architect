# MA Memory Architect — Architecture Plan

> Comprehensive architectural blueprint for MA Memory Architect. Estimated scope: ~45+ backend modules, ~19 frontend scripts (including `ma-ui-namespace.js`), ~13 route handlers, **five** layered CSS files, and one HTML shell. One dependency (Zod). Zero bundler.

---

## Table of Contents

1. [System Overview](#1-system-overview)
2. [Design Philosophy](#2-design-philosophy)
3. [Runtime Architecture](#3-runtime-architecture)
4. [Backend Subsystem Map](#4-backend-subsystem-map)
5. [Frontend Subsystem Map](#5-frontend-subsystem-map)
6. [Data Flow: Chat Lifecycle](#6-data-flow-chat-lifecycle)
7. [Data Flow: Memory Ingest](#7-data-flow-memory-ingest)
8. [Module Dependency Graph](#8-module-dependency-graph)
9. [API Surface](#9-api-surface)
10. [State Management](#10-state-management)
11. [Security Boundaries](#11-security-boundaries)
12. [Resilience Model](#12-resilience-model)
13. [File Inventory](#13-file-inventory)
14. [Stub Kit Cross-Reference](#14-stub-kit-cross-reference)
15. [Quality Gates](#15-quality-gates)
16. [Scalability & Transport Hardening](#16-scalability--transport-hardening)

---

## 1. System Overview

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                        MA Memory Architect v1.0                              │
│                                                                              │
│   A self-contained AI development agent that builds, researches, writes      │
│   code, manages projects, runs recurring tasks, and maintains its own        │
│   persistent memory — all from a browser GUI or terminal CLI.                │
│                                                                              │
│   One Node.js process. One dependency (Zod). No bundler. No framework.       │
│   Will ship as a folder you run with `node MA-Server-standalone.js`.         │
└──────────────────────────────────────────────────────────────────────────────┘
```

### What makes this system different

Most AI chat UIs are thin wrappers over an API. MA is not. MA is an **agent** — it will plan multi-step tasks, execute file and shell tools inside a sandboxed workspace, remember what happened across sessions, route jobs to the best model in a roster, self-review its output, and run background chores on a timer. The browser GUI will be a full IDE with tabs, syntax highlighting, find/replace, a file tree, and drag-and-drop file attachments. All of that is expected to live in roughly 60–70 JavaScript files, one HTML page, and several CSS files loaded in a fixed order (no preprocessor).

---

## 2. Design Philosophy

### Guiding principles

| Principle | How it will work |
|-----------|-----------------|
| **Zero-framework, zero-build** | No React, no Webpack. Browser will load `<script>` tags in order. Server will use raw `http.createServer`. |
| **Globals-on-window** | Shared state still lives on `window` (`openTabs`, `history`, `chatEl`). A **namespace object** `window.MA` will group callable entrypoints (`MA.chat.send`, `MA.nav.switchMode`, …) for console clarity and to reduce accidental collisions; `ma-ui.js` remains the coat rack for DOM hooks. |
| **Layered CSS** | Multiple `<link rel="stylesheet">` files (tokens/base → chat → layout → workspace/editor → panels/modals) keep rules discoverable without a CSS bundler. |
| **Orchestrator + sub-modules** | Both `MA-core.js` and `MA-routes.js` will be thin dispatchers. Real logic will live in focused files (`core-chat.js`, `route-config.js`, `svc-memory.js`). |
| **safeRequire resilience** | Orchestrators will load every sub-module with `try/catch`. If `svc-pulse.js` is broken, the server should still boot and chat should still work. One broken part should never crash the whole ship. |
| **Prefix-owns-folder** | `nlp/nlp-*.js`, `llm/llm-*.js`, `services/svc-*.js`, `infra/infra-*.js`, `routes/route-*.js`, `tools/tools-*.js`, `core/core-*.js`. No generic names. |
| **Sandbox everything** | File tools will be jailed to `MA-workspace/`. Shell commands must be whitelisted. API keys will be masked in the UI. Path inputs will be escaped. |
| **SSE over polling** | Long operations (chat, ingest) will stream progress via Server-Sent Events so the UI updates in real time — no interval timers hammering the server. |

### The "no-build" constraint

This is not accidental. MA must start on any machine with Node.js installed, in under 2 seconds, with no `npm run build` step. That decision will ripple through every architecture choice: no JSX, no TypeScript (client-side), no CSS preprocessor, no module bundler. Trade-offs are real (no tree-shaking, no HMR), but cold start time should be zero and the mental model will be "open the file, read it top to bottom."

---

## 3. Runtime Architecture

```
                          ┌─────────────────────┐
                          │   User's browser     │
                          │                      │
                          │  MA-index.html       │
                          │  ├ 5 × ma-ui-*.css   │
                          │  └ ~19 × ma-ui-*.js  │
                          └──────────┬───────────┘
                                     │
                          HTTP (REST + SSE)
                          localhost:3850
                                     │
              ┌──────────────────────┴──────────────────────┐
              │              MA-Server-standalone.js         │
              │  ┌──────────────────────────────────────┐   │
              │  │  MA-routes.js (dispatcher)            │   │
              │  │  ├ route-chat.js      (SSE stream)   │   │
              │  │  ├ route-config.js    (LLM setup)    │   │
              │  │  ├ route-workspace.js (file I/O)     │   │
              │  │  ├ route-memory.js    (search/store)  │   │
              │  │  ├ route-ollama.js    (model mgmt)   │   │
              │  │  ├ route-projects.js  (archives)     │   │
              │  │  ├ route-blueprints.js               │   │
              │  │  ├ route-commands.js  (slash + WL)   │   │
              │  │  ├ route-worklog.js                  │   │
              │  │  ├ route-pulse.js     (timers)       │   │
              │  │  ├ route-models.js    (roster)       │   │
              │  │  ├ route-system.js    (entity+health)│   │
              │  │  └ route-static.js    (fallback)     │   │
              │  └──────────────────────────────────────┘   │
              │                      │                      │
              │  ┌───────────────────┼───────────────────┐  │
              │  │          MA-core.js (conductor)       │  │
              │  │  ┌───────┬────────┬────────┬───────┐ │  │
              │  │  │ core- │ core-  │ core-  │ core- │ │  │
              │  │  │config │ boot   │ chat   │tokens │ │  │
              │  │  └───────┴────────┴────────┴───────┘ │  │
              │  └───────────────────┼───────────────────┘  │
              │           ┌─────────┼─────────┐             │
              │    ┌──────┴──┐  ┌───┴────┐  ┌─┴──────┐     │
              │    │ services│  │  llm/  │  │ tools/ │     │
              │    │ svc-*   │  │ llm-*  │  │tools-* │     │
              │    └─────────┘  └────────┘  └────────┘     │
              │    ┌─────────┐  ┌────────┐                  │
              │    │  nlp/   │  │ infra/ │                  │
              │    │ nlp-*   │  │infra-* │                  │
              │    └─────────┘  └────────┘                  │
              └─────────────────────────────────────────────┘
                                     │
                    ┌────────────────┼────────────────┐
                    │                │                │
               MA-workspace/   MA-Config/       MA-entity/
               (sandboxed)     (gitignored)     (identity +
                                                 memory index)
```

### Port resolution

Default port will be 3850; if occupied, the server will scan through 3860. Smart detection should tell the user what process holds the port before auto-incrementing.

---

## 4. Backend Subsystem Map

An estimated ~45+ `.js` files across 8 planned folders. Every folder owns a prefix.

### Orchestrators (root level, 3 files)

| File | Est. size | Role |
|------|-----------|------|
| `MA-core.js` | ~250–300 lines | Shared state, boot sequence, delegates `handleChat` to `core-chat.js`. Both HTTP server and CLI will import this. |
| `MA-routes.js` | ~150–200 lines | `createRouteHandler()`: will load ~13 route modules with `safeRequire`, dispatch request to first claimant. |
| `MA-workspace-tools.js` | ~200–250 lines | Tool execution engine: will parse `[TOOL:...]` from LLM output, validate with Zod, dispatch to `tools-*.js`. |

### core/ — Config, boot, chat orchestration (~5 files)

| File | Purpose |
|------|---------|
| `core-config.js` | Will load/save `ma-config.json`, merge defaults, validate provider shape |
| `core-bootstrap.js` | Will create dirs, load entity, register skills, warm memory index |
| `core-chat.js` | The big one: will handle task classification, planning, multi-step execution, self-review, continuation, response formatting |
| `core-tokens.js` | Will count tokens (heuristic: `chars/4`), compress older history, enforce budget |
| `core-context.js` | Will gather file context, memory recall, knowledge docs — the "context sandwich" before the LLM prompt |

### llm/ — AI model communication (~4 files)

| File | Purpose |
|------|---------|
| `llm-api.js` | Unified `callLLM(prompt, config)` — will handle OpenRouter, Ollama, native tool use, streaming |
| `llm-router.js` | Will manage multi-model roster, performance tracking (A–F per task type), tier escalation, local-first preference |
| `llm-capabilities.js` | Will detect features per provider: extended thinking, cache, compaction, native tool calls |
| `llm-tool-adapter.js` | Will translate `[TOOL:...]` text format to/from native tool-call JSON for providers that support it |

### services/ — Business logic (~7 files)

| File | Purpose |
|------|---------|
| `svc-memory.js` | Will manage episodic + semantic memory store, BM25 search, importance scoring, recall |
| `svc-tasks.js` | Will handle ~8 task types, plan generation, step execution, summary pipeline |
| `svc-agents.js` | Will host agent catalog (~6 specialists), role-based prompt injection |
| `svc-pulse.js` | Will run background timers: health scan interval, chore execution interval |
| `svc-worklog.js` | Will track current task, resume point, recent work array — persisted to disk |
| `svc-project-archive.js` | Will manage project lifecycle (create/open/close), node trees, archive state machine |
| `svc-slash-commands.js` | Will provide ~25 `/commands`, parsing, dispatch, help generation |

### nlp/ — Text algorithms (~4 files)

| File | Purpose |
|------|---------|
| `nlp-bm25.js` | Will implement Okapi BM25 relevance scoring for memory search |
| `nlp-rake.js` | Will implement RAKE keyword extraction |
| `nlp-yake.js` | Will implement YAKE keyword extraction (statistical, no training data) |
| `nlp-markdown.js` | Will render Markdown-to-HTML server-side (for user guide) |

### infra/ — System utilities (~4 files)

| File | Purpose |
|------|---------|
| `infra-health.js` | Will run multi-file integrity scan: JS syntax, JSON validity, HTML tag balance |
| `infra-http-utils.js` | Will provide `json(res, data)`, `readBody`, path helpers, `sseStreamHeaders()` for SSE responses (`Cache-Control: no-cache, no-transform`, `X-Accel-Buffering: no`) |
| `infra-web-fetch.js` | Will implement `web_search`, `web_fetch` tool backends |
| `infra-cmd-executor.js` | Will provide sandboxed shell: whitelist check → spawn → timeout → capture |

### tools/ — Workspace tool implementations (~5–6 files)

| File | Purpose |
|------|---------|
| `tools-schemas.js` | Will define Zod schemas for every `[TOOL:...]` (the only runtime dependency) |
| `tools-parser.js` | Will use regex to extract `[TOOL:name {...}]` blocks from LLM text |
| `tools-fs.js` | Will implement `ws_list`, `ws_read`, `ws_write`, `ws_append`, `ws_delete`, `ws_mkdir`, `ws_move` |
| `tools-web.js` | Will implement `web_search`, `web_fetch`, `cmd_run` — delegating to `infra/` |
| `tools-entity.js` | Will handle entity creation, memory injection for characters/books |
| `tools-book.js` | Will provide book chunk reader for large-file ingestion |

### routes/ — HTTP endpoint handlers (~13 files)

Each file will export an `init(deps)` function that returns a `handle(req, res)` async function. The dispatcher will call them in order; the first one that recognizes the URL handles it.

| File | Endpoints |
|------|-----------|
| `route-chat.js` | `/api/chat`, `/api/chat/stream` (SSE), `/api/chat/sessions`, `/api/chat/session/:id` |
| `route-config.js` | `/api/config`, `/api/mode` |
| `route-ollama.js` | `/api/ollama/models`, `/api/ollama/show`, `/api/ollama/pull` |
| `route-system.js` | `/api/entity`, `/api/health` |
| `route-pulse.js` | `/api/pulse/*` |
| `route-models.js` | `/api/models/*` |
| `route-worklog.js` | `/api/worklog` |
| `route-projects.js` | `/api/projects/*` |
| `route-blueprints.js` | `/api/blueprints`, `/api/blueprints/file` |
| `route-commands.js` | `/api/commands`, `/api/slash`, `/api/whitelist/*` |
| `route-memory.js` | `/api/memory/*`, `/api/memory/ingest-folder` (SSE) |
| `route-workspace.js` | `/api/workspace/*`, `/api/terminal/exec` |
| `route-static.js` | Will serve everything else: static files from `FrontEnd/`, user guide fallback |

---

## 5. Frontend Subsystem Map

An estimated ~19 `.js` files (including `ma-ui-namespace.js` first), **five** `.css` files, 1 `.html`. No bundler. Scripts will load via `<script>` tags in strict order — a later script can call functions defined by an earlier one but not vice versa.

### Load order & responsibility

```
  ┌─ Foundation ─────────────────────────────────────────────────────────┐
  │                                                                      │
  │  0. ma-ui-namespace.js   window.MA = { dom, api, chat, nav, … };    │
  │                            feature scripts register MA.* entrypoints │
  │  1. ma-ui.js              Coat rack: DOM refs, openTabs[], history, │
  │                            theme, initializeMAUI()                   │
  │  2. ma-ui-dom.js          escHtml(), escAttr() — safety lids        │
  │  3. ma-ui-api.js          apiPostJson() — pre-addressed envelope    │
  │                                                                      │
  ├─ Communication ──────────────────────────────────────────────────────┤
  │                                                                      │
  │  4. ma-ui-chat.js         send(), SSE parsing, sessions, progress   │
  │                            widget, file-change Keep/Reject, thinking │
  │                            block, continuation, handleChatResult()   │
  │                                                                      │
  ├─ Chrome & navigation ────────────────────────────────────────────────┤
  │                                                                      │
  │  5. ma-ui-nav.js          Menu bar, folder browser modal, terminal  │
  │                            panel, Chat/Work mode, splitters, rail    │
  │                                                                      │
  ├─ Configuration ──────────────────────────────────────────────────────┤
  │                                                                      │
  │  6. ma-ui-config-settings LLM provider form, API key mask, whitelist│
  │                            tab, Ollama model browser, status dot     │
  │  7. ma-ui-config-ingest   Memory folder ingest, SSE progress + abort│
  │                                                                      │
  ├─ Editor workbench ───────────────────────────────────────────────────┤
  │                                                                      │
  │  8. ma-ui-editor.js       Shared vars (folds, find state),          │
  │                            beforeunload dirty-tab guard              │
  │  9. ma-ui-editor-tabs.js  Open/close/save tabs, detect mode,        │
  │                            render tab bar + pane body                │
  │ 10. ma-ui-editor-tree.js  Sidebar scaffold per rail section,        │
  │                            workspace tree from API, filter,          │
  │                            drag-to-attach, right-click context menu  │
  │ 11. ma-ui-editor-find.js  Ctrl+F / Ctrl+H floating find/replace    │
  │ 12. ma-ui-editor-styled   Markdown preview, syntax colors, fold,    │
  │                            bracket match, overlay textarea sync      │
  │                                                                      │
  ├─ Workspace panes (sidebar content) ──────────────────────────────────┤
  │                                                                      │
  │ 13. workspace-session     Task editor, /api/worklog, recent work,   │
  │                            conversation groups by date               │
  │ 14. workspace-projects    Project cards, state buttons, node trees,  │
  │                            read-only node tab                        │
  │ 15. workspace-blueprints  Blueprint list by group, special editor    │
  │                            tab, save through /api/blueprints/file    │
  │ 16. workspace-todos       localStorage todos (your browser only),   │
  │       -chores              chore CRUD via /api/chores                │
  │                                                                      │
  ├─ Composer ───────────────────────────────────────────────────────────┤
  │                                                                      │
  │ 17. ma-ui-input.js        Slash command popup, file chips, drag/drop│
  │                            file attach, token bar, handleKey wrapper │
  │                                                                      │
  ├─ Boot ───────────────────────────────────────────────────────────────┤
  │                                                                      │
  │ 18. ma-ui-bootstrap.js    Will call MA.ui.initializeMAUI() or        │
  │                            initializeMAUI(); ?bookId= deep-link     │
  │                                                                      │
  └──────────────────────────────────────────────────────────────────────┘
```

### CSS architecture (five files, load order fixed in `MA-index.html`)

| File | Scope |
|------|--------|
| `ma-ui-tokens-base.css` | `:root` tokens, light theme, global resets, scrollbars |
| `ma-ui-chat-panels.css` | Chat rail, messages, composer, progress widget |
| `ma-ui-layout-inspector.css` | Menu bar, splitters, terminal, rail scaffold |
| `ma-ui-workspace-editor.css` | File tree, tabs, editor panes, styled-text |
| `ma-ui-panels-modals.css` | Config, ingest, modals, toasts, folder browser |

- Fonts: **Outfit** (UI), **JetBrains Mono** (code).
- No CSS preprocessor. No utility classes. A token palette (`--tok-keyword`, `--tok-string`, etc.) will power the editor styled-text colorizer.

---

## 6. Data Flow: Chat Lifecycle (planned)

```
User types message
        │
        ▼
  ma-ui-input.js: handleKey(Enter) → calls send()
        │
        ▼
  ma-ui-chat.js: send()
  ├─ Builds payload: { message, history[-10], attachments?, autoPilot }
  ├─ POSTs to /api/chat/stream via apiPostJson (with AbortController)
  │
  ▼ ──────────── HTTP boundary ──────────────
  │
  route-chat.js
  ├─ Parses body; SSE response uses `sseStreamHeaders()` (anti-buffering)
  ├─ Delegates to core.handleChat(message, history, opts)
  │   │
  │   ├─ core-context.js: gathers context sandwich
  │   │   ├─ svc-memory.js: BM25 recall (via nlp-bm25 + nlp-rake topics)
  │   │   ├─ knowledge docs (loaded on-demand by topic)
  │   │   └─ workspace file paths detected in the message
  │   │
  │   ├─ svc-tasks.js: classifies → plans → executes steps
  │   │   ├─ llm-router.js: picks best model from roster
  │   │   └─ llm-api.js: callLLM() → provider HTTP call
  │   │
  │   ├─ MA-workspace-tools.js: executes [TOOL:...] calls
  │   │   ├─ tools-parser.js: extracts calls from LLM text
  │   │   ├─ tools-schemas.js: validates params with Zod
  │   │   └─ tools-fs / tools-web: sandboxed execution
  │   │
  │   ├─ Self-review: re-reads written files, verifies completeness
  │   ├─ core-tokens.js: compresses if near budget
  │   └─ Returns { reply, thinking?, filesChanged?, continuation?, ... }
  │
  ▼ SSE events: activity → step → step → done
  │
  ▼ ──────────── HTTP boundary ──────────────
  │
  ma-ui-chat.js: SSE parser
  ├─ event:step → show/update progress widget
  ├─ event:activity → refresh worklog if plan/worklog category
  ├─ event:done → process final result
  │   ├─ Render MA reply with markdown
  │   ├─ Thinking collapsible block (if present)
  │   ├─ Self-review badge (if reviewed)
  │   ├─ File change rows with Keep / Reject
  │   ├─ Token bar update
  │   ├─ Continuation button (if partial)
  │   ├─ Save session to server
  │   └─ Refresh worklog sidebar
  └─ event:error → display system error
```

---

## 7. Data Flow: Memory Ingest (planned)

```
User enters folder path, clicks Ingest
        │
        ▼
  ma-ui-config-ingest.js: ingestFolder()
  ├─ Opens SSE connection to /api/memory/ingest-folder with { folderPath, archive }
  ├─ Shows progress overlay, disables button
  │
  ▼ ──────────── HTTP boundary ──────────────
  │
  route-memory.js: POST /api/memory/ingest-folder (SSE headers via `sseStreamHeaders()`)
  ├─ Walks directory tree
  ├─ For each file:
  │   ├─ Reads content
  │   ├─ nlp-rake.js: extracts topics
  │   ├─ Chunks into segments
  │   ├─ svc-memory.js: stores each chunk
  │   └─ SSE event:progress { file, processed, total }
  ├─ SSE event:done { filesProcessed, chunksStored, archive }
  └─ On error: SSE event:error { error }
  │
  ▼ ──────────── HTTP boundary ──────────────
  │
  ma-ui-config-ingest.js: SSE parser
  ├─ On progress → updates bar % + file log
  ├─ On done → shows 100%, reloads archives list
  └─ On error → red bar, error text
```

---

## 8. Module Dependency Graph

### Backend (simplified — shows planned import relationships)

```
MA-Server-standalone.js
  ├── MA-core.js
  │     ├── core/core-config.js
  │     ├── core/core-bootstrap.js
  │     ├── core/core-chat.js
  │     │     ├── core/core-tokens.js
  │     │     ├── core/core-context.js
  │     │     ├── services/svc-memory.js
  │     │     │     ├── nlp/nlp-bm25.js
  │     │     │     ├── nlp/nlp-rake.js
  │     │     │     └── nlp/nlp-yake.js
  │     │     ├── services/svc-tasks.js
  │     │     └── services/svc-agents.js
  │     ├── llm/llm-router.js
  │     │     └── llm/llm-capabilities.js
  │     ├── services/svc-pulse.js
  │     ├── services/svc-worklog.js
  │     ├── services/svc-project-archive.js
  │     └── infra/infra-health.js
  ├── llm/llm-api.js
  │     └── llm/llm-tool-adapter.js
  ├── MA-workspace-tools.js
  │     ├── tools/tools-schemas.js  (Zod)
  │     ├── tools/tools-parser.js
  │     ├── tools/tools-fs.js
  │     ├── tools/tools-web.js
  │     │     ├── infra/infra-web-fetch.js
  │     │     └── infra/infra-cmd-executor.js
  │     ├── tools/tools-entity.js
  │     └── tools/tools-book.js
  ├── MA-routes.js
  │     ├── routes/route-chat.js
  │     ├── routes/route-config.js
  │     ├── ... (~13 planned)
  │     └── routes/route-static.js
  └── infra/infra-http-utils.js
```

### Frontend (planned load-order graph, arrows = "will use globals from")

```
ma-ui-namespace.js (first — `window.MA` shell; modules register buckets)
  │
  ▼
ma-ui.js ◄──── every other file
  │
  ├─► ma-ui-dom.js ◄──── every file that builds HTML
  │
  ├─► ma-ui-api.js ◄──── every file that POSTs JSON
  │
  ├─► ma-ui-chat.js ◄── nav, input, workspace-session, workspace-projects
  │
  ├─► ma-ui-nav.js ◄── config-settings (setRailActive)
  │
  ├─► ma-ui-editor.js → editor-tabs → editor-tree → editor-find → editor-styled
  │                        (strict chain — each needs the previous)
  │
  ├─► workspace-session ◄── workspace-projects (loadWorklog after state change)
  │
  └─► ma-ui-bootstrap.js (will run last, calls MA.ui.initializeMAUI / initializeMAUI)
```

---

## 9. API Surface

### By category (estimated ~30–35 endpoints across ~13 route files)

| Category | Endpoints | Verbs | SSE? |
|----------|-----------|-------|------|
| **Chat** | `/api/chat`, `/api/chat/stream`, `/api/chat/sessions`, `/api/chat/session/:id`, `/api/chat/session` | GET, POST | Yes (`stream`) |
| **Config** | `/api/config`, `/api/mode` | GET, POST | — |
| **Ollama** | `/api/ollama/models`, `/api/ollama/show`, `/api/ollama/pull` | GET, POST | — |
| **System** | `/api/entity`, `/api/health` | GET | — |
| **Pulse** | `/api/pulse/status`, `/api/pulse/config`, `/api/pulse/start`, `/api/pulse/stop`, `/api/pulse/logs` | GET, POST | — |
| **Models** | `/api/models/roster`, `/api/models/add`, `/api/models/update`, `/api/models/remove`, `/api/models/route`, `/api/models/performance`, `/api/models/research` | GET, POST | — |
| **Worklog** | `/api/worklog` | GET, POST | — |
| **Projects** | `/api/projects`, `/api/projects/state`, `/api/projects/nodes/:id`, `/api/projects/node/:pid/:nid` | GET, POST | — |
| **Blueprints** | `/api/blueprints`, `/api/blueprints/file` | GET, POST | — |
| **Commands** | `/api/commands`, `/api/slash`, `/api/whitelist`, `/api/whitelist/add`, `/api/whitelist/remove`, `/api/whitelist/reset` | GET, POST | — |
| **Memory** | `/api/memory/search`, `/api/memory/store`, `/api/memory/stats`, `/api/memory/archives`, `/api/memory/ingest-folder` | GET, POST | Yes (`ingest-folder`) |
| **Workspace** | `/api/workspace/tree`, `/api/workspace/read`, `/api/workspace/save`, `/api/workspace/mkdir`, `/api/workspace/delete`, `/api/workspace/rename`, `/api/workspace/browse`, `/api/workspace/open-folder`, `/api/workspace/info`, `/api/workspace/quick-paths`, `/api/terminal/exec` | GET, POST | — |
| **Static** | `/*` (fallback) | GET | — |

### Envelope convention

Most mutations will return `{ ok: true }` on success, `{ ok: false, error: "..." }` on failure. Reads will return domain-specific shapes. Rather than one enforced schema, `mma-contracts/mma-api-envelope.js` will capture the shared subset.

---

## 10. State Management

### Server-side state (planned `MA-core.js` shared object)

| Key | Type | Persisted? | Where |
|-----|------|------------|-------|
| `config` | LLM provider settings | Yes | `MA-Config/ma-config.json` |
| `entity` | Identity + agent roster | Yes | `MA-entity/entity_ma/` |
| `memory` | Semantic + episodic index | Yes | `MA-entity/*/memories/` + `memoryIndex.json` |
| `mode` | `'chat'` or `'work'` | Session only | In-memory (client mirrors in `localStorage`) |
| `worklog` | Current task, plan, recent work | Yes | Managed by `svc-worklog.js` |
| `projects` | Open/archived state | Yes | `MA-entity/*/projects/` |
| `cmdWhitelist` | Allowed shell commands | Yes | `MA-Config/cmd-whitelist.json` |
| `modelRoster` | Available models + perf grades | Yes | `MA-Config/model-roster.json` |

### Client-side state (planned browser `window` + `localStorage`)

| Variable / Key | Owner file | Scope |
|----------------|-----------|-------|
| `history[]` | `ma-ui.js` | Session (will be lost on refresh unless saved) |
| `openTabs[]`, `activeTabId` | `ma-ui.js` | Session |
| `pendingFiles[]` | `ma-ui.js` | Volatile (will be cleared after send) |
| `activeSessionId` | `ma-ui-chat.js` | Session (will match server session) |
| `currentInspector` | `ma-ui.js` | Session |
| `currentMode` | `ma-ui-nav.js` | `localStorage` + server sync |
| `THEME_KEY` | `ma-ui.js` | `localStorage` (persisted across sessions) |
| `AUTOPILOT_KEY` | `ma-ui-chat.js` | `localStorage` (persisted across sessions) |
| `TODO_STORAGE_KEY` | `ma-ui.js` / `*-todos-chores.js` | `localStorage` (browser-local only) |
| `_editorFoldState` | `ma-ui-editor.js` | Session |
| `_fbCurrentPath` | `ma-ui-nav.js` | Session |
| `slashCommands[]` | `ma-ui-input.js` | Will be fetched once from `/api/commands` |

---

## 11. Security Boundaries

```
┌────────────────────────────────────────────────────────────────────────┐
│ UNTRUSTED                                                              │
│                                                                        │
│   User-typed text       Server responses       File names from disk    │
│         │                      │                       │               │
│         ▼                      ▼                       ▼               │
│   ┌─────────────┐   ┌─────────────────┐   ┌──────────────────┐       │
│   │ escHtml()   │   │ escHtml()       │   │ escAttr() in     │       │
│   │ before      │   │ before          │   │ onclick='...'    │       │
│   │ innerHTML   │   │ innerHTML       │   │ handlers         │       │
│   └─────────────┘   └─────────────────┘   └──────────────────┘       │
│                                                                        │
├────────────────────────────────────────────────────────────────────────┤
│ SANDBOXED                                                              │
│                                                                        │
│   File tools → path.normalize() + jail to MA-workspace/               │
│   Shell commands → whitelist check + timeout + spawn (no shell: true)  │
│   API keys → masked in UI (cfg-key = ********)                         │
│   Workspace browse → server will resolve real path, never trust client │
│                                                                        │
├────────────────────────────────────────────────────────────────────────┤
│ BLOCKED                                                                │
│                                                                        │
│   rm, curl, bash, powershell, wget → hardcoded binary blacklist        │
│   Path traversal (../../) → normalized + startsWith check              │
│   Cross-origin → same-origin only (localhost)                          │
│                                                                        │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 12. Resilience Model

MA will be designed so **one broken piece never takes down the whole system**.

| Mechanism | Where | Effect |
|-----------|-------|--------|
| `safeRequire()` | `MA-core.js`, `MA-routes.js`, `MA-workspace-tools.js` | If any sub-module fails to load, the orchestrator will log a warning and keep running. |
| Route isolation | `MA-routes.js` dispatcher | If `route-pulse.js` crashes, chat/config/workspace routes should still work. |
| SSE error events | `route-chat.js`, `route-memory.js` | Stream errors will be sent as `event: error` to the browser instead of dropping the connection silently. |
| `beforeunload` guard | `ma-ui-editor.js` | Browser will warn before closing if any tab has unsaved edits. |
| Abort controller | `ma-ui-chat.js` (`send`), `ma-ui-config-ingest.js` | User will be able to cancel a long request; the server's stream gets aborted cleanly. |
| Long-request popup | `ma-ui-chat.js` | If the server takes >15s, a popup will offer to cancel or wait. |
| Port fallback | `MA-Server-standalone.js` | If 3850 is busy, will scan 3851–3860 without crashing. |
| Graceful config miss | `core-config.js` | Missing config file → copy example → prompt user via GUI. No crash. |

---

## 13. File Inventory

| Area | Planned files | Est. count |
|------|---------------|------------|
| Server entry | `MA-Server-standalone.js`, `MA-Server.js`, `MA-cli.js`, `ma-start.js` | ~4 |
| Backend orchestrators | `MA-core.js`, `MA-routes.js`, `MA-workspace-tools.js` | ~3 |
| Backend `core/` | `core-config`, `core-bootstrap`, `core-chat`, `core-tokens`, `core-context` | ~5 |
| Backend `llm/` | `llm-api`, `llm-router`, `llm-capabilities`, `llm-tool-adapter` | ~4 |
| Backend `services/` | `svc-memory`, `svc-tasks`, `svc-agents`, `svc-pulse`, `svc-worklog`, `svc-project-archive`, `svc-slash-commands` | ~7 |
| Backend `nlp/` | `nlp-bm25`, `nlp-rake`, `nlp-yake`, `nlp-markdown` | ~4 |
| Backend `infra/` | `infra-health`, `infra-http-utils`, `infra-web-fetch`, `infra-cmd-executor` | ~4 |
| Backend `tools/` | `tools-schemas`, `tools-parser`, `tools-fs`, `tools-web`, `tools-entity`, `tools-book` | ~5–6 |
| Backend `routes/` | ~13 route handlers | ~13 |
| **Backend total** | | **~45–50** |
| Frontend JS | ~19 scripts (`ma-ui-namespace.js` + `ma-ui-*.js`) | ~19 |
| Frontend CSS | `ma-ui-tokens-base.css`, `ma-ui-chat-panels.css`, `ma-ui-layout-inspector.css`, `ma-ui-workspace-editor.css`, `ma-ui-panels-modals.css` | 5 |
| Frontend HTML | `MA-index.html` | 1 |
| **Frontend total** | | **~25** |
| **Grand total (runtime est.)** | | **~68–73** |

Additional support directories: `MA-entity/` (identity, memory index, agent JSON), `MA-Config/` (runtime config, whitelist, roster), `MA-knowledge/` (reference docs), `MA-blueprints/` (task guides), `MA-workspace/` (sandboxed project files), `MA-logs/` (pulse output), `MA-scripts/` (utilities).

---

## 14. Stub Kit Cross-Reference

During the planning and build process, MA Memory Architect will use a stub kit (`mma-stubs/scripts/`) to validate the architecture before implementation. Each stub mirrors a planned frontend script:

| Planned file | Stub | Layer |
|--------------|------|-------|
| `ma-ui-dom.js` | `mma-stub-ma-ui-dom.js` | 0 |
| `ma-ui-api.js` | `mma-stub-ma-ui-api.js` | 0 |
| `ma-ui.js` | `mma-stub-ma-ui.js` | 1 |
| `ma-ui-editor.js` | `mma-stub-ma-ui-editor.js` | 1 |
| `ma-ui-bootstrap.js` | `mma-stub-ma-ui-bootstrap.js` | 1 |
| `ma-ui-editor-tabs.js` | `mma-stub-ma-ui-editor-tabs.js` | 2 |
| `ma-ui-editor-tree.js` | `mma-stub-ma-ui-editor-tree.js` | 2 |
| `ma-ui-editor-find.js` | `mma-stub-ma-ui-editor-find.js` | 2 |
| `ma-ui-editor-styled.js` | `mma-stub-ma-ui-editor-styled.js` | 2 |
| `ma-ui-nav.js` | `mma-stub-ma-ui-nav.js` | 3 |
| `ma-ui-input.js` | `mma-stub-ma-ui-input.js` | 3 |
| `ma-ui-config-settings.js` | `mma-stub-ma-ui-config-settings.js` | 4 |
| `ma-ui-config-ingest.js` | `mma-stub-ma-ui-config-ingest.js` | 4 |
| `ma-ui-workspace-session.js` | `mma-stub-ma-ui-workspace-session.js` | 5 |
| `ma-ui-workspace-projects.js` | `mma-stub-ma-ui-workspace-projects.js` | 5 |
| `ma-ui-workspace-blueprints.js` | `mma-stub-ma-ui-workspace-blueprints.js` | 5 |
| `ma-ui-workspace-todos-chores.js` | `mma-stub-ma-ui-workspace-todos-chores.js` | 5 |
| `ma-ui-chat.js` | `mma-stub-ma-ui-chat.js` | 6 |

Planned contracts: `mma-contracts/mma-chat-payload.js`, `mma-editor-tab.js`, `mma-api-envelope.js`.

Blueprints: `MA/MA-blueprints/MA-Memory-Architect/INDEX.md` + ~7 layer guides.

---

## 15. Quality Gates

### Stub kit verification (planned)

```bash
npm test          # Will run mma-tests/test-runner.js — contracts + all stub layers
npm run test:0    # Just contracts + facade stubs
npm run test:6    # Through chat layer
npm run status    # Manifest progress (implemented vs stub counts)
```

### The MA codebase (once implemented)

```bash
node -e "const h=require('./BackEnd/infra/infra-health');console.log(h.formatReport(h.scan()))"
node --check FrontEnd/js/*.js       # Syntax verify all browser scripts
```

---

## 16. Scalability & Transport Hardening

These measures support growth (more UI surface, more routes) without a build step or framework.

| Measure | Rationale |
|---------|-----------|
| **`window.MA` namespace** | Groups public entrypoints (`MA.chat.send`, `MA.config.save`, …) so `onclick` handlers and the console have one predictable root; legacy `function` globals can remain for compatibility while new code prefers `MA.*`. |
| **Split CSS** | Smaller files map to subsystems (chat vs editor vs modals), reducing merge conflicts and making “where does this rule live?” obvious. |
| **`sseStreamHeaders()`** | Centralizes `Content-Type: text/event-stream`, `Cache-Control: no-cache, no-transform`, `Connection: keep-alive`, `X-Accel-Buffering: no` so proxies (nginx) and browsers flush chunks promptly; chat and ingest routes merge CORS or other extras on top. |

---

*Architectural blueprint — estimated ~68–73 runtime files (~19 frontend JS + 5 CSS), ~30–35 API endpoints, ~10 localStorage keys, ~8 server state objects, ~8 resilience mechanisms, 0 bundler steps.*
