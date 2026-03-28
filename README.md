# MA Memory Architect

Local AI workspace: browser IDE + Node server for chat (with SSE), workspace tools, memory, and configuration.

**Upstream:** [github.com/voardwalker-code/MA-Memory-Architect](https://github.com/voardwalker-code/MA-Memory-Architect)

## Repository layout

| Path | Purpose |
|------|--------|
| **`MA/`** | Runtime application — run all commands from here |
| `MA/BackEnd/` | HTTP routes, core, LLM, services, tools |
| `MA/FrontEnd/` | `MA-index.html`, CSS, and `js/ma-ui-*.js` |
| `MA/MA-workspace/` | Sandboxed projects (**not** committed — see `.gitignore`) |
| `MA/MA-workspace/MA-Memory-Architect/` | Planning kit only — **is** committed (stubs, contracts, `npm test`) |

## What stays local (not in Git)

`.gitignore` excludes: `node_modules`, API keys (`MA-Config/ma-config.json`), GUI chat exports (`MA-Config/chat-sessions/`), pulse/server logs (`MA-logs/`), sandbox tree under `MA-workspace/` except the planning kit folder, and runtime entity data (memories, indexes, archives, agent `prompt-history/`).

## Push to GitHub (when ready)

```bash
cd MA-Memory-Architect
git remote add origin https://github.com/voardwalker-code/MA-Memory-Architect.git
git branch -M main
git push -u origin main
```

If `origin` already exists, use `git remote set-url origin …` instead. For a **first push** that replaces the old flat layout on GitHub, coordinate with any existing default branch and history (force-push only if you intend to overwrite the remote).

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
