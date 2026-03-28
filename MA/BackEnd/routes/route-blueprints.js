// ── Route Module: Blueprints ─────────────────────────────────────────────────
//
// This module manages "blueprints" — markdown files that contain instructions,
// templates, and guides the AI follows when doing its work.
//
// Think of blueprints like recipe cards:
//   • You can list all the recipes in the box
//   • You can read a specific recipe
//   • You can edit a recipe (but not create or delete — that's done manually)
//
// Blueprints are organized in folders like:
//   MA-blueprints/core/output-format.md
//   MA-blueprints/modules/analysis.md
//
// ── Endpoints ───────────────────────────────────────────────────────────────
//   GET  /api/blueprints      — List all blueprint files and their paths
//   GET  /api/blueprints/file — Read one blueprint.  Query: ?path=core/output-format.md
//   POST /api/blueprints/file — Save edited content to a blueprint
//
// ── What this module needs ──────────────────────────────────────────────────
//   deps.BLUEPRINT_DIR — Absolute path to the MA-blueprints/ folder
// ─────────────────────────────────────────────────────────────────────────────
'use strict';

const fs   = require('fs');
const path = require('path');

// json()              — send a JSON response with a status code
// readBody()          — read the full body of a POST request
// resolveInsideRoot() — safely resolve a path that MUST stay inside a root folder
//                       (prevents "../../../etc/passwd" style attacks)
// listMarkdownFiles() — recursively find all .md files under a directory
const { json, readBody, resolveInsideRoot, listMarkdownFiles } = require('../infra/infra-http-utils');

// ─────────────────────────────────────────────────────────────────────────────
// createBlueprintRoutes(deps)
//
// Called once when the server starts.  Returns a handler that checks every
// incoming request.  Returns true if handled, false if not ours.
// ─────────────────────────────────────────────────────────────────────────────
module.exports = function createBlueprintRoutes(deps) {
  const { BLUEPRINT_DIR } = deps;

  return async function handle(url, method, req, res) {

    // ── List all blueprints ──────────────────────────────────────────
    // Returns { files: [ { path: "core/output-format.md", name: "..." }, ... ] }
    // sorted alphabetically by path.
    if (url.pathname === '/api/blueprints' && method === 'GET') {
      const files = listMarkdownFiles(BLUEPRINT_DIR)
        .sort((a, b) => a.path.localeCompare(b.path));
      json(res, 200, { files });
      return true;
    }

    // ── Read one blueprint ───────────────────────────────────────────
    // Query param: ?path=core/output-format.md
    // Returns { path: "core/output-format.md", content: "# ..." }
    if (url.pathname === '/api/blueprints/file' && method === 'GET') {
      const requestedPath = url.searchParams.get('path');
      if (!requestedPath) { json(res, 400, { error: 'Need blueprint path' }); return true; }
      try {
        // resolveInsideRoot makes sure the path can't escape the blueprints folder
        const fullPath = resolveInsideRoot(BLUEPRINT_DIR, requestedPath);
        if (!fs.existsSync(fullPath)) { json(res, 404, { error: 'Blueprint not found' }); return true; }
        json(res, 200, {
          path:    path.relative(BLUEPRINT_DIR, fullPath).replace(/\\/g, '/'),
          content: fs.readFileSync(fullPath, 'utf8')
        });
      } catch (e) {
        json(res, 400, { error: e.message });
      }
      return true;
    }

    // ── Save a blueprint ─────────────────────────────────────────────
    // Body: { path: "core/output-format.md", content: "# Updated..." }
    // The file must already exist — you can't create new ones via API.
    if (url.pathname === '/api/blueprints/file' && method === 'POST') {
      const body = JSON.parse(await readBody(req));
      if (!body.path || typeof body.content !== 'string') {
        json(res, 400, { error: 'Need blueprint path and content' });
        return true;
      }
      try {
        const fullPath = resolveInsideRoot(BLUEPRINT_DIR, body.path);
        if (!fs.existsSync(fullPath)) { json(res, 404, { error: 'Blueprint not found' }); return true; }
        fs.writeFileSync(fullPath, body.content, 'utf8');
        json(res, 200, {
          ok:   true,
          path: path.relative(BLUEPRINT_DIR, fullPath).replace(/\\/g, '/')
        });
      } catch (e) {
        json(res, 400, { error: e.message });
      }
      return true;
    }

    // None of our routes matched
    return false;
  };
};
