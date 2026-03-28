# mma-stubs

Node **spec stubs** for each `MA/FrontEnd/js/ma-ui-*.js` script.

- Not loaded by the real MA server.
- Use `mmaStubPing()` + `npm test` to verify the kit loads.
- Replace `throw new Error('NOT_IMPLEMENTED: …')` only if you are building a Node harness (e.g. jsdom); production UI stays in `FrontEnd/js/`.
