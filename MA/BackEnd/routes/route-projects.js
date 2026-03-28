// ── Route Module: Projects ───────────────────────────────────────────────────
//
// This module manages the "project archive" — a collection of projects that
// MA has worked on.  Each project has a name, status, and timestamps.
//
// Think of it like a filing cabinet:
//   • You can list all the folders in the cabinet
//   • You can "resume" a project (pull it out and work on it again)
//   • You can "close" a project (put it back, mark it done)
//
// Projects are sorted newest-first so the most recent work shows up on top.
//
// ── Endpoints ───────────────────────────────────────────────────────────────
//   GET  /api/projects       — List all projects (newest first)
//   POST /api/projects/state — Change a project's state (close or resume)
//
// ── What this module needs ──────────────────────────────────────────────────
//   deps.core — MA-core (core.projectArchive for listing, closing, resuming)
// ─────────────────────────────────────────────────────────────────────────────
'use strict';

// json()     — send a JSON response with a status code
// readBody() — read the full body of a POST request
const { json, readBody } = require('../infra/infra-http-utils');

// ─────────────────────────────────────────────────────────────────────────────
// createProjectRoutes(deps)
//
// Called once when the server starts.  Returns a handler that checks every
// incoming request.  Returns true if handled, false if not ours.
// ─────────────────────────────────────────────────────────────────────────────
module.exports = function createProjectRoutes(deps) {
  const { core } = deps;

  return async function handle(url, method, req, res) {

    // ── List all projects ────────────────────────────────────────────
    // Returns { projects: [...] }, sorted newest-first by updatedAt
    // (or createdAt if updatedAt is missing).
    if (url.pathname === '/api/projects' && method === 'GET') {
      const projects = core.projectArchive.listProjects().sort((a, b) => {
        const aTime = new Date(a.updatedAt || a.createdAt || 0).getTime();
        const bTime = new Date(b.updatedAt || b.createdAt || 0).getTime();
        return bTime - aTime;
      });
      json(res, 200, { projects });
      return true;
    }

    // ── Change a project's state ─────────────────────────────────────
    // Body: { id: "project-id", action: "close" | "resume" }
    //
    // "close"  — marks the project as completed/archived
    // "resume" — reopens it so you can keep working on it
    if (url.pathname === '/api/projects/state' && method === 'POST') {
      const body = JSON.parse(await readBody(req));
      if (!body.id || !body.action) {
        json(res, 400, { error: 'Need project id and action' });
        return true;
      }
      try {
        const project = body.action === 'close'
          ? core.projectArchive.closeProject(body.id)
          : body.action === 'resume'
            ? core.projectArchive.resumeProject(body.id)
            : null;
        if (!project) { json(res, 400, { error: 'Unsupported action' }); return true; }
        json(res, 200, { ok: true, project });
      } catch (e) {
        json(res, 400, { error: e.message });
      }
      return true;
    }

    // None of our routes matched
    return false;
  };
};
