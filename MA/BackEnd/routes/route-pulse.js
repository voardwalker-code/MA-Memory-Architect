// ── Route Module: Pulse & Chores ─────────────────────────────────────────────
//
// This module manages the "Pulse" system — MA's background heartbeat.
// Pulse runs on a timer and does things automatically, like:
//   • Checking the system's health every X minutes
//   • Running "chores" — small recurring tasks the user sets up
//
// Think of Pulse like an alarm clock that goes off on a schedule and does
// helpful things while you're away.  Chores are the specific tasks that
// Pulse runs when the alarm goes off.
//
// ── Pulse endpoints ─────────────────────────────────────────────────────────
//   GET  /api/pulse/status  — Are the timers running?  What's their config?
//   POST /api/pulse/config  — Change timer intervals (e.g. health every 5 min)
//   POST /api/pulse/start   — Start all background timers
//   POST /api/pulse/stop    — Stop all background timers
//   GET  /api/pulse/logs    — Read recent pulse log lines
//
// ── Chore endpoints ─────────────────────────────────────────────────────────
//   GET  /api/chores        — List all recurring chores
//   POST /api/chores/add    — Create a new chore.  Body: { name, ... }
//   POST /api/chores/update — Edit a chore.  Body: { id, ...changes }
//   POST /api/chores/remove — Delete a chore.  Body: { id }
//
// ── What this module needs ──────────────────────────────────────────────────
//   deps.pulse — MA-pulse (timer management, chore CRUD, log reading)
// ─────────────────────────────────────────────────────────────────────────────
'use strict';

// json()     — send a JSON response with a status code
// readBody() — read the full body of a POST request
const { json, readBody } = require('../infra/infra-http-utils');

// ─────────────────────────────────────────────────────────────────────────────
// createPulseRoutes(deps)
//
// Called once when the server starts.  Returns a handler that checks every
// incoming request.  Returns true if handled, false if not ours.
// ─────────────────────────────────────────────────────────────────────────────
module.exports = function createPulseRoutes(deps) {
  const { pulse } = deps;

  return async function handle(url, method, req, res) {

    // ═════════════════════════════════════════════════════════════════
    // PULSE — Background timer management
    // ═════════════════════════════════════════════════════════════════

    // ── Pulse status ─────────────────────────────────────────────────
    // Returns which timers are active and their current configuration.
    if (url.pathname === '/api/pulse/status' && method === 'GET') {
      json(res, 200, {
        timers: pulse.getPulseStatus(),
        config: pulse.getPulseConfig()
      });
      return true;
    }

    // ── Pulse config ─────────────────────────────────────────────────
    // Update timer intervals.  Body can include:
    //   { healthScan: { intervalMs: 300000 }, choreCheck: { intervalMs: 600000 } }
    // After saving, the timers are restarted with the new settings.
    if (url.pathname === '/api/pulse/config' && method === 'POST') {
      const body = JSON.parse(await readBody(req));
      const cfg  = pulse.getPulseConfig();
      if (body.healthScan) cfg.healthScan = { ...cfg.healthScan, ...body.healthScan };
      if (body.choreCheck) cfg.choreCheck = { ...cfg.choreCheck, ...body.choreCheck };
      pulse.savePulseConfig(cfg);
      // Restart timers so the new intervals take effect immediately
      pulse.stopAll();
      pulse.startAll();
      json(res, 200, { ok: true, config: cfg });
      return true;
    }

    // ── Start all timers ─────────────────────────────────────────────
    if (url.pathname === '/api/pulse/start' && method === 'POST') {
      pulse.startAll();
      json(res, 200, { ok: true });
      return true;
    }

    // ── Stop all timers ──────────────────────────────────────────────
    if (url.pathname === '/api/pulse/stop' && method === 'POST') {
      pulse.stopAll();
      json(res, 200, { ok: true });
      return true;
    }

    // ── Read pulse logs ──────────────────────────────────────────────
    // Query params:
    //   ?type=health  — which log to read (default: "health")
    //   ?lines=50     — how many lines to return (default: 50)
    if (url.pathname === '/api/pulse/logs' && method === 'GET') {
      const type  = url.searchParams.get('type') || 'health';
      const lines = parseInt(url.searchParams.get('lines') || '50', 10);
      json(res, 200, { lines: pulse.readLog(`pulse-${type}.log`, lines) });
      return true;
    }

    // ═════════════════════════════════════════════════════════════════
    // CHORES — Recurring tasks that Pulse runs on schedule
    // ═════════════════════════════════════════════════════════════════

    // ── List all chores ──────────────────────────────────────────────
    if (url.pathname === '/api/chores' && method === 'GET') {
      json(res, 200, pulse.getChores());
      return true;
    }

    // ── Add a new chore ──────────────────────────────────────────────
    // Body must include { name: "..." }.  Other fields are optional.
    if (url.pathname === '/api/chores/add' && method === 'POST') {
      const body = JSON.parse(await readBody(req));
      if (!body.name) { json(res, 400, { error: 'Need chore name' }); return true; }
      try {
        const chore = pulse.addChore(body);
        json(res, 200, { ok: true, chore });
      } catch (e) {
        json(res, 400, { error: e.message });
      }
      return true;
    }

    // ── Update an existing chore ─────────────────────────────────────
    // Body must include { id: "..." } plus any fields to change.
    if (url.pathname === '/api/chores/update' && method === 'POST') {
      const body = JSON.parse(await readBody(req));
      if (!body.id) { json(res, 400, { error: 'Need chore id' }); return true; }
      try {
        const chore = pulse.updateChore(body.id, body);
        json(res, 200, { ok: true, chore });
      } catch (e) {
        json(res, 400, { error: e.message });
      }
      return true;
    }

    // ── Remove a chore ───────────────────────────────────────────────
    // Body must include { id: "..." }.
    if (url.pathname === '/api/chores/remove' && method === 'POST') {
      const body = JSON.parse(await readBody(req));
      if (!body.id) { json(res, 400, { error: 'Need chore id' }); return true; }
      try {
        pulse.removeChore(body.id);
        json(res, 200, { ok: true });
      } catch (e) {
        json(res, 400, { error: e.message });
      }
      return true;
    }

    // None of our routes matched
    return false;
  };
};
