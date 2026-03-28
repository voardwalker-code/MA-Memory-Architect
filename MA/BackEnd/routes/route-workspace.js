// ── Route Module: Workspace & Terminal ────────────────────────────────────────
//
// This module gives the browser client access to the user's project files
// and lets the AI run whitelisted terminal commands.
//
// Think of it like a file manager + a safe terminal:
//   • TREE  — Show the folder structure (like a sidebar in VS Code)
//   • READ  — Open a file and see its contents
//   • SAVE  — Write new content to a file (create or update)
//   • MKDIR — Create a new folder
//   • FILE  — Serve a raw file (images, HTML, etc.) for in-browser preview
//   • EXEC  — Run a terminal command, but ONLY if it's on the whitelist
//
// SAFETY: All file paths are checked to make sure they stay inside the
// workspace folder.  You can't use tricks like "../../etc/passwd" to
// escape.  Terminal commands are also restricted to the whitelist.
//
// ── Endpoints ───────────────────────────────────────────────────────────────
//   GET  /api/workspace/tree  — Get the folder tree of the workspace
//   GET  /api/workspace/read  — Read a file.  Query: ?path=src/app.js
//   POST /api/workspace/save  — Write a file.  Body: { path, content }
//   POST /api/workspace/mkdir — Create a folder.  Body: { path }
//   GET  /api/workspace/file  — Serve a raw file with correct MIME type
//   POST /api/terminal/exec   — Run a whitelisted command.  Body: { command }
//
// ── What this module needs ──────────────────────────────────────────────────
//   deps.core    — MA-core (WORKSPACE_DIR for the project root)
//   deps.cmdExec — MA-cmd-executor (parseCommand, execCommand for terminal)
// ─────────────────────────────────────────────────────────────────────────────
'use strict';

const fs   = require('fs');
const path = require('path');

// json()              — send a JSON response with a status code
// readBody()          — read the full body of a POST request
// listWorkspaceTree() — recursively build a folder tree (depth-limited)
// MIME                — lookup table for file extensions → content types
const { json, readBody, listWorkspaceTree, MIME } = require('../infra/infra-http-utils');

