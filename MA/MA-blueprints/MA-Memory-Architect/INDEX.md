# MA Memory Architect — Build Blueprint Index

Blueprints for the **planning / stub kit** under `MA-workspace/MA-Memory-Architect/`. They describe how to implement or validate the **FrontEnd script surface** (mirrored by `mma-stubs/scripts/`).

Real production code lives in `MA/FrontEnd/js/`. This index does **not** replace those files — it guides incremental hardening, tests, or future extraction to modules.

## Build order

| Blueprint | Layer | What | Pre-requisite |
|-----------|-------|------|---------------|
| `layer-0-contracts.md` | 0 | Contracts + DOM/API facade stubs | `npm run test:0` passes |
| `layer-1-shell.md` | 1 | Shared UI state, editor globals, bootstrap | Layer 0 green |
| `layer-2-editor.md` | 2 | Tabs, tree, find, styled | Layer 1 green |
| `layer-3-nav-input.md` | 3 | Menus, folder browser, composer | Layers 0–1 green |
| `layer-4-config-ingest.md` | 4 | Settings + memory ingest | Layers 0–1 green |
| `layer-5-workspace-panes.md` | 5 | Session, projects, blueprints, todos/chores | Layers 1–2 green |
| `layer-6-chat.md` | 6 | Chat send/receive, sessions | Layers 0–3 green |

## How to use

1. Open `MA-workspace/MA-Memory-Architect/`.
2. Run `npm test` (or `npm run test:N` for a single layer).
3. Open the matching `layer-N-*.md` and execute its checklist against the **real** `ma-ui-*.js` file (or implement the Node stub if using stubs as a spec-only harness).

## Rules

- Do not skip layers for the stub kit’s test discipline.
- Prefer updating `REQUIREMENTS.md` / `BUILD-ORDER.md` when behaviour changes, then refresh stubs.
- Backend `BackEnd/**` changes belong in MA’s own refactor plans; link them from `LAYER-ANALYSIS.md` when relevant.
