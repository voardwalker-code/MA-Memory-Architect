// ── Route Module: Model Roster ───────────────────────────────────────────────
//
// This module manages MA's "model roster" — a registry of all the AI models
// you might want to use.  Instead of being stuck with one model, MA can
// switch between models depending on the task.
//
// Think of it like a sports team roster:
//   • You have a list of players (models)
//   • Each player has strengths (good at code, good at writing, etc.)
//   • The coach (router) picks the best player for each play (task)
//   • You can track how well each player performs over time
//
// ── Endpoints ───────────────────────────────────────────────────────────────
//   GET  /api/models/roster      — Get the full list of registered models
//   POST /api/models/add         — Add a new model to the roster
//   POST /api/models/update      — Edit an existing model's settings
//   POST /api/models/remove      — Remove a model from the roster
//   POST /api/models/route       — Ask the router which model it would pick
//   GET  /api/models/performance — Get performance stats for all models
//   POST /api/models/research    — Use the LLM to discover a model's abilities
//
// ── What this module needs ──────────────────────────────────────────────────
//   deps.core        — MA-core (getConfig, for routing decisions)
//   deps.modelRouter — MA-model-router (roster CRUD, routing logic, perf data)
// ─────────────────────────────────────────────────────────────────────────────
'use strict';

// json()     — send a JSON response with a status code
// readBody() — read the full body of a POST request
const { json, readBody } = require('../infra/infra-http-utils');

// ─────────────────────────────────────────────────────────────────────────────
// createModelRoutes(deps)
//
// Called once when the server starts.  Returns a handler that checks every
// incoming request.  Returns true if handled, false if not ours.
// ─────────────────────────────────────────────────────────────────────────────
module.exports = function createModelRoutes(deps) {
  const { core, modelRouter } = deps;

  return async function handle(url, method, req, res) {

    // ── Get the full roster ──────────────────────────────────────────
    // Returns the complete list of models with their settings, tags,
    // and routing preferences.
    if (url.pathname === '/api/models/roster' && method === 'GET') {
      json(res, 200, modelRouter.getRoster());
      return true;
    }

    // ── Add a model ──────────────────────────────────────────────────
    // Body must include { model: "model-name" }.  Optional fields:
    // provider, endpoint, tags, maxTokens, etc.
    if (url.pathname === '/api/models/add' && method === 'POST') {
      const body = JSON.parse(await readBody(req));
      if (!body.model) { json(res, 400, { error: 'Need model name' }); return true; }
      const result = modelRouter.addModel(body);
      json(res, result.ok ? 200 : 400, result);
      return true;
    }

    // ── Update a model ───────────────────────────────────────────────
    // Body must include { id: "model-id" } plus any fields to change.
    if (url.pathname === '/api/models/update' && method === 'POST') {
      const body = JSON.parse(await readBody(req));
      if (!body.id) { json(res, 400, { error: 'Need model id' }); return true; }
      const result = modelRouter.updateModel(body.id, body);
      json(res, result.ok ? 200 : 400, result);
      return true;
    }

    // ── Remove a model ───────────────────────────────────────────────
    // Body must include { id: "model-id" }.
    if (url.pathname === '/api/models/remove' && method === 'POST') {
      const body = JSON.parse(await readBody(req));
      if (!body.id) { json(res, 400, { error: 'Need model id' }); return true; }
      const result = modelRouter.removeModel(body.id);
      json(res, result.ok ? 200 : 400, result);
      return true;
    }

    // ── Route a task ─────────────────────────────────────────────────
    // Given a message and task type, the router picks the best model.
    // Body: { message?, taskType?: "code"|"writing"|..., agentRole? }
    // This doesn't actually send anything to the AI — it just tells you
    // which model the router WOULD pick.
    if (url.pathname === '/api/models/route' && method === 'POST') {
      const body   = JSON.parse(await readBody(req));
      const routed = modelRouter.routeModel(
        body.message  || '',
        body.taskType || 'code',
        body.agentRole || null,
        core.getConfig()
      );
      json(res, 200, routed);
      return true;
    }

    // ── Performance stats ────────────────────────────────────────────
    // Returns timing data, success rates, and usage counts for every
    // model that has been used at least once.
    if (url.pathname === '/api/models/performance' && method === 'GET') {
      json(res, 200, modelRouter.getAllPerformance());
      return true;
    }

    // ── Research a model ─────────────────────────────────────────────
    // Uses an LLM call to discover a model's capabilities and updates
    // the roster with what it finds.  Useful for auto-configuring a
    // new model you just added.
    // Body: { model: "model-name" }
    if (url.pathname === '/api/models/research' && method === 'POST') {
      const body = JSON.parse(await readBody(req));
      if (!body.model) { json(res, 400, { error: 'Need model name' }); return true; }
      try {
        const result = await modelRouter.researchAndUpdate(body.model);
        json(res, result.ok ? 200 : 400, result);
      } catch (e) {
        json(res, 500, { error: e.message });
      }
      return true;
    }

    // None of our routes matched
    return false;
  };
};
