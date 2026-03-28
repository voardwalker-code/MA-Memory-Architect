# MA Memory Architect

Local AI workspace: browser IDE + Node server for chat (with SSE), workspace tools, memory, and configuration.

## Repository layout

| Path | Purpose |
|------|--------|
| **`MA/`** | Runtime application — run all commands from here |
| `MA/BackEnd/` | HTTP routes, core, LLM, services, tools |
| `MA/FrontEnd/` | `MA-index.html`, CSS, and `js/ma-ui-*.js` |
| `MA/MA-workspace/` | Default sandboxed project tree |
| `MA/MA-workspace/MA-Memory-Architect/` | Planning kit (stubs, contracts, `npm test`) |

## Quick start

```bash
cd MA
npm install
node MA-Server-standalone.js
```

Then open the URL printed in the terminal (port **3850**, or the next free port in range 3850–3860).

- **Headless / no browser:** `MA_NO_OPEN_BROWSER=1 node MA-Server-standalone.js` (Windows: `set MA_NO_OPEN_BROWSER=1` then run node).
- **Health:** `npm run health`
- **Guardrails + smoke:** `npm run guardrails:standalone` and `npm run smoke:standalone`

Copy `ma-config.example.json` to `MA-Config/ma-config.json` and edit if you need a fresh LLM profile.

## License

See `MA/package.json` (MIT).
