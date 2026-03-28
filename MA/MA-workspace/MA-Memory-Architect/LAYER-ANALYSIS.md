# Layer analysis — MA Memory Architect (reverse engineered)

## Namespace prefix

**`mma-`** — all generated workspace artifacts use `mma-contracts`, `mma-stubs`, `mma-tests`, `mma-scripts` (no generic `contracts/` or `server/` at workspace root).

## Data domains → contract files

| Domain | Contract file | Notes |
|--------|---------------|-------|
| Chat transport payload | `mma-contracts/mma-chat-payload.js` | Outgoing chat body shape (minimal) |
| Editor tab record | `mma-contracts/mma-editor-tab.js` | Tab object shared across editor modules |
| API error envelope | `mma-contracts/mma-api-envelope.js` | `{ ok, error }` style helpers |

## Capability layers (for BUILD-ORDER)

| Layer | Name | Maps to |
|-------|------|---------|
| 0 | Contracts & facades | `mma-contracts`, conceptual `mma-stub-ma-ui-dom`, `mma-stub-ma-ui-api` |
| 1 | Shell state & boot | `mma-stub-ma-ui`, `mma-stub-ma-ui-bootstrap`, `mma-stub-ma-ui-editor` |
| 2 | Editor workbench | tabs, tree, find, styled |
| 3 | Navigation & transport UX | nav, input |
| 4 | Settings & memory ingest | config-settings, config-ingest |
| 5 | Workspace panes | session, projects, blueprints, todos-chores |
| 6 | Conversation core | chat (depends on lower layers conceptually) |

## Dependency rules

- Layers 0–1 have no dependency on chat.
- Editor modules (2) assume shell globals (`openTabs`, `activeTabId`, DOM hooks).
- Chat (6) assumes API + DOM + editor hooks for file links / openFileInEditor.

## Real repo mapping

| Stub | Real file |
|------|-----------|
| `mma-stub-ma-ui-*.js` | `MA/FrontEnd/js/ma-ui-*.js` |

Backend `BackEnd/**` is **not** duplicated as stubs in this kit; this workspace focuses on **documenting and stub-modelling the FrontEnd script surface** for alignment with stub-first development.
