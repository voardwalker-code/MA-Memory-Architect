# Layer 6: Chat — Build Blueprint

## Prerequisites

- `npm run test:5` passes.

## Scope

| Real file | Stub |
|-----------|------|
| `MA/FrontEnd/js/ma-ui-chat.js` | `mma-stubs/scripts/mma-stub-ma-ui-chat.js` |

## Exports (target surface)

- `send()` — build payload, POST stream, parse SSE, `handleChatResult`
- `handleChatResult(d)` — bubble UI, files changed, continuation, `saveSession`
- `addMsg`, `addSystem`, session list helpers — as needed by HTML

## Algorithm: send (pseudocode)

1. Guard: empty message + no attachments → return; if `sending` → return.
2. Build `displayText` for user bubble; `addMsg('user', …)`; append image thumbnails if any.
3. Clear input; push `{ role: 'user', content: msgText }` to `history`.
4. `JSON.stringify` payload: `message`, last 10 `history`, `attachments`, `autoPilot`.
5. `apiPostJson('/api/chat/stream', payload, { signal })`.
6. If `!r.ok`: fallback `apiPostJson('/api/chat', payload)`; `handleChatResult` or show error.
7. Else: read SSE body line-by-line; on `step` events build progress widget; on `done` call `handleChatResult`; on `error` show system message.
8. Clear timers; re-enable send; focus input.

## Algorithm: handleChatResult (pseudocode)

1. `addMsg('ma', reply)`; push assistant turn to `history`.
2. Optional thinking `<details>`; self-review badge; file change rows with Keep/Reject.
3. Token bar; continuation button; book selection UI heuristic.
4. `loadWorklog()`; refresh projects if needed; `saveSession()`.

## Done when

`npm run test:6` passes and manual chat smoke works in the real app.
