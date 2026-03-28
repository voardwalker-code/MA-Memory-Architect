// ── Route Module: Static Files & User Guide ──────────────────────────────────
//
// This module serves two things:
//
// 1. USER GUIDE — Renders the USER-GUIDE.md file as a nice HTML page.
//    When you visit /user-guide in the browser, you get a readable version
//    of the documentation instead of raw markdown.
//
// 2. STATIC FILES — Serves the browser client (HTML, CSS, JavaScript, images)
//    from the FrontEnd/ folder.  This is what makes the web UI work.
//    When you visit http://localhost:3850/ in your browser, this module
//    sends you the MA-index.html file and all its assets.
//
// IMPORTANT: This module should be loaded LAST in the route chain because
// the static file handler is a "catch-all" — it tries to match ANY URL
// against files in FrontEnd/.  If it ran first, it would swallow requests
// meant for the API.
//
// ── Endpoints ───────────────────────────────────────────────────────────────
//   GET /user-guide — Render USER-GUIDE.md as HTML
//   GET /*          — Serve static files from FrontEnd/ (catch-all)
//
// ── What this module needs ──────────────────────────────────────────────────
//   deps.core                 — MA-core (MA_ROOT for finding USER-GUIDE.md)
//   deps.renderMarkdownToHtml — Function from MA-markdown (converts .md → HTML)
//   deps.CLIENT_DIR           — Absolute path to the FrontEnd/ folder
// ─────────────────────────────────────────────────────────────────────────────
'use strict';

const fs   = require('fs');
const path = require('path');

// MIME — lookup table for file extensions → content types
//        (e.g. ".js" → "application/javascript")
const { MIME } = require('../infra/infra-http-utils');

// ─────────────────────────────────────────────────────────────────────────────
// createStaticRoutes(deps)
//
// Called once when the server starts.  Returns a handler that checks every
// incoming request.  Returns true if handled, false if not ours.
//
// NOTE: This handler always returns true because it acts as the final
// catch-all.  If the requested file doesn't exist, it returns a 404.
// ─────────────────────────────────────────────────────────────────────────────
module.exports = function createStaticRoutes(deps) {
  const { core, renderMarkdownToHtml, CLIENT_DIR } = deps;

  return async function handle(url, method, _req, res) {

    // ── User Guide ───────────────────────────────────────────────────
    // Reads the USER-GUIDE.md file from the MA root folder, converts
    // it to HTML using the markdown renderer, and sends it as a
    // full HTML page.
    if (url.pathname === '/user-guide' && method === 'GET') {
      const guidePath = path.join(core.MA_ROOT, 'USER-GUIDE.md');
      if (fs.existsSync(guidePath)) {
        const md   = fs.readFileSync(guidePath, 'utf8');
        const html = renderMarkdownToHtml(md);
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(html);
      } else {
        res.writeHead(404);
        res.end('User guide not found');
      }
      return true;
    }

    // ── Static file serving ──────────────────────────────────────────
    // This is the catch-all.  It maps the URL to a file in FrontEnd/:
    //   /              → FrontEnd/MA-index.html  (the main page)
    //   /css/style.css → FrontEnd/css/style.css
    //   /js/app.js     → FrontEnd/js/app.js
    //   etc.
    //
    // Security: We check that the resolved path stays inside CLIENT_DIR
    // to prevent directory traversal attacks (e.g. "/../../../etc/passwd").

    // If the URL is just "/", serve the main page
    const filePath = url.pathname === '/' ? '/MA-index.html' : url.pathname;

    // Resolve the path against the client directory
    const resolved = path.resolve(CLIENT_DIR, '.' + filePath);

    // Safety check: don't serve files outside the client folder
    if (!resolved.startsWith(CLIENT_DIR)) {
      res.writeHead(403);
      res.end('Forbidden');
      return true;
    }

    // If the file exists, serve it with the right content type
    if (fs.existsSync(resolved) && fs.statSync(resolved).isFile()) {
      const ext = path.extname(resolved).toLowerCase();
      res.writeHead(200, {
        'Content-Type': MIME[ext] || 'application/octet-stream'
      });
      fs.createReadStream(resolved).pipe(res);
      return true;
    }

    // File not found — return 404
    // (We still return true because this is the catch-all; no other
    // module should try to handle this request.)
    res.writeHead(404);
    res.end('Not found');
    return true;
  };
};
