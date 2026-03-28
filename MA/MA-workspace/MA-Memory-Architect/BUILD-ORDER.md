# MA Memory Architect — Build Order (planning / stub kit)

## Vision

MA Memory Architect is a local AI workspace: a browser UI talks to a Node server for chat (including SSE progress), workspace file operations, memory ingest, configuration, and auxiliary panes (session, projects, blueprints, todos/chores). This document orders **conceptual implementation** for the **FrontEnd script modules** as represented by `mma-stubs/scripts/`.

## Core pillars

1. **Safe strings** — Escape user/server text before HTML and inline handlers.
2. **Consistent HTTP** — One JSON POST shape for mutating APIs.
3. **Shared shell state** — Single global “coat rack” for DOM refs, tabs, history, theme.
4. **Editor workbench** — Tabs, tree, find, styled editing, unload guard.
5. **Feature rails** — Nav, chat, composer, settings, ingest, workspace panes.
6. **Boot** — Last script starts initialization after all globals exist.

## Layer map

| Layer | Name | Stub modules (representative) | Depends on |
|-------|------|------------------------------|------------|
| 0 | Contracts & HTTP/DOM facades | `mma-contracts/*`, `mma-stub-ma-ui-dom`, `mma-stub-ma-ui-api` | — |
| 1 | Shell & editor globals | `mma-stub-ma-ui`, `mma-stub-ma-ui-editor`, `mma-stub-ma-ui-bootstrap` | 0 |
| 2 | Editor surface | `mma-stub-ma-ui-editor-tabs`, `-tree`, `-find`, `-styled` | 1 |
| 3 | Nav & composer | `mma-stub-ma-ui-nav`, `mma-stub-ma-ui-input` | 0–1 |
| 4 | Config & ingest | `mma-stub-ma-ui-config-settings`, `mma-stub-ma-ui-config-ingest` | 0–1 |
| 5 | Workspace panes | `mma-stub-ma-ui-workspace-*` | 1–2 |
| 6 | Chat core | `mma-stub-ma-ui-chat` | 0–5 (conceptual) |

### Layer 0: Contracts & facades

Provides validators/factories for a few cross-cutting shapes and stubs for `escHtml`, `escAttr`, `apiPostJson`. Tests prove contracts and NOT_IMPLEMENTED stubs behave as expected.

### Layer 1: Shell

`initializeMAUI`, shared arrays (`openTabs`, `history`), `beforeunload` dirty check.

### Layer 2: Editor

Open/save tabs, tree refresh, find panel, markdown/highlight pipeline.

### Layer 3–5

Menus, folder browser, terminal, message box superpowers, settings, ingest, session/projects/blueprints/todos/chores.

### Layer 6: Chat

`send`, `handleChatResult`, sessions — highest integration.

## Build rules

1. Layer **N** tests must pass before treating layer **N+1** as “greenfield implemented” (for this kit: stubs + contract tests).
2. Every stub lists algorithm comments; implementation replaces `NOT_IMPLEMENTED` without deleting comments.
3. Do not rename `mma-*` folders to generic names.
4. Prefer keeping real `MA/FrontEnd/js/` under ~300 lines per file where practical (already split for editor/workspace/config).

## Next step

Open `MA/MA-blueprints/MA-Memory-Architect/INDEX.md` and run `npm test` in this folder.
