// ── Route Module: Commands & Whitelist ───────────────────────────────────────
//
// This module handles two related things:
//
// 1. SLASH COMMANDS — The list of commands the user can type in the chat
//    (like /health, /memory stats, /projects, etc.) and the endpoint that
//    actually runs them.
//
// 2. COMMAND WHITELIST — A safety system that controls which terminal
//    commands the AI is allowed to run.  Think of it like a guest list
//    at a party: only commands on the list get in.
//
// Why are these together?  Both are about "commands" — one is the catalog
// of what the user can type, and the other is the security list of what
// the AI can execute.
//
// ── Slash Command endpoints ─────────────────────────────────────────────────
//   GET  /api/commands — Get the catalog of available slash commands
//   POST /api/slash    — Execute a slash command.  Body: { command: "/health" }
//
// ── Whitelist endpoints ─────────────────────────────────────────────────────
//   GET  /api/whitelist        — View the current command whitelist
//   POST /api/whitelist/add    — Allow a new command.  Body: { binary, subcommands? }
//   POST /api/whitelist/remove — Remove a command.  Body: { binary }
//   POST /api/whitelist/reset  — Reset whitelist back to defaults
//
// ── What this module needs ──────────────────────────────────────────────────
//   deps.handleSlashCommand — Function from MA-slash-commands (runs /commands)
//   deps.cmdExec            — MA-cmd-executor (whitelist management)
// ─────────────────────────────────────────────────────────────────────────────
'use strict';

// json()     — send a JSON response with a status code
// readBody() — read the full body of a POST request
const { json, readBody } = require('../infra/infra-http-utils');

// ─────────────────────────────────────────────────────────────────────────────
// createCommandRoutes(deps)
//
// Called once when the server starts.  Returns a handler that checks every
// incoming request.  Returns true if handled, false if not ours.
// ─────────────────────────────────────────────────────────────────────────────
module.exports = function createCommandRoutes(deps) {
  const { handleSlashCommand, cmdExec } = deps;

  return async function handle(url, method, req, res) {

    // ═════════════════════════════════════════════════════════════════
    // SLASH COMMANDS — The command catalog + execution
    // ═════════════════════════════════════════════════════════════════

    // ── Command catalog ──────────────────────────────────────────────
    // Returns a big array of { cmd, desc, usage } objects that the
    // client uses to show autocomplete suggestions and help text.
    if (url.pathname === '/api/commands' && method === 'GET') {
      json(res, 200, [
        { cmd: '/health',           desc: 'Run system health scan',           usage: '/health' },
        { cmd: '/memory stats',     desc: 'Show memory statistics',           usage: '/memory stats' },
        { cmd: '/memory search',    desc: 'Search memories',                  usage: '/memory search <query>' },
        { cmd: '/knowledge',        desc: 'List knowledge docs',              usage: '/knowledge' },
        { cmd: '/knowledge',        desc: 'Show a knowledge doc',             usage: '/knowledge <name>' },
        { cmd: '/ingest',           desc: 'Ingest a file into memory',        usage: '/ingest <filepath>' },
        { cmd: '/config',           desc: 'Show current LLM config',          usage: '/config' },
        { cmd: '/projects',         desc: 'List all projects',                usage: '/projects' },
        { cmd: '/project open',     desc: 'Resume a project',                 usage: '/project open <id>' },
        { cmd: '/project close',    desc: 'Close a project',                  usage: '/project close <id>' },
        { cmd: '/project status',   desc: 'Show project status',              usage: '/project status <id>' },
        { cmd: '/whitelist',        desc: 'Show allowed commands',            usage: '/whitelist' },
        { cmd: '/whitelist add',    desc: 'Allow a command',                  usage: '/whitelist add <binary> [sub1,sub2,...]' },
        { cmd: '/whitelist remove', desc: 'Remove a command',                 usage: '/whitelist remove <binary>' },
        { cmd: '/whitelist reset',  desc: 'Reset to defaults',               usage: '/whitelist reset' },
        { cmd: '/pulse',            desc: 'Pulse timer status',               usage: '/pulse [status|start|stop|log]' },
        { cmd: '/chores',           desc: 'View/manage chores',              usage: '/chores [list|add|remove|run]' },
        { cmd: '/chores add',       desc: 'Add a recurring chore',           usage: '/chores add <name> | <description>' },
        { cmd: '/chores remove',    desc: 'Remove a chore',                  usage: '/chores remove <id>' },
        { cmd: '/models',           desc: 'View model roster',               usage: '/models [list|add|remove|perf|route|research]' },
        { cmd: '/models add',       desc: 'Add a model to roster',           usage: '/models add <provider> <model> [endpoint]' },
        { cmd: '/models remove',    desc: 'Remove a model',                  usage: '/models remove <id>' },
        { cmd: '/models perf',      desc: 'Show model performance',          usage: '/models perf' },
        { cmd: '/models research',  desc: 'Research a model\'s capabilities', usage: '/models research <model>' },
        { cmd: '/worklog',          desc: 'Show MA session worklog',          usage: '/worklog' }
      ]);
      return true;
    }

    // ── Execute a slash command ───────────────────────────────────────
    // Body: { command: "/health" }
    // The handleSlashCommand function parses the command and runs it.
    if (url.pathname === '/api/slash' && method === 'POST') {
      const body   = JSON.parse(await readBody(req));
      const result = await handleSlashCommand(body.command || '');
      json(res, 200, result);
      return true;
    }

    // ═════════════════════════════════════════════════════════════════
    // WHITELIST — Security controls for terminal commands
    // ═════════════════════════════════════════════════════════════════

    // ── View the whitelist ───────────────────────────────────────────
    // Returns the full whitelist object: { "git": ["status","log"], "ls": true, ... }
    if (url.pathname === '/api/whitelist' && method === 'GET') {
      json(res, 200, cmdExec.getWhitelist());
      return true;
    }

    // ── Add a command to the whitelist ───────────────────────────────
    // Body: { binary: "docker", subcommands: ["ps", "images"] }
    // If subcommands is null/omitted, ALL subcommands are allowed.
    if (url.pathname === '/api/whitelist/add' && method === 'POST') {
      const body = JSON.parse(await readBody(req));
      if (!body.binary) { json(res, 400, { error: 'Need binary name' }); return true; }
      try {
        const result = cmdExec.whitelistAdd(body.binary, body.subcommands ?? null);
        json(res, 200, { ok: true, ...result });
      } catch (e) {
        json(res, 400, { error: e.message });
      }
      return true;
    }

    // ── Remove a command from the whitelist ──────────────────────────
    // Body: { binary: "docker" }
    if (url.pathname === '/api/whitelist/remove' && method === 'POST') {
      const body = JSON.parse(await readBody(req));
      if (!body.binary) { json(res, 400, { error: 'Need binary name' }); return true; }
      try {
        const result = cmdExec.whitelistRemove(body.binary);
        json(res, 200, { ok: true, ...result });
      } catch (e) {
        json(res, 400, { error: e.message });
      }
      return true;
    }

    // ── Reset the whitelist to defaults ──────────────────────────────
    // Puts back the original safe commands (git, ls, cat, etc.)
    if (url.pathname === '/api/whitelist/reset' && method === 'POST') {
      const result = cmdExec.whitelistReset();
      json(res, 200, { ok: true, ...result });
      return true;
    }

    // None of our routes matched
    return false;
  };
};
