// ── Route Module: Chat ──────────────────────────────────────────────────────
//
// This module handles everything related to chatting with the AI.
// Think of it like the "conversation room" of the server — it's where
// messages come in and answers go out.
//
// There are TWO ways to chat:
//   1. Streaming (SSE) — The answer arrives piece by piece, like watching
//      someone type in real time.  Great for long answers.
//   2. Non-streaming   — The whole answer comes back at once, like getting
//      a letter in the mail.  Simpler but slower-feeling.
//
// This module also manages "chat sessions" — saved conversations you can
// come back to later, like bookmarks for your chats.
//
// ── Endpoints ───────────────────────────────────────────────────────────────
//   POST /api/chat/stream       — Stream a chat response via Server-Sent Events
//   POST /api/chat              — Get a full chat response in one shot
//   GET  /api/chat/sessions     — List all saved conversations (newest first)
//   GET  /api/chat/session/:id  — Load a single saved conversation by its ID
//   POST /api/chat/session      — Save or update a conversation
//   GET  /api/chat/history      — Legacy stub (old clients may still call this)
//   POST /api/chat/history      — Legacy stub (old clients may still call this)
//
// ── What this module needs ──────────────────────────────────────────────────
//   deps.core — The brain of MA (handles chat logic, knows where config lives)
// ─────────────────────────────────────────────────────────────────────────────
'use strict';

const fs   = require('fs');
const path = require('path');

// json()     — send a JSON response with a status code
// readBody() — read the full body of a POST request
const { json, readBody, sseStreamHeaders } = require('../infra/infra-http-utils');

