#!/usr/bin/env node
// ── MA-Server-standalone.js ─────────────────────────────────────────────────
// Canonical entrypoint for Memory Architect.
//
// This file is intentionally slim — it only handles:
//   1. Importing domain modules
//   2. Resolving a free port (replacing the old port-guard dependency)
//   3. Wiring everything together and starting the HTTP server
//
// All route handling lives in  BackEnd/MA-routes.js
// All HTTP helpers live in     BackEnd/infra/infra-http-utils.js
//
// Usage:
//   node MA-Server-standalone.js          — start with auto browser open
//   MA_NO_OPEN_BROWSER=1 node MA-Server-standalone.js  — headless mode
'use strict';

// ── Node built-ins ──────────────────────────────────────────────────────────
const http = require('http');
const path = require('path');
const net  = require('net');

// ── MA domain modules ───────────────────────────────────────────────────────
const core        = require('./BackEnd/MA-core');             // orchestration, state, chat
const llm         = require('./BackEnd/llm/llm-api');        // LLM provider interface
const pulse       = require('./BackEnd/services/svc-pulse'); // background timers (health, chores)
const modelRouter = require('./BackEnd/llm/llm-router');     // multi-model routing
const cmdExec     = require('./BackEnd/infra/infra-cmd-executor'); // whitelisted command execution
const { handleSlashCommand }    = require('./BackEnd/services/svc-slash-commands');
const { renderMarkdownToHtml }  = require('./BackEnd/nlp/nlp-markdown');
const { createRouteHandler }    = require('./BackEnd/MA-routes');

// ── Paths & constants ───────────────────────────────────────────────────────
const CLIENT_DIR    = path.join(core.MA_ROOT, 'FrontEnd');   // browser UI assets
const BLUEPRINT_DIR = path.join(core.MA_ROOT, 'MA-blueprints'); // markdown blueprints
const DEFAULT_PORT  = 3850;   // preferred port; will scan up to 3860 if busy
const PORT_RANGE_END = 3860;

// ── Port helpers ────────────────────────────────────────────────────────────
// Replaces the old port-guard service.  Probes the loopback interface to find
// an open port without any external dependency.

/**
 * Test whether `port` is available on 127.0.0.1.
 * Creates a throwaway TCP server — if it can bind, the port is free.
 */
function isPortFree(port) {
  return new Promise(resolve => {
    const srv = net.createServer();
    srv.once('error', () => resolve(false));
    srv.once('listening', () => { srv.close(); resolve(true); });
    srv.listen(port, '127.0.0.1');
  });
}

/**
 * Scan ports from `start` to `end` and return the first free one.
 * Returns 0 if every port in the range is occupied.
 */
async function findFreePort(start, end) {
  for (let p = start; p <= end; p++) {
    if (await isPortFree(p)) return p;
  }
  return 0;
}

// ── Browser launcher ────────────────────────────────────────────────────────
// Opens the server URL in the user's default browser.  Platform-specific:
//   Windows → start ""   macOS → open   Linux → xdg-open
function openBrowser(url) {
  const { exec } = require('child_process');
  const cmd = process.platform === 'win32' ? `start "" "${url}"`
            : process.platform === 'darwin' ? `open "${url}"`
            : `xdg-open "${url}"`;
  exec(cmd, () => {});  // fire-and-forget; errors are harmless
}

// ── Server start ────────────────────────────────────────────────────────────
async function start() {
  // 1. Boot core — loads config, memory, entity, worklog, project archive
  core.boot();

  // 2. Initialise model router — give it an LLM caller so it can research models
  modelRouter.init({
    callLLM: (msgs, opts) => llm.callLLM(core.getConfig(), msgs, opts)
  });
  console.log('  Model router ready (' + modelRouter.listModels().length + ' models in roster)');

  // 3. Start pulse engine — background health scans & chore timers
  pulse.init({ core, callLLM: llm.callLLM, agentCatalog: core.agentCatalog, health: core.health });
  pulse.startAll();
  console.log('  Pulse engine started');

  // 4. Build the route handler (all HTTP endpoints live in MA-routes.js)
  const handleRequest = createRouteHandler({
    core, llm, pulse, modelRouter, cmdExec,
    handleSlashCommand, renderMarkdownToHtml,
    BLUEPRINT_DIR, CLIENT_DIR
  });

  // 5. Find a free port — try the default first, then scan the range
  let port = DEFAULT_PORT;
  if (!(await isPortFree(port))) {
    console.log(`  \u26A0 Port ${port} in use, scanning ${DEFAULT_PORT}\u2013${PORT_RANGE_END}...`);
    port = await findFreePort(DEFAULT_PORT, PORT_RANGE_END);
  }
  if (port === 0) {
    console.error(`  \u2716 No free port found in range ${DEFAULT_PORT}\u2013${PORT_RANGE_END}. Exiting.`);
    process.exit(1);
  }

  // 6. Create and listen
  const server = http.createServer(handleRequest);
  server.listen(port, '127.0.0.1', () => {
    const url = `http://127.0.0.1:${port}`;
    console.log(`\n  \u2713 Running at ${url}`);
    console.log(`  \u2713 Workspace: ${core.WORKSPACE_DIR}`);
    if (!core.isConfigured()) console.log('  \u26A0 No LLM configured \u2014 the GUI will open for setup');

    // Auto-open browser unless suppressed by env var
    if (!process.env.MA_NO_OPEN_BROWSER) {
      console.log('\n  Opening browser...\n');
      openBrowser(url);
    } else {
      console.log('\n  (browser open suppressed)\n');
    }
  });
}

// ── Entry point ─────────────────────────────────────────────────────────────
start().catch(e => { console.error('Fatal:', e); process.exit(1); });
