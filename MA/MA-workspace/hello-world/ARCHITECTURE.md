# Hello World — Over-Engineered Architecture

> An absurdly over-engineered pipeline that takes the string "Hello, World!"
> through 8 separate processing stages across 10 files, because we can.

---

## Pipeline Overview

```
┌──────────────────────────────────────────────────────────────────────────┐
│                        HELLO WORLD PIPELINE                             │
│                                                                         │
│  ┌─────────┐   ┌───────────┐   ┌─────────┐   ┌───────────┐            │
│  │ Config  │──▶│ Validator │──▶│ Encoder │──▶│ Processor │            │
│  └─────────┘   └───────────┘   └─────────┘   └───────────┘            │
│       │                                             │                   │
│       │                                             ▼                   │
│       │         ┌──────────┐   ┌───────────┐   ┌─────────┐            │
│       │         │  Output  │◀──│ Formatter │◀──│ Decoder │            │
│       │         │  Handler │   └───────────┘   └─────────┘            │
│       │         └──────────┘                                           │
│       │              │                                                  │
│       │              ▼                                                  │
│       │         ┌──────────┐                                           │
│       └────────▶│  Logger  │                                           │
│                 └──────────┘                                           │
└──────────────────────────────────────────────────────────────────────────┘
```

---

## Module Responsibilities

| # | Module | File | Responsibility |
|---|--------|------|----------------|
| 0 | Contracts | `src/contracts.js` | Shared constants, shapes, and factory functions used by every module |
| 1 | Config | `src/config.js` | Loads and validates pipeline configuration (message text, encoding type, formatting options) |
| 2 | Validator | `src/validator.js` | Validates that the config payload is sane — correct types, non-empty message, supported encoding |
| 3 | Encoder | `src/encoder.js` | Encodes the plain-text message into a transport format (Base64, hex, ROT13, or reverse) |
| 4 | Processor | `src/processor.js` | Applies transformations to the encoded payload — checksum, timestamp, metadata wrapping |
| 5 | Decoder | `src/decoder.js` | Decodes the transport format back into plain text |
| 6 | Formatter | `src/formatter.js` | Formats the decoded message for display — uppercase, bordered, padded, etc. |
| 7 | Output Handler | `src/output-handler.js` | Delivers the formatted message to its destination(s) — console, file, or return string |
| 8 | Logger | `src/logger.js` | Records every pipeline step with timestamps, durations, and status for auditability |
| — | Orchestrator | `main.js` | Wires all modules together, runs the pipeline in order, handles top-level errors |

---

## Data Flow

Each stage receives a **PipelineState** object and returns an updated copy:

```
PipelineState {
  raw         : string       — the original message (never mutated)
  encoded     : string|null  — after Encoder
  processed   : object|null  — after Processor (wrapped with metadata)
  decoded     : string|null  — after Decoder
  formatted   : string|null  — after Formatter
  output      : string|null  — after OutputHandler
  config      : object       — the validated config
  log         : array        — array of LogEntry objects (appended by Logger)
  status      : string       — 'pending' | 'running' | 'success' | 'error'
  error       : string|null  — error message if status === 'error'
  startTime   : number       — Date.now() when pipeline began
}
```

---

## Contracts (src/contracts.js)

Shared constants every module imports:

| Constant | Value | Purpose |
|----------|-------|---------|
| `SUPPORTED_ENCODINGS` | `['base64', 'hex', 'rot13', 'reverse']` | Valid encoding types |
| `SUPPORTED_FORMATS` | `['uppercase', 'bordered', 'banner', 'plain']` | Valid display formats |
| `SUPPORTED_OUTPUTS` | `['console', 'file', 'return']` | Valid output destinations |
| `PIPELINE_STAGES` | `['config','validate','encode','process','decode','format','output']` | Stage names in order |
| `MAX_MESSAGE_LENGTH` | `1000` | Sanity cap on input message |
| `DEFAULT_CONFIG` | `{...}` | Fallback configuration object |

Factory functions:

| Function | Returns | Purpose |
|----------|---------|---------|
| `createPipelineState(config)` | PipelineState | Creates a fresh state object |
| `createLogEntry(stage, status, detail)` | LogEntry | Creates a structured log entry |

Validation helpers:

| Function | Returns | Purpose |
|----------|---------|---------|
| `isValidEncoding(enc)` | boolean | Checks encoding against allowed list |
| `isValidFormat(fmt)` | boolean | Checks format against allowed list |
| `isValidOutput(out)` | boolean | Checks output against allowed list |

---

## File Structure

```
hello-world/
├── ARCHITECTURE.md          ← this file
├── main.js                  ← orchestrator — runs the pipeline
├── src/
│   ├── contracts.js         ← shared constants, shapes, factories
│   ├── config.js            ← step 1: load config
│   ├── validator.js         ← step 2: validate config
│   ├── encoder.js           ← step 3: encode message
│   ├── processor.js         ← step 4: add metadata/checksum
│   ├── decoder.js           ← step 5: decode message
│   ├── formatter.js         ← step 6: format for display
│   ├── output-handler.js    ← step 7: deliver message
│   └── logger.js            ← step 8: log each pipeline step
├── tests/
│   ├── test-contracts.js    ← contract factory and validator tests
│   ├── test-config.js       ← config module tests
│   ├── test-validator.js    ← validator module tests
│   ├── test-encoder.js      ← encoder module tests
│   ├── test-processor.js    ← processor module tests
│   ├── test-decoder.js      ← decoder module tests
│   ├── test-formatter.js    ← formatter module tests
│   ├── test-output.js       ← output handler tests
│   ├── test-logger.js       ← logger module tests
│   ├── test-integration.js  ← full pipeline end-to-end test
│   └── run-all.js           ← test runner — runs every test file
└── README.md                ← usage instructions
```

---

## Error Strategy

- Every module function validates its inputs against contracts
- Errors throw with the pattern: `'moduleName.functionName: reason'`
- The orchestrator catches errors and writes them to `state.error` + `state.status`
- The Logger records errors the same as successes — every step gets a log entry
- The pipeline halts on first error (fail-fast) unless config says otherwise

---

## How to Run

```bash
# Run the pipeline (prints "Hello, World!" after 8 stages of processing)
node hello-world/main.js

# Run all tests
node hello-world/tests/run-all.js

# Run a single test
node hello-world/tests/test-encoder.js
```

---

## Design Decisions

1. **Why 8 stages for "Hello, World!"?**
   That's the point. The brief says "over-engineered." Every stage is deliberately
   separate to demonstrate modular architecture, clean contracts, and proper
   error handling — even when the payload is trivially simple.

2. **Why contracts.js?**
   Every module needs to agree on what encodings, formats, and shapes are valid.
   Centralizing this prevents magic strings and keeps validation consistent.

3. **Why a PipelineState object?**
   Each stage reads from and writes to a single state object. This makes the
   data flow visible, debuggable, and loggable. No hidden side effects.

4. **Why Base64/hex/ROT13?**
   Because encoding a 13-character string into Base64, checksumming it,
   then decoding it back is the epitome of unnecessary complexity.
   That's the joke. That's the feature.
