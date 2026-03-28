# Layer 1: Shell & editor globals

## Prerequisites

Layer 0 tests pass.

## Scope

- `mma-stub-ma-ui.js` → `ma-ui.js` (`initializeMAUI`, shared arrays, theme)
- `mma-stub-ma-ui-editor.js` → `ma-ui-editor.js` (fold/find globals, `beforeunload`)
- `mma-stub-ma-ui-bootstrap.js` → `ma-ui-bootstrap.js` (late boot, URL deep link)

## Done when

`npm run test:1` passes.
