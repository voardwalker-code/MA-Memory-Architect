# MA Memory Architect — workspace planning kit

This folder is **not** the runtime MA app. It holds **reverse-engineered architecture** and **Node stubs** that mirror the real browser scripts under `MA/FrontEnd/js/`.

| Path | Purpose |
|------|---------|
| `REQUIREMENTS.md` | Vision, features, tech, data, interfaces (reverse engineered from the repo) |
| `LAYER-ANALYSIS.md` | Domains, layers, dependencies |
| `BUILD-ORDER.md` | Pillars, layer map, build rules (from `architect.md` blueprint) |
| `PROJECT-MANIFEST.json` | Module tracker (`stub` → `implemented`) |
| `mma-contracts/` | Small data-shape helpers for tests |
| `mma-stubs/scripts/` | One stub file per `ma-ui-*.js` (stub-first guide) |
| `mma-tests/` | Layer test runner + contract/stub smoke tests |
| `mma-scripts/` | `project-status.js` |

Blueprints for layered implementation live in **`MA/MA-blueprints/MA-Memory-Architect/`** (per architect blueprint: not inside this workspace folder).

Run from this directory:

```bash
npm test
npm run status
```
