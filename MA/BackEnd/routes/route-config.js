// ── Route Module: Config & Mode ─────────────────────────────────────────────
//
// This module handles the server's settings — like which AI model to use,
// which provider to talk to (OpenAI, Anthropic, Ollama, etc.), and whether
// the system is in "chat" mode or "work" mode.
//
// Think of it like the "settings page" of the server.
//
// ── Mode ────────────────────────────────────────────────────────────────────
// MA has two modes:
//   • "chat" — Just a conversation.  No tools, no file access.
//   • "work" — Full power.  The AI can use tools, read/write files, etc.
//
// ── Config ──────────────────────────────────────────────────────────────────
// The config tells MA how to reach the AI:
//   • type     — which provider (openai, anthropic, ollama, etc.)
//   • endpoint — the URL to send requests to
//   • model    — which model to use (gpt-4, claude-3, llama3, etc.)
//   • apiKey   — the secret key to authenticate (never shown in full)
//
// ── Endpoints ───────────────────────────────────────────────────────────────
//   GET  /api/mode   — Check current mode ("chat" or "work")
//   POST /api/mode   — Switch mode.  Body: { mode: "chat" | "work" }
//   GET  /api/config — Read the current LLM configuration
//   POST /api/config — Save new LLM configuration
//
// ── What this module needs ──────────────────────────────────────────────────
//   deps.core — MA-core (getMode, setMode, getConfig, setConfig, CONFIG_PATH)
// ─────────────────────────────────────────────────────────────────────────────
'use strict';

const fs = require('fs');

// json()     — send a JSON response with a status code
// readBody() — read the full body of a POST request
const { json, readBody } = require('../infra/infra-http-utils');

// ─────────────────────────────────────────────────────────────────────────────
// createConfigRoutes(deps)
//
// Called once when the server starts.  Returns a handler that checks every
// incoming request.  Returns true if handled, false if not ours.
// ─────────────────────────────────────────────────────────────────────────────
module.exports = function createConfigRoutes(deps) {
  const { core } = deps;

  return async function handle(url, method, req, res) {

    // ── Mode: read ───────────────────────────────────────────────────
    // Returns { mode: "chat" } or { mode: "work" }
    if (url.pathname === '/api/mode' && method === 'GET') {
      json(res, 200, { mode: core.getMode() });
      return true;
    }

    // ── Mode: write ──────────────────────────────────────────────────
    // Body must be { mode: "chat" } or { mode: "work" }.
    // Anything else gets a 400 error.
    if (url.pathname === '/api/mode' && method === 'POST') {
      const body = JSON.parse(await readBody(req));
      const m = String(body.mode || '').toLowerCase();
      if (m !== 'chat' && m !== 'work') {
        json(res, 400, { error: 'mode must be "chat" or "work"' });
        return true;
      }
      core.setMode(m);
      json(res, 200, { ok: true, mode: core.getMode() });
      return true;
    }

    // ── Config: read ─────────────────────────────────────────────────
    // Returns all settings the client needs to render the config panel.
    // API key is always masked ("********") unless ?revealKey=1 is set.
    if (url.pathname === '/api/config' && method === 'GET') {
      const config  = core.getConfig();
      const hasFile = fs.existsSync(core.CONFIG_PATH);
      const revealKey = url.searchParams.get('revealKey') === '1';

      // If core hasn't loaded a config yet, try reading the file directly
      let fileData = null;
      if (hasFile && !config) {
        try { fileData = JSON.parse(fs.readFileSync(core.CONFIG_PATH, 'utf8')); } catch (_) {}
      }

      const src = config || fileData;
      const key = String(src?.apiKey || src?.key || '').trim();
      const hasApiKey = !!key;

      json(res, 200, {
        configured:      !!config,
        hasFile,
        type:            src?.type || null,
        model:           src?.model || null,
        endpoint:        src?.endpoint || null,
        maxTokens:       src?.maxTokens || 12288,
        vision:          src?.vision || false,
        workspacePath:   src?.workspacePath || core.WORKSPACE_DIR,
        integrationMode: src?.integrationMode === 'nekocore' ? 'nekocore' : 'off',
        capabilities:    src?.capabilities || null,
        hasApiKey,
        apiKeyMasked:    hasApiKey ? '********' : '',
        memoryLimit:     src?.memoryLimit || 6,
        memoryRecall:    src?.memoryRecall !== false,
        taskBudgetMultiplier: src?.taskBudgetMultiplier || 1,
        // Only include the real key if the client explicitly asked for it
        ...(revealKey && hasApiKey ? { apiKey: key } : {})
      });
      return true;
    }

    // ── Config: write ────────────────────────────────────────────────
    // Validates and saves the LLM configuration.  Requires at minimum:
    //   { type, endpoint, model }
    // Optional fields: apiKey, maxTokens, vision, workspacePath, etc.
    if (url.pathname === '/api/config' && method === 'POST') {
      const body = JSON.parse(await readBody(req));
      if (!body.type || !body.endpoint || !body.model) {
        json(res, 400, { error: 'Need type, endpoint, model' });
        return true;
      }

      // ── Token limits ──────────────────────────────────────────────
      const maxTokens      = parseInt(body.maxTokens, 10);
      const thinkingBudget = parseInt(body.capabilities?.thinkingBudget, 10);

      // Anthropic's "extended thinking" feature needs at least 1024 tokens.
      // If enabled we default to 4096 as a reasonable starting point.
      const minThinkingTokens = (body.type === 'anthropic' && body.capabilities?.extendedThinking === true)
        ? Math.max(1024, thinkingBudget > 0 ? thinkingBudget : 4096)
        : 1024;

      const normalizedMaxTokens = (maxTokens > 0 && maxTokens <= 1000000) ? maxTokens : 12288;

      // ── API key handling ──────────────────────────────────────────
      // If the client sends "********" (the masked placeholder), keep
      // the existing key instead of overwriting it with asterisks.
      const existingConfig = core.getConfig();
      const incomingKey    = String(body.apiKey || '').trim();
      const apiKey = incomingKey && incomingKey !== '********'
        ? incomingKey
        : (existingConfig?.apiKey || '');

      // ── Memory & integration settings ─────────────────────────────
      const memoryLimit    = Math.min(50, Math.max(6, parseInt(body.memoryLimit, 10) || 6));
      const integrationMode = String(body.integrationMode || 'off').toLowerCase() === 'nekocore'
        ? 'nekocore' : 'off';
      const taskBudgetMultiplier = Math.max(0.25, Math.min(10, parseFloat(body.taskBudgetMultiplier) || 1));

      // Save everything
      core.setConfig({
        type:            body.type,
        endpoint:        body.endpoint,
        apiKey,
        model:           body.model,
        maxTokens:       Math.max(normalizedMaxTokens, minThinkingTokens),
        vision:          body.vision === true,
        workspacePath:   body.workspacePath || '',
        integrationMode,
        memoryLimit,
        memoryRecall:    body.memoryRecall !== false,
        taskBudgetMultiplier,
        ...(body.capabilities ? { capabilities: body.capabilities } : {})
      });

      json(res, 200, { ok: true });
      return true;
    }

    // None of our routes matched
    return false;
  };
};
