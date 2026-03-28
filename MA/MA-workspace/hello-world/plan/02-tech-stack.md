# Tech Stack Documentation

> **Step 5 of 24** — Document the current tech stack (framework, styling, state management)

---

## Runtime & Language

| Layer        | Technology       | Version Requirement | Notes                                      |
|--------------|------------------|---------------------|--------------------------------------------|
| **Runtime**  | Node.js          | ≥ 12 (enforced)     | `validator.js` checks `MIN_NODE_VERSION=12` at startup |
| **Language** | JavaScript (ES6) | CommonJS modules    | `'use strict'` in every file; `require()`/`module.exports` throughout |
| **Module System** | CommonJS    | —                   | No ESM (`import`/`export`); all files use `require()` |

---

## Framework

| Category   | Choice          | Notes                                                  |
|------------|-----------------|--------------------------------------------------------|
| **Framework** | **None** (vanilla Node.js) | No Express, no Fastify, no CLI framework. Pure `require()` + stdlib. |
| **Architecture** | Custom pipeline pattern | 8-stage linear pipeline passing a `PipelineState` object between stages. Defined in `ARCHITECTURE.md`. |

---

## Standard Library Dependencies

These are the **only** imports across all 5 existing source files — all from Node.js built-ins:

| Module     | Used In          | Purpose                                         |
|------------|------------------|-------------------------------------------------|
| `fs`       | `config.js`      | Read optional `hello-world.config.json` from disk |
| `path`     | `config.js`      | Resolve config file path relative to `__dirname` |
| `crypto`   | `validator.js`   | SHA-256 hashing for message integrity stamp      |

**Zero external (npm) dependencies.** No `package.json` exists. No `node_modules/`.

---

## State Management

| Concept            | Implementation                                                         |
|--------------------|------------------------------------------------------------------------|
| **State object**   | `PipelineState` — a plain JS object created by `contracts.createPipelineState(config)` |
| **Immutability pattern** | Each pipeline stage returns a **new** object via `Object.assign({}, state, updates)` — the previous state is not mutated |
| **State shape**    | `{ raw, encoded, processed, decoded, formatted, output, config, log, status, error, startTime }` |
| **Log accumulation** | Each stage appends a `LogEntry` to `state.log` via `concat()` (immutable array growth) |
| **No external state lib** | No Redux, no MobX, no EventEmitter. Pure functional-style pass-and-return. |

---

## Configuration System

| Layer (priority ↑) | Source                         | Implementation                    |
|---------------------|--------------------------------|-----------------------------------|
| 1. Defaults         | `contracts.DEFAULT_CONFIG`     | Hardcoded fallback values         |
| 2. Encrypted const  | `config.ENCRYPTED_MESSAGE`     | XOR-obfuscated + reversed + Base64 "Hello, World!" |
| 3. Config file      | `hello-world.config.json`      | Optional JSON file on disk (not yet created) |
| 4. Environment vars | `process.env.HW_*`            | 7 mapped env vars via `ENVIRONMENT_MAP` |
| 5. Runtime overrides| `loadConfig(overrides)`        | Direct argument to `loadConfig()` |

**Feature flags** are a sub-object (`config.features`) with 6 boolean toggles, merged via `loadFeatureFlags()`.

---

## Styling / Formatting

| Category   | Choice            | Notes                                                    |
|------------|-------------------|----------------------------------------------------------|
| **Output formatting** | Planned in `formatter.js` (not yet built) | Will support: `uppercase`, `bordered`, `banner`, `plain` |
| **ANSI colours** | Planned via `enableColour` feature flag | No colour library — will be hand-rolled ANSI escape codes |
| **No CSS / HTML** | N/A | This is a CLI/Node.js project — no browser, no DOM, no stylesheets |

---

## Testing

| Category       | Choice                          | Notes                                             |
|----------------|---------------------------------|---------------------------------------------------|
| **Test runner** | Custom minimal harness          | `test(name, fn)` / `assert()` / `assertThrows()` defined inline in each test file |
| **Test framework** | **None** (no Jest, Mocha, etc.) | Zero test dependencies                           |
| **Coverage**   | Not configured                  | No `nyc`, `c8`, or built-in coverage tooling      |
| **Existing tests** | `tests/test-validator.js` only | 42 test cases covering all `validator.js` exports  |
| **Planned tests** | 10 test files per `ARCHITECTURE.md` | One per module + integration + runner            |

---

## Encoding / Crypto

| Algorithm  | Used In          | Purpose                                              |
|------------|------------------|------------------------------------------------------|
| **Base64** | `encoder.js`, `config.js` | Transport encoding (encoder) + message obfuscation (config) |
| **Hex**    | `encoder.js`     | Alternative transport encoding                        |
| **ROT13**  | `encoder.js`     | Caesar cipher encoding (letters only)                 |
| **Reverse**| `encoder.js`     | String reversal as trivial "encoding"                 |
| **XOR**    | `config.js`      | Single-byte XOR obfuscation of the stored message constant (key: `0x42`) |
| **SHA-256**| `validator.js`   | Message integrity hash via `crypto.createHash('sha256')` |
| **CRC-style checksum** | `processor.js` | Sum of char codes mod 65536 — basic integrity check |

---

## Code Conventions

| Convention         | Detail                                                        |
|--------------------|---------------------------------------------------------------|
| **Strict mode**    | `'use strict'` at top of every file                           |
| **Error format**   | `'moduleName.functionName: reason'` — consistent throw pattern |
| **Comments**       | Extensive block comments with "HOW IT WORKS" explanations + inline algorithm steps |
| **Exports**        | Single `module.exports = { ... }` at bottom of each file     |
| **Validation**     | Every function validates its inputs before processing — fail-fast |
| **No classes**     | All modules export plain functions — no OOP, no `class`, no `new` |
| **No async**       | Everything is synchronous — no Promises, no callbacks, no `async/await` |

---

## Summary: What's Present vs. What's Absent

### ✅ Present
- Node.js runtime (vanilla, no framework)
- CommonJS module system
- Custom pipeline state management (immutable pass-through)
- 3 Node.js stdlib imports (`fs`, `path`, `crypto`)
- Custom test harness (no framework)
- 4 encoding algorithms + XOR obfuscation + SHA-256 hashing
- Layered configuration system with feature flags
- Extensive inline documentation

### ❌ Absent (by design)
- No `package.json` / no npm dependencies
- No web framework (Express, Fastify, Hapi)
- No test framework (Jest, Mocha, Vitest)
- No build tools (Webpack, esbuild, tsc)
- No TypeScript
- No linter config (ESLint, Prettier)
- No CI/CD configuration
- No Docker / containerization
- No browser / DOM / CSS / HTML
- No async patterns (Promises, streams, callbacks)
- No class-based OOP
