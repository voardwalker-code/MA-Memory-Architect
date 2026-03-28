# Layer 0: Contracts & facades — Build Blueprint

## Prerequisites

- `MA-workspace/MA-Memory-Architect/REQUIREMENTS.md` exists and is non-TBD.

## Scope

| File | Purpose |
|------|---------|
| `mma-contracts/mma-chat-payload.js` | Validate outgoing chat JSON |
| `mma-contracts/mma-editor-tab.js` | Validate tab objects |
| `mma-contracts/mma-api-envelope.js` | `{ ok, error? }` helpers |
| `mma-stubs/scripts/mma-stub-ma-ui-dom.js` | Spec for `escHtml` / `escAttr` |
| `mma-stubs/scripts/mma-stub-ma-ui-api.js` | Spec for `apiPostJson` |

## Module: mma-chat-payload

### Exports

- `createChatPayload(fields)` → object with defaults
- `validateChatPayload(obj)` → `{ valid, errors }`

### Algorithm: validateChatPayload

1. Reject non-objects.
2. `message` must be string, length ≤ `LIMITS.MAX_MESSAGE_CHARS` (500000).
3. `history` must be array, length ≤ `MAX_HISTORY_MESSAGES` (50).
4. `autoPilot` must be boolean.
5. Return aggregated errors.

## Module: mma-stub-ma-ui-dom (maps to `ma-ui-dom.js`)

### Exports

- `escHtml(text)` → safe HTML string
- `escAttr(text)` → safe single-quoted attribute fragment

### Algorithm: escHtml

1. Treat `null`/`undefined` as empty string.
2. Use DOM `textContent` assignment to a detached element, read `innerHTML` — **in browser**; Node stub documents the contract only.

## Done when

`npm run test:0` passes with 0 failures.

## Manifest

Keep contract files `status: implemented`; stubs stay `stub` until intentionally filled for Node harness testing.