// ─────────────────────────────────────────────────────────────────────────────
// createWorkspaceRoutes(deps)
//
// Called once when the server starts.  Returns a handler that checks every
// incoming request.  Returns true if handled, false if not ours.
// ─────────────────────────────────────────────────────────────────────────────
module.exports = function createWorkspaceRoutes(deps) {
  const { core, cmdExec } = deps;

  return async function handle(url, method, req, res) {

    // ═════════════════════════════════════════════════════════════════
    // WORKSPACE — File system access
    // ═════════════════════════════════════════════════════════════════

    // ── Folder tree ──────────────────────────────────────────────────
    // Returns { root: "/path/to/workspace", items: [...] }
    // Items include files and folders up to 6 levels deep.
    if (url.pathname === '/api/workspace/tree' && method === 'GET') {
      json(res, 200, {
        root:  core.WORKSPACE_DIR,
        items: listWorkspaceTree(core.WORKSPACE_DIR)
      });
      return true;
    }

    // ── Read a file ──────────────────────────────────────────────────
    // Query: ?path=src/app.js
    // Returns { path: "src/app.js", content: "..." }
    if (url.pathname === '/api/workspace/read' && method === 'GET') {
      const reqPath = url.searchParams.get('path');
      if (!reqPath) { json(res, 400, { error: 'Need path param' }); return true; }

      // Safety: make sure the resolved path stays inside the workspace
      const wsRoot = path.resolve(core.WORKSPACE_DIR);
      const safe   = path.resolve(wsRoot, reqPath);
      if (!safe.startsWith(wsRoot + path.sep) && safe !== wsRoot) {
        json(res, 403, { error: 'Path outside workspace' });
        return true;
      }
      if (!fs.existsSync(safe) || !fs.statSync(safe).isFile()) {
        json(res, 404, { error: 'File not found' });
        return true;
      }

      json(res, 200, {
        path:    path.relative(wsRoot, safe).replace(/\\/g, '/'),
        content: fs.readFileSync(safe, 'utf8')
      });
      return true;
    }

    // ── Save a file ──────────────────────────────────────────────────
    // Body: { path: "src/app.js", content: "const x = 1;" }
    // Creates parent directories automatically if they don't exist.
    if (url.pathname === '/api/workspace/save' && method === 'POST') {
      const body = JSON.parse(await readBody(req));
      if (!body.path || typeof body.content !== 'string') {
        json(res, 400, { error: 'Need path and content' });
        return true;
      }

      const wsRoot = path.resolve(core.WORKSPACE_DIR);
      const safe   = path.resolve(wsRoot, body.path);
      if (!safe.startsWith(wsRoot + path.sep) && safe !== wsRoot) {
        json(res, 403, { error: 'Path outside workspace' });
        return true;
      }

      // Create parent folders if needed (like "mkdir -p")
      fs.mkdirSync(path.dirname(safe), { recursive: true });
      fs.writeFileSync(safe, body.content, 'utf8');

      json(res, 200, {
        ok:   true,
        path: path.relative(wsRoot, safe).replace(/\\/g, '/')
      });
      return true;
    }

    // ── Rename a file or directory ───────────────────────────────────
    // Body: { oldPath: "src/old.js", newPath: "src/new.js" }
    if (url.pathname === '/api/workspace/rename' && method === 'POST') {
      const body = JSON.parse(await readBody(req));
      if (!body.oldPath || !body.newPath) {
        json(res, 400, { error: 'Need oldPath and newPath' });
        return true;
      }

      const wsRoot  = path.resolve(core.WORKSPACE_DIR);
      const safeOld = path.resolve(wsRoot, body.oldPath);
      const safeNew = path.resolve(wsRoot, body.newPath);
      if ((!safeOld.startsWith(wsRoot + path.sep) && safeOld !== wsRoot) ||
          (!safeNew.startsWith(wsRoot + path.sep) && safeNew !== wsRoot)) {
        json(res, 403, { error: 'Path outside workspace' });
        return true;
      }
      if (!fs.existsSync(safeOld)) {
        json(res, 404, { error: 'Source not found' });
        return true;
      }

      // Create parent directories for destination if needed
      fs.mkdirSync(path.dirname(safeNew), { recursive: true });
      fs.renameSync(safeOld, safeNew);

      json(res, 200, {
        ok:      true,
        oldPath: path.relative(wsRoot, safeOld).replace(/\\/g, '/'),
        newPath: path.relative(wsRoot, safeNew).replace(/\\/g, '/')
      });
      return true;
    }

    // ── Delete a file or directory ───────────────────────────────────
    // Body: { path: "src/old.js" }
    // Works for both files and directories (recursive).
    if (url.pathname === '/api/workspace/delete' && method === 'POST') {
      const body = JSON.parse(await readBody(req));
      if (!body.path) { json(res, 400, { error: 'Need path' }); return true; }

      const wsRoot = path.resolve(core.WORKSPACE_DIR);
      const safe   = path.resolve(wsRoot, body.path);
      if (!safe.startsWith(wsRoot + path.sep) && safe !== wsRoot) {
        json(res, 403, { error: 'Path outside workspace' });
        return true;
      }
      if (safe === wsRoot) {
        json(res, 403, { error: 'Cannot delete workspace root' });
        return true;
      }
      if (!fs.existsSync(safe)) {
        json(res, 404, { error: 'Not found' });
        return true;
      }

      fs.rmSync(safe, { recursive: true, force: true });

      json(res, 200, {
        ok:   true,
        path: path.relative(wsRoot, safe).replace(/\\/g, '/')
      });
      return true;
    }

    // ── Create a directory ───────────────────────────────────────────
    // Body: { path: "src/components" }
    // Creates all parent directories too (recursive).
    if (url.pathname === '/api/workspace/mkdir' && method === 'POST') {
      const body = JSON.parse(await readBody(req));
      if (!body.path) { json(res, 400, { error: 'Need path' }); return true; }

      const wsRoot = path.resolve(core.WORKSPACE_DIR);
      const safe   = path.resolve(wsRoot, body.path);
      if (!safe.startsWith(wsRoot + path.sep) && safe !== wsRoot) {
        json(res, 403, { error: 'Path outside workspace' });
        return true;
      }

      fs.mkdirSync(safe, { recursive: true });
      json(res, 200, {
        ok:   true,
        path: path.relative(wsRoot, safe).replace(/\\/g, '/')
      });
      return true;
    }

    // ── Serve a raw file ─────────────────────────────────────────────
    // Query: ?path=assets/logo.png
    // Unlike /api/workspace/read which returns JSON, this serves the
    // actual file with the correct MIME type — so the browser can
    // display images, play audio, render HTML, etc.
    if (url.pathname === '/api/workspace/file' && method === 'GET') {
      const reqPath = url.searchParams.get('path');
      if (!reqPath) { json(res, 400, { error: 'Need path param' }); return true; }

      const wsRoot = path.resolve(core.WORKSPACE_DIR);
      const safe   = path.resolve(wsRoot, reqPath);
      if (!safe.startsWith(wsRoot + path.sep) && safe !== wsRoot) {
        json(res, 403, { error: 'Path outside workspace' });
        return true;
      }
      if (!fs.existsSync(safe) || !fs.statSync(safe).isFile()) {
        json(res, 404, { error: 'File not found' });
        return true;
      }

      const ext = path.extname(safe).toLowerCase();
      res.writeHead(200, {
        'Content-Type':        MIME[ext] || 'text/plain; charset=utf-8',
        'Content-Disposition': 'inline'
      });
      fs.createReadStream(safe).pipe(res);
      return true;
    }

    // ═════════════════════════════════════════════════════════════════
    // TERMINAL — Whitelisted command execution
    // ═════════════════════════════════════════════════════════════════

    // ── Execute a command ────────────────────────────────────────────
    // Body: { command: "git status" }
    //
    // How it works:
    //   1. Parse the command to extract the binary name
    //   2. Check if that binary is on the whitelist
    //   3. If allowed, run it inside the workspace directory
    //   4. Return { stdout, stderr, code }
    //
    // If the command isn't whitelisted, it returns an error message
    // (but still with status 200, so the UI can display it nicely).
    if (url.pathname === '/api/terminal/exec' && method === 'POST') {
      const body = JSON.parse(await readBody(req));
      if (!body.command || typeof body.command !== 'string') {
        json(res, 400, { error: 'Need command' });
        return true;
      }
      try {
        const parsed = cmdExec.parseCommand(body.command);
        if (!parsed.ok) {
          json(res, 200, { error: parsed.error });
          return true;
        }
        const result = await cmdExec.execCommand(body.command, core.WORKSPACE_DIR);
        json(res, 200, {
          stdout: result.stdout || '',
          stderr: result.stderr || '',
          code:   result.code
        });
      } catch (e) {
        json(res, 200, { error: e.message });
      }
      return true;
    }

    // ═════════════════════════════════════════════════════════════════
    // FOLDER BROWSING — Open Folder & directory navigation
    // ═════════════════════════════════════════════════════════════════

    // ── Open a folder as the new workspace root ──────────────────────
    // Body: { path: "C:\\Users\\dev\\my-project" }
    // Validates the path exists and is a directory, then sets it
    // as the active workspace root.
    if (url.pathname === '/api/workspace/open-folder' && method === 'POST') {
      const body = JSON.parse(await readBody(req));
      if (!body.path || typeof body.path !== 'string') {
        json(res, 400, { error: 'Need path' });
        return true;
      }
      try {
        const resolved = core.setWorkspaceRoot(body.path.trim());
        json(res, 200, {
          ok:   true,
          root: resolved,
          items: listWorkspaceTree(resolved)
        });
      } catch (e) {
        json(res, 400, { error: e.message });
      }
      return true;
    }

    // ── Browse a directory (for folder picker) ───────────────────────
    // Body: { path: "C:\\" } or { path: "" } for drives/root
    // Returns a flat list of entries (name, type, fullPath) so the
    // folder-picker UI can navigate the filesystem.
    if (url.pathname === '/api/workspace/browse' && method === 'POST') {
      const body = JSON.parse(await readBody(req));
      const reqPath = (body.path || '').trim();

      try {
        // Empty path or special "drives" request — list drive roots on Windows
        if (!reqPath || reqPath === '/') {
          if (process.platform === 'win32') {
            // List available drive letters
            const drives = [];
            for (let i = 65; i <= 90; i++) {
              const letter = String.fromCharCode(i) + ':\\';
              try {
                fs.accessSync(letter, fs.constants.R_OK);
                drives.push({ name: letter, type: 'directory', fullPath: letter });
              } catch (_) { /* drive not available */ }
            }
            json(res, 200, { path: '', items: drives, isRoot: true });
          } else {
            // Unix — list root
            const entries = fs.readdirSync('/', { withFileTypes: true })
              .filter(e => !e.name.startsWith('.'))
              .sort((a, b) => {
                if (a.isDirectory() !== b.isDirectory()) return a.isDirectory() ? -1 : 1;
                return a.name.localeCompare(b.name);
              })
              .map(e => ({
                name: e.name,
                type: e.isDirectory() ? 'directory' : 'file',
                fullPath: '/' + e.name
              }));
            json(res, 200, { path: '/', items: entries, isRoot: true });
          }
          return true;
        }

        const resolved = path.resolve(reqPath);
        if (!fs.existsSync(resolved) || !fs.statSync(resolved).isDirectory()) {
          json(res, 400, { error: 'Not a valid directory: ' + reqPath });
          return true;
        }

        const entries = fs.readdirSync(resolved, { withFileTypes: true })
          .filter(e => !e.name.startsWith('.'))
          .sort((a, b) => {
            if (a.isDirectory() !== b.isDirectory()) return a.isDirectory() ? -1 : 1;
            return a.name.localeCompare(b.name);
          })
          .slice(0, 200) // cap for performance
          .map(e => ({
            name:     e.name,
            type:     e.isDirectory() ? 'directory' : 'file',
            fullPath: path.join(resolved, e.name).replace(/\\/g, '/')
          }));

        const parentPath = path.dirname(resolved);
        json(res, 200, {
          path:   resolved.replace(/\\/g, '/'),
          parent: parentPath !== resolved ? parentPath.replace(/\\/g, '/') : null,
          items:  entries
        });
      } catch (e) {
        json(res, 400, { error: 'Browse error: ' + e.message });
      }
      return true;
    }

    // ── Get current workspace info ───────────────────────────────────
    if (url.pathname === '/api/workspace/info' && method === 'GET') {
      json(res, 200, {
        root: core.WORKSPACE_DIR,
        name: path.basename(core.WORKSPACE_DIR)
      });
      return true;
    }

    // ── Quick-access paths for folder browser ────────────────────────
    // Returns common user directories (Desktop, Documents, etc.)
    if (url.pathname === '/api/workspace/quick-paths' && method === 'GET') {
      const os = require('os');
      const home = os.homedir();
      const locations = [
        { name: 'Desktop', path: path.join(home, 'Desktop') },
        { name: 'Documents', path: path.join(home, 'Documents') },
        { name: 'Downloads', path: path.join(home, 'Downloads') },
        { name: 'Home', path: home }
      ];
      // Only return paths that exist
      const valid = locations
        .filter(loc => { try { return fs.existsSync(loc.path) && fs.statSync(loc.path).isDirectory(); } catch (_) { return false; } })
        .map(loc => ({ name: loc.name, path: loc.path.replace(/\\/g, '/') }));
      // Add current workspace
      if (core.WORKSPACE_DIR) {
        valid.unshift({ name: 'Current Workspace', path: core.WORKSPACE_DIR.replace(/\\/g, '/') });
      }
      json(res, 200, { locations: valid });
      return true;
    }

    // None of our routes matched
    return false;
  };
};
