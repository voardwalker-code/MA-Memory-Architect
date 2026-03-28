// ── Route Module: Memory ─────────────────────────────────────────────────────
//
// This module manages MA's long-term memory — a database of things the AI
// has learned, been told, or ingested from files.
//
// Think of it like the AI's notebook:
//   • SEARCH  — flip through the notebook looking for something specific
//   • STORE   — write a new note in the notebook
//   • STATS   — how many notes are there?  How much space do they use?
//   • INGEST  — read a whole file and break it into notebook entries
//   • INGEST FOLDER — read an entire folder of files (uses streaming so
//     you can watch the progress and cancel if needed)
//   • ARCHIVES — list the named collections of ingested material
//
// ── Endpoints ───────────────────────────────────────────────────────────────
//   GET  /api/memory/search        — Search memories.  Query: ?q=topic&limit=10
//   POST /api/memory/store         — Store a new memory.  Body: { content, type?, meta? }
//   GET  /api/memory/stats         — Get memory statistics (count, size, etc.)
//   POST /api/memory/ingest        — Ingest a single file.  Body: { filePath }
//   POST /api/memory/ingest-folder — Ingest a whole folder (streams progress via SSE)
//   GET  /api/memory/archives      — List all named memory archives
//
// ── What this module needs ──────────────────────────────────────────────────
//   deps.core — MA-core (core.getMemory() returns the memory instance,
//               core.WORKSPACE_DIR for path safety checks)
// ─────────────────────────────────────────────────────────────────────────────
'use strict';

const fs   = require('fs');
const path = require('path');

// json()     — send a JSON response with a status code
// readBody() — read the full body of a POST request
const { json, readBody, sseStreamHeaders } = require('../infra/infra-http-utils');

// ─────────────────────────────────────────────────────────────────────────────
// createMemoryRoutes(deps)
//
// Called once when the server starts.  Returns a handler that checks every
// incoming request.  Returns true if handled, false if not ours.
// ─────────────────────────────────────────────────────────────────────────────
module.exports = function createMemoryRoutes(deps) {
  const { core } = deps;

  return async function handle(url, method, req, res) {

    // ── Search memories ──────────────────────────────────────────────
    // Query params:
    //   ?q=javascript promises  — what to search for
    //   ?limit=10               — max results to return (default: 10)
    // Returns an array of matching memory entries.
    if (url.pathname === '/api/memory/search' && method === 'GET') {
      const q     = url.searchParams.get('q') || '';
      const limit = parseInt(url.searchParams.get('limit') || '10', 10);
      const mem   = core.getMemory();
      json(res, 200, mem ? mem.search(q, limit) : []);
      return true;
    }

    // ── Store a new memory ───────────────────────────────────────────
    // Body: { content: "The thing I learned", type?: "semantic", meta?: {} }
    // Returns { id: "mem_..." } — the ID of the stored memory.
    if (url.pathname === '/api/memory/store' && method === 'POST') {
      const body = JSON.parse(await readBody(req));
      if (!body.content) { json(res, 400, { error: 'Need content' }); return true; }
      const mem = core.getMemory();
      const id  = mem.store(body.type || 'semantic', body.content, body.meta || {});
      json(res, 200, { id });
      return true;
    }

    // ── Memory statistics ────────────────────────────────────────────
    // Returns counts, sizes, and other stats about the memory database.
    if (url.pathname === '/api/memory/stats' && method === 'GET') {
      const mem = core.getMemory();
      json(res, 200, mem ? mem.stats() : {});
      return true;
    }

    // ── Ingest a single file ─────────────────────────────────────────
    // Body: { filePath: "src/app.js", meta?: {} }
    // Reads the file, breaks it into chunks, and stores each chunk as
    // a memory entry.  The filePath must be inside the workspace.
    if (url.pathname === '/api/memory/ingest' && method === 'POST') {
      const body = JSON.parse(await readBody(req));
      if (!body.filePath) { json(res, 400, { error: 'Need filePath' }); return true; }

      // Safety check: the file must be inside the workspace folder
      const safe = path.resolve(core.WORKSPACE_DIR, body.filePath);
      if (!safe.startsWith(path.resolve(core.WORKSPACE_DIR))) {
        json(res, 403, { error: 'Path outside workspace' });
        return true;
      }

      const mem   = core.getMemory();
      const count = mem.ingest(safe, body.meta || {});
      json(res, 200, { chunks: count });
      return true;
    }

    // ── Ingest a whole folder (streaming) ────────────────────────────
    // Body: { folderPath: "/path/to/folder", archive?: "my-project" }
    //
    // This can take a long time for large folders, so we use Server-Sent
    // Events (SSE) to stream progress back to the client.  The client
    // can also abort by closing the connection.
    //
    // Events sent:
    //   "progress" → { file, index, total, ... }
    //   "done"     → { totalFiles, totalChunks, ... }
    //   "error"    → { error: "message" }
    //   "close"    → stream is finished
    if (url.pathname === '/api/memory/ingest-folder' && method === 'POST') {
      const body = JSON.parse(await readBody(req));
      if (!body.folderPath) { json(res, 400, { error: 'Need folderPath' }); return true; }

      const resolved = path.resolve(body.folderPath);
      if (!fs.existsSync(resolved) || !fs.statSync(resolved).isDirectory()) {
        json(res, 400, { error: 'Not a valid directory' });
        return true;
      }

      // Set up the SSE stream
      res.writeHead(200, sseStreamHeaders());

      // Helper: write one SSE frame (only if the connection is still open)
      const sse = (event, data) => {
        if (!res.writableEnded) {
          res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
        }
      };

      // Track if the client closes the connection early
      const abortState = { aborted: false };
      req.on('close', () => { abortState.aborted = true; });

      try {
        const mem    = core.getMemory();
        const result = mem.ingestFolder(resolved, {
          archive:    body.archive || path.basename(resolved),
          onProgress: (info) => sse('progress', info),
          abort:      abortState
        });

        if (abortState.aborted) {
          sse('error', { error: 'Ingest stopped by user' });
        } else {
          sse('done', result);
        }
      } catch (e) {
        sse('error', { error: e.message });
      }

      // Close the stream cleanly
      if (!res.writableEnded) {
        res.write('event: close\ndata: {}\n\n');
        res.end();
      }
      return true;
    }

    // ── List memory archives ─────────────────────────────────────────
    // Returns an object listing all named archives (collections of
    // ingested material).
    if (url.pathname === '/api/memory/archives' && method === 'GET') {
      const mem = core.getMemory();
      json(res, 200, mem ? mem.listArchives() : {});
      return true;
    }

    // None of our routes matched
    return false;
  };
};
