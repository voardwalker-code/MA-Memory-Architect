// ── Route Module: Ollama ─────────────────────────────────────────────────────
//
// This module talks to a local Ollama server — a program that runs AI models
// right on your own computer (no internet needed!).
//
// Think of Ollama like a "model manager" on your PC.  This module lets you:
//   • See which models you have installed (like listing your apps)
//   • Look at details about a specific model (like reading an app's info page)
//   • Download (pull) a new model (like installing a new app)
//
// ── Endpoints ───────────────────────────────────────────────────────────────
//   GET  /api/ollama/models          — List all models installed in Ollama
//   POST /api/ollama/show            — Get detailed info about one model
//   POST /api/ollama/pull            — Download a new model from the Ollama library
//
// ── What this module needs ──────────────────────────────────────────────────
//   deps.core — MA-core (to read the current config for the Ollama endpoint)
//   deps.llm  — MA-llm  (has the functions that actually talk to Ollama)
// ─────────────────────────────────────────────────────────────────────────────
'use strict';

// json()     — send a JSON response with a status code
// readBody() — read the full body of a POST request
const { json, readBody } = require('../infra/infra-http-utils');

// ─────────────────────────────────────────────────────────────────────────────
// createOllamaRoutes(deps)
//
// Called once when the server starts.  Returns a handler that checks every
// incoming request.  Returns true if handled, false if not ours.
// ─────────────────────────────────────────────────────────────────────────────
module.exports = function createOllamaRoutes(deps) {
  const { core, llm } = deps;

  return async function handle(url, method, req, res) {

    // ── List all installed Ollama models ─────────────────────────────
    // You can pass ?endpoint=http://... to override the default.
    // Returns { models: [ { name, size, ... }, ... ] }
    if (url.pathname === '/api/ollama/models' && method === 'GET') {
      const endpoint = url.searchParams.get('endpoint') || core.getConfig()?.endpoint;
      if (!endpoint) { json(res, 400, { error: 'No Ollama endpoint' }); return true; }
      try {
        const models = await llm.ollamaListModels(endpoint);
        json(res, 200, { models });
      } catch (e) {
        json(res, 502, { error: e.message });
      }
      return true;
    }

    // ── Show details for one model ───────────────────────────────────
    // Body: { model: "llama3", endpoint?: "http://..." }
    // Returns model metadata (parameters, template, license, etc.)
    if (url.pathname === '/api/ollama/show' && method === 'POST') {
      const body     = JSON.parse(await readBody(req));
      const endpoint = body.endpoint || core.getConfig()?.endpoint;
      if (!endpoint || !body.model) { json(res, 400, { error: 'Need endpoint and model' }); return true; }
      try {
        const info = await llm.ollamaShowModel(endpoint, body.model);
        json(res, 200, info);
      } catch (e) {
        json(res, 502, { error: e.message });
      }
      return true;
    }

    // ── Pull (download) a model ──────────────────────────────────────
    // Body: { model: "llama3", endpoint?: "http://..." }
    // Downloads the model from the Ollama registry.  This can take a
    // while for large models (several GB).
    if (url.pathname === '/api/ollama/pull' && method === 'POST') {
      const body     = JSON.parse(await readBody(req));
      const endpoint = body.endpoint || core.getConfig()?.endpoint;
      if (!endpoint || !body.model) { json(res, 400, { error: 'Need endpoint and model' }); return true; }
      try {
        const result = await llm.ollamaPullModel(endpoint, body.model);
        json(res, 200, { ok: true, status: result.status || 'success' });
      } catch (e) {
        json(res, 502, { error: e.message });
      }
      return true;
    }

    // None of our routes matched
    return false;
  };
};