// ─────────────────────────────────────────────────────────────────────────────
// createChatRoutes(deps)
//
// Called once when the server starts.  Receives the services it needs,
// and returns a handler function that will be called for every request.
//
// The handler returns:
//   true  → "I handled this request, stop checking other modules"
//   false → "Not my route, let the next module try"
// ─────────────────────────────────────────────────────────────────────────────
module.exports = function createChatRoutes(deps) {
  const { core } = deps;

  // Figure out where chat session files are stored on disk.
  // They live next to the config file, inside a "chat-sessions" folder.
  const sessionsDir = path.join(path.dirname(core.CONFIG_PATH), 'chat-sessions');

  return async function handle(url, method, req, res) {

    // ── 1. Streaming chat (Server-Sent Events) ──────────────────────
    // The client opens a long-lived connection and the server pushes
    // events as the AI works through the problem step by step.
    //
    // Events sent:
    //   "step"     → one task step completed (index, total, description)
    //   "activity" → extra info (classifier ran, tool used, etc.)
    //   "done"     → final result object
    //   "error"    → something went wrong
    //   "close"    → stream is finished, client can disconnect
    if (url.pathname === '/api/chat/stream' && method === 'POST') {
      const body = JSON.parse(await readBody(req));

      // Tell the browser "this is a stream, keep the connection open"
      res.writeHead(200, sseStreamHeaders({
        'Access-Control-Allow-Origin': '*'
      }));

      // Helper: write one SSE frame.
      // SSE format is:  event: <name>\ndata: <json>\n\n
      const sendEvent = (event, data) => {
        res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
      };

      try {
        const result = await core.handleChat({
          message:     body.message,
          history:     body.history,
          attachments: body.attachments,

          // Progress callback — fires once per task step
          onStep: async (stepInfo) => {
            sendEvent('step', {
              stepIndex:   stepInfo.stepIndex,
              stepTotal:   stepInfo.stepTotal,
              description: stepInfo.description,
              summary:     (stepInfo.output || '').slice(0, 300)
            });
          },

          // Activity callback — fires for classifier, tool use, search, etc.
          onActivity: async (category, detail, data) => {
            sendEvent('activity', {
              category, detail, data,
              ts: new Date().toISOString()
            });
          }
        });

        // Send the completed result
        sendEvent('done', result);
      } catch (e) {
        sendEvent('error', { error: e.message });
      }

      // Always close the stream cleanly
      res.write('event: close\ndata: {}\n\n');
      res.end();
      return true;
    }

    // ── 2. Non-streaming chat ────────────────────────────────────────
    // Simpler version: send a message, wait, get the full answer back.
    if (url.pathname === '/api/chat' && method === 'POST') {
      const body = JSON.parse(await readBody(req));
      const result = await core.handleChat({
        message:     body.message,
        history:     body.history,
        attachments: body.attachments
      });
      json(res, 200, result);
      return true;
    }

    // ── 3. List saved chat sessions ──────────────────────────────────
    // Returns an array of { id, createdAt, updatedAt, preview } sorted
    // newest-first.  The "preview" is the first ~80 characters of the
    // first user message, so you can tell conversations apart.
    if (url.pathname === '/api/chat/sessions' && method === 'GET') {
      if (!fs.existsSync(sessionsDir)) {
        json(res, 200, { sessions: [] });
        return true;
      }
      const files = fs.readdirSync(sessionsDir).filter(f => f.endsWith('.json'));
      const sessions = [];
      for (const f of files) {
        try {
          const raw = JSON.parse(fs.readFileSync(path.join(sessionsDir, f), 'utf8'));
          sessions.push({
            id:        raw.id,
            createdAt: raw.createdAt,
            updatedAt: raw.updatedAt,
            preview:   raw.preview || ''
          });
        } catch { /* skip corrupt session files */ }
      }
      sessions.sort((a, b) =>
        (b.updatedAt || b.createdAt || '').localeCompare(a.updatedAt || a.createdAt || '')
      );
      json(res, 200, { sessions });
      return true;
    }

    // ── 4. Load a single session by ID ───────────────────────────────
    // URL looks like: /api/chat/session/ses_1234567890
    if (url.pathname.startsWith('/api/chat/session/') && method === 'GET') {
      const id = decodeURIComponent(url.pathname.slice('/api/chat/session/'.length));
      // Safety: reject IDs that contain path separators (no directory traversal)
      if (!id || /[\/\\]/.test(id)) { json(res, 400, { error: 'invalid id' }); return true; }
      const fp = path.join(sessionsDir, id + '.json');
      if (!fs.existsSync(fp)) { json(res, 404, { error: 'session not found' }); return true; }
      try {
        const data = JSON.parse(fs.readFileSync(fp, 'utf8'));
        json(res, 200, data);
      } catch {
        json(res, 500, { error: 'corrupt session file' });
      }
      return true;
    }

    // ── 5. Save or update a session ──────────────────────────────────
    // Send { id?, messages[] }.  If id is omitted, a new one is created.
    if (url.pathname === '/api/chat/session' && method === 'POST') {
      const body = JSON.parse(await readBody(req));
      fs.mkdirSync(sessionsDir, { recursive: true });
      const id = body.id || ('ses_' + Date.now());
      if (/[\/\\]/.test(id)) { json(res, 400, { error: 'invalid id' }); return true; }
      const fp = path.join(sessionsDir, id + '.json');

      // Try to load existing session data (so we can preserve createdAt)
      let existing = {};
      if (fs.existsSync(fp)) {
        try { existing = JSON.parse(fs.readFileSync(fp, 'utf8')); } catch { /* overwrite corrupt */ }
      }

      const messages = body.messages || existing.messages || [];
      const preview  = messages.find(m => m.role === 'user')?.content?.slice(0, 80) || '';
      const session  = {
        id,
        createdAt: existing.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        preview,
        messages
      };
      fs.writeFileSync(fp, JSON.stringify(session, null, 2));
      json(res, 200, { ok: true, id, preview });
      return true;
    }

    // ── 6. Legacy history stubs ──────────────────────────────────────
    // These endpoints are no longer used, but old cached browser tabs
    // might still call them.  We return harmless empty data so they
    // don't get an error.
    if (url.pathname === '/api/chat/history' && method === 'GET') {
      json(res, 200, { messages: [] });
      return true;
    }
    if (url.pathname === '/api/chat/history' && method === 'POST') {
      json(res, 200, { ok: true, saved: 0 });
      return true;
    }

    // None of our routes matched — let the next module try
    return false;
  };
};
