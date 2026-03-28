# MA — Memory Architect (runtime)

All npm scripts assume the **current working directory is this folder** (`MA/`).

## Commands

| Script | What it does |
|--------|----------------|
| `npm start` | `node MA-Server-standalone.js` (opens browser unless `MA_NO_OPEN_BROWSER` is set) |
| `npm run start:bg` | Background server via `ma-start.js` |
| `npm run status` / `npm run stop` | PID file in `MA-logs/` |
| `npm run cli` | Terminal chat (`MA-cli.js`) |
| `npm run health` | Filesystem + syntax health scan |
| `npm run guardrails:standalone` | Health + checks for suspicious `require('../../../…')` |
| `npm run smoke:standalone` | Short-lived server + `/api/health` check |

## Layout (abbreviated)

```
MA/
├── MA-Server-standalone.js   # Canonical server entry
├── MA-Server.js              # Shim → standalone
├── MA-cli.js
├── ma-start.js
├── package.json
├── FrontEnd/                 # Browser UI
├── BackEnd/                  # Server modules
├── MA-Config/                # Runtime config (gitignored secrets — use ma-config.example.json)
├── MA-workspace/             # Sandboxed files
├── MA-entity/                # Identity + memory index
├── MA-knowledge/             # Reference docs
├── MA-blueprints/            # Task guides
├── MA-scripts/               # Utilities (agent defs, guardrails, smoke)
└── USER-GUIDE.md
```

Architecture notes for the planning kit live under `MA-workspace/MA-Memory-Architect/` (separate `package.json` there for stub tests).
