// ── Route Module: System (Entity & Health) ──────────────────────────────────
//
// This module provides basic "system info" endpoints — who is the AI entity,
// and is the system healthy?
//
// Think of it like a doctor's office for the server:
//   • "Entity" is the server's name tag — it tells you who is running
//     (e.g. "MA", or a custom entity the user set up).
//   • "Health" is like a checkup — it scans all the important parts of
//     the system and reports what's working and what's broken.
//
// ── Endpoints ───────────────────────────────────────────────────────────────
//   GET /api/entity — Get the current entity identity (name, id, etc.)
//   GET /api/health — Run a full system health scan and return the report
//
// ── What this module needs ──────────────────────────────────────────────────
//   deps.core        — MA-core (getEntity for identity, health.scan for checkup)
// ─────────────────────────────────────────────────────────────────────────────
'use strict';

// json() — send a JSON response with a status code
const { json } = require('../infra/infra-http-utils');

// ─────────────────────────────────────────────────────────────────────────────
// createSystemRoutes(deps)
//
// Called once when the server starts.  Returns a handler that checks every
// incoming request.  Returns true if handled, false if not ours.
// ─────────────────────────────────────────────────────────────────────────────
module.exports = function createSystemRoutes(deps) {
  const { core } = deps;

  return async function handle(url, method, _req, _res) {

    // ── Entity identity ──────────────────────────────────────────────
    // Returns something like: { name: "MA", id: "ma" }
    // If no custom entity is configured, we fall back to the defaults.
    if (url.pathname === '/api/entity' && method === 'GET') {
      json(_res, 200, core.getEntity() || { name: 'MA', id: 'ma' });
      return true;
    }

    // ── Health scan ──────────────────────────────────────────────────
    // Checks all the important parts of the system:
    //   • Are required files present?
    //   • Is memory working?
    //   • Can we reach the LLM?
    //   • Are there any config errors?
    // Returns a report with "critical" problems and "warnings".
    if (url.pathname === '/api/health' && method === 'GET') {
      json(_res, 200, core.health.scan());
      return true;
    }

    // None of our routes matched
    return false;
  };
};
