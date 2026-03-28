// ── MA Route Dispatcher ──────────────────────────────────────────────────────
//
// This is the central router for the MA standalone server.
//
// HOW IT WORKS:
// Instead of having ALL the route logic crammed into one giant file,
// we split it into small "route modules" — each one lives in the
// ./routes/ folder and handles a specific area (chat, config, memory, etc.).
//
// This file's job is simple:
//   1. Load each route module file from ./routes/
//   2. Initialize each module by passing it the services it needs (deps)
//   3. When a request comes in, ask each module "is this yours?" in order
//   4. The first module that says "yes" (returns true) handles it
//   5. If nobody claims the request, return 404
//
// RESILIENCE:
// If a route module file is missing, has a syntax error, or crashes during
// setup, the server still starts!  It just logs a warning and skips that
// module.  One broken feature won't take down the whole server.
//
// ── Route modules (loaded in this order) ────────────────────────────────────
//   route-chat       — Chat streaming + sessions         (groups 1, 2)
//   route-config     — Mode toggle + LLM config          (groups 3, 4)
//   route-ollama     — Ollama model management            (group 5)
//   route-system     — Entity identity + Health scan      (groups 6, 7)
//   route-pulse      — Pulse timers + Chores              (groups 8, 9)
//   route-models     — Model roster + routing             (group 10)
//   route-worklog    — Session work state                 (group 11)
//   route-projects   — Project archive                    (group 12)
//   route-blueprints — Blueprint CRUD                     (group 13)
//   route-commands   — Slash commands + Whitelist          (groups 14, 15)
//   route-memory     — Memory search/store/ingest         (group 16)
//   route-workspace  — File system + Terminal             (groups 17, 18)
//   route-static     — User guide + Static files (LAST!)  (groups 19, 20)
//
// ── Exports ─────────────────────────────────────────────────────────────────
//   createRouteHandler(deps) → async function handleRequest(req, res)
// ─────────────────────────────────────────────────────────────────────────────
'use strict';

const { json } = require('./infra/infra-http-utils');

// ─────────────────────────────────────────────────────────────────────────────
// safeRequire(modulePath, label)
//
// Like require(), but if the module is missing or broken it returns null
// instead of crashing.  This is the key to our resilience — if someone
// accidentally breaks route-memory.js, the server still starts and all
// the OTHER routes still work.
//
//   modulePath — the path to require (e.g. './routes/route-chat')
//   label      — a friendly name for log messages (e.g. 'chat')
// ─────────────────────────────────────────────────────────────────────────────
function safeRequire(modulePath, label) {
  try {
    return require(modulePath);
  } catch (err) {
    console.warn(`[MA-routes] ⚠ Could not load route module "${label}": ${err.message}`);
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// ROUTE_MODULES
//
// The master list of route modules to load, in order.
// Each entry has:
//   label   — friendly name (used in log messages)
//   path    — the require() path to the module file
//
// ORDER MATTERS!  The static/catch-all module MUST be last, because it
// tries to match ANY URL.  If it were first, it would swallow API requests.
// ─────────────────────────────────────────────────────────────────────────────
const ROUTE_MODULES = [
  { label: 'chat',       path: './routes/route-chat' },
  { label: 'config',     path: './routes/route-config' },
  { label: 'ollama',     path: './routes/route-ollama' },
  { label: 'system',     path: './routes/route-system' },
  { label: 'pulse',      path: './routes/route-pulse' },
  { label: 'models',     path: './routes/route-models' },
  { label: 'worklog',    path: './routes/route-worklog' },
  { label: 'projects',   path: './routes/route-projects' },
  { label: 'blueprints', path: './routes/route-blueprints' },
  { label: 'commands',   path: './routes/route-commands' },
  { label: 'memory',     path: './routes/route-memory' },
  { label: 'workspace',  path: './routes/route-workspace' },
  { label: 'static',     path: './routes/route-static' }       // ← MUST be last
];

// ─────────────────────────────────────────────────────────────────────────────
// createRouteHandler(deps) → async function handleRequest(req, res)
//
// This is the main function that MA-Server-standalone.js calls.
// It receives all the services (deps) and returns the request handler
// that gets passed to http.createServer().
//
// deps = {
//   core,                — MA-core (boot, handleChat, getConfig, etc.)
//   llm,                 — MA-llm  (callLLM, ollamaListModels, …)
//   pulse,               — MA-pulse (timers, chores)
//   modelRouter,         — MA-model-router (roster, routing, perf)
//   cmdExec,             — MA-cmd-executor (whitelist, exec)
//   handleSlashCommand,  — from MA-slash-commands
//   renderMarkdownToHtml,— from MA-markdown
//   BLUEPRINT_DIR,       — absolute path to blueprints folder
//   CLIENT_DIR           — absolute path to browser client folder
// }
// ─────────────────────────────────────────────────────────────────────────────
function createRouteHandler(deps) {

  // ── Step 1: Load and initialize all route modules ─────────────────
  // For each module in ROUTE_MODULES:
  //   1. Try to require() it (safeRequire handles errors)
  //   2. Call the factory function with deps to get a handler
  //   3. If anything goes wrong, log a warning and skip it
  const handlers = [];

  for (const { label, path: modPath } of ROUTE_MODULES) {
    const factory = safeRequire(modPath, label);
    if (!factory) continue;   // Module file is missing or broken — skip

    try {
      const handler = factory(deps);
      if (typeof handler === 'function') {
        handlers.push({ label, handler });
      } else {
        console.warn(`[MA-routes] ⚠ Module "${label}" did not return a handler function — skipping`);
      }
    } catch (err) {
      console.warn(`[MA-routes] ⚠ Module "${label}" crashed during init: ${err.message}`);
    }
  }

  console.log(`[MA-routes] ✓ Loaded ${handlers.length}/${ROUTE_MODULES.length} route modules`);

  // ── Step 2: Return the request handler ────────────────────────────
  // This function is called for EVERY incoming HTTP request.
  // It sets up CORS, then asks each module to try handling the request.
  return async function handleRequest(req, res) {
    const url    = new URL(req.url, `http://${req.headers.host}`);
    const method = req.method;

    // ── CORS headers ─────────────────────────────────────────────
    // Allow the browser client to talk to the server from any origin.
    // This is needed because the client might be on a different port.
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    // OPTIONS requests are CORS "preflight" checks — just say OK
    if (method === 'OPTIONS') { res.writeHead(204); return res.end(); }

    try {
      // ── Try each module in order ───────────────────────────────
      // The first module that returns true "claims" the request.
      // If a module throws, we catch it and return a 500 error
      // instead of crashing the server.
      for (const { label, handler } of handlers) {
        try {
          const handled = await handler(url, method, req, res);
          if (handled) return;  // This module handled it — done!
        } catch (err) {
          console.error(`[MA-routes] Error in "${label}" module:`, err.message);
          if (!res.headersSent) {
            json(res, 500, { error: `Route module "${label}" error: ${err.message}` });
          }
          return;
        }
      }

      // ── No module claimed this request → 404 ──────────────────
      // (This shouldn't normally happen because route-static is a
      // catch-all, but it's here as a safety net.)
      if (!res.headersSent) {
        res.writeHead(404);
        res.end('Not found');
      }
    } catch (e) {
      console.error('[MA-routes] Request error:', e.message);
      if (!res.headersSent) {
        json(res, 500, { error: e.message });
      }
    }
  };
}

module.exports = { createRouteHandler };
