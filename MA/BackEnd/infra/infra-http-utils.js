// ── Infra · HTTP Utilities ─────────────────────────────────────────────────
//
// A TOOLBOX FOR THE WEB SERVER:
// Every route handler needs to do the same few things over and over:
//   • Send a JSON response back to the browser
//   • Read the body of an incoming POST request
//   • Check that a file path doesn't escape the workspace (security!)
//   • List files in a directory
//
// Instead of copy-pasting that code into every route, these shared
// helper functions live here.  Think of it like a toolbox that every
// route module reaches into.
//
// WHAT'S IN THE BOX:
//   MIME              — file extension → content-type map (.js → text/javascript)
//   json(res, data)   — send a JSON response with proper headers
//   readBody(req)     — collect POST body with 10 MB safety limit
//   resolveInsideRoot(userPath, root) — path-traversal guard
//   listMarkdownFiles(dir) — recursively find all .md files
//   listWorkspaceTree(dir) — build a nested file/folder tree
//   sseStreamHeaders(extra?) — standard headers for text/event-stream (no buffering)
//
// SECURITY:
//   resolveInsideRoot() prevents directory traversal attacks.
//   readBody() has a size limit to prevent memory exhaustion.
//   These are STATELESS — they don't depend on config or core.
//
// WHAT USES THIS:
//   MA-routes.js + every route module in routes/
//
// EXPORTS:
//   MIME, json, readBody, resolveInsideRoot,
//   listMarkdownFiles, listWorkspaceTree, sseStreamHeaders
// ─────────────────────────────────────────────────────────────────────────────
'use strict';

const fs   = require('fs');
const path = require('path');

// ── MIME type map ───────────────────────────────────────────────────────────
// Maps file extensions to Content-Type values for static file serving.
// Only the types MA actually serves are listed; anything else falls back to
// 'application/octet-stream' in the static handler.
const MIME = {
  '.html':  'text/html',
  '.css':   'text/css',
  '.js':    'text/javascript',
  '.json':  'application/json',
  '.png':   'image/png',
  '.svg':   'image/svg+xml',
  '.ico':   'image/x-icon',
  '.woff2': 'font/woff2',
  '.md':    'text/plain'
};

// ── json(res, status, data) ─────────────────────────────────────────────────
// Convenience: serialise `data` to JSON and write it to `res` with the given
// HTTP status code.  Used by every API endpoint.
function json(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

// ── readBody(req) → Promise<string> ─────────────────────────────────────────
// Buffers the full request body as a UTF-8 string.  Destroys the socket and
// rejects if the payload exceeds 10 MB — a simple safeguard against oversized
// uploads or accidental binary streams.
function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    const MAX = 10485760; // 10 MB
    req.on('data', c => {
      size += c.length;
      if (size > MAX) { reject(new Error('Body too large')); req.destroy(); }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

// ── resolveInsideRoot(rootDir, requestedPath) → string ──────────────────────
// Resolves `requestedPath` relative to `rootDir` and verifies the result does
// not escape the root via ../ tricks.  Throws if the resolved path is outside
// the root — this is the path-traversal guard used by blueprint and workspace
// file endpoints.
function resolveInsideRoot(rootDir, requestedPath) {
  const normalized = String(requestedPath || '').replace(/\\/g, '/').replace(/^\/+/, '');
  const resolved = path.resolve(rootDir, normalized);
  const base = path.resolve(rootDir);
  if (resolved !== base && !resolved.startsWith(base + path.sep)) {
    throw new Error('Path escapes allowed root');
  }
  return resolved;
}

// ── listMarkdownFiles(rootDir) → Array<{path, name, group}> ────────────────
// Recursively walks `rootDir` and collects every .md file.  Each entry
// contains the relative path, the filename, and a `group` string (the
// top-level subfolder, or 'root' if the file lives directly under rootDir).
// Used by the /api/blueprints endpoint.
function listMarkdownFiles(rootDir, currentDir = rootDir, bucket = []) {
  if (!fs.existsSync(currentDir)) return bucket;
  const entries = fs.readdirSync(currentDir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(currentDir, entry.name);
    if (entry.isDirectory()) {
      listMarkdownFiles(rootDir, fullPath, bucket);
      continue;
    }
    if (!entry.name.toLowerCase().endsWith('.md')) continue;
    const relativePath = path.relative(rootDir, fullPath).replace(/\\/g, '/');
    bucket.push({
      path: relativePath,
      name: entry.name,
      group: relativePath.includes('/') ? relativePath.split('/')[0] : 'root'
    });
  }
  return bucket;
}

// ── listWorkspaceTree(rootDir) → Array<{name, path, type, children?}> ──────
// Builds a nested tree structure suitable for the workspace file-explorer UI.
// Directories are listed before files at each level; dot-files are hidden.
// Recursion is capped at depth 6 to avoid runaway traversal of node_modules
// or similar deep trees.
function listWorkspaceTree(rootDir, currentDir = rootDir, depth = 0) {
  if (!fs.existsSync(currentDir)) return [];
  if (depth > 6) return [];
  const entries = fs.readdirSync(currentDir, { withFileTypes: true })
    .filter(entry => !entry.name.startsWith('.'))
    .sort((a, b) => {
      // Directories first, then alphabetical
      if (a.isDirectory() !== b.isDirectory()) return a.isDirectory() ? -1 : 1;
      return a.name.localeCompare(b.name);
    });

  return entries.map(entry => {
    const fullPath = path.join(currentDir, entry.name);
    const relativePath = path.relative(rootDir, fullPath).replace(/\\/g, '/');
    return {
      name: entry.name,
      path: relativePath,
      type: entry.isDirectory() ? 'directory' : 'file',
      children: entry.isDirectory()
        ? listWorkspaceTree(rootDir, fullPath, depth + 1)
        : undefined
    };
  });
}

// ── sseStreamHeaders(extra?) → plain object ─────────────────────────────────
// Server-Sent Events need the response to flush promptly. Proxies (nginx) may
// buffer unless told not to; Node can also coalesce small writes. These headers
// are the usual fix: no cache/transform, disable nginx buffering.
const SSE_BASE_HEADERS = Object.freeze({
  'Content-Type': 'text/event-stream',
  'Cache-Control': 'no-cache, no-transform',
  'Connection': 'keep-alive',
  'X-Accel-Buffering': 'no'
});

function sseStreamHeaders(extra) {
  const more = extra && typeof extra === 'object' ? extra : {};
  return { ...SSE_BASE_HEADERS, ...more };
}

module.exports = {
  MIME,
  json,
  readBody,
  resolveInsideRoot,
  listMarkdownFiles,
  listWorkspaceTree,
  sseStreamHeaders
};
