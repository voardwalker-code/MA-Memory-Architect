// ── MA Workspace Tools ───────────────────────────────────────────────────────
// File I/O + web + command tools for task execution.
//
// HOW IT WORKS:
// When the AI wants to DO something (read a file, write code, search the
// web, run a command), it calls a "tool".  This file is the orchestrator
// that coordinates all those tools.
//
// Instead of having ALL the tool logic crammed into one giant file,
// we split it into focused modules in the ./tools/ folder:
//
//   tools-schemas.js  — Zod validation schemas (what params each tool expects)
//   tools-parser.js   — Extracts [TOOL:...] calls from LLM text output
//   tools-fs.js       — Workspace file operations (list, read, write, etc.)
//   tools-entity.js   — Entity creation and memory injection
//   tools-book.js     — Book chunk reading
//   tools-web.js      — Web search, fetch, command execution
//
// This file's job is simple:
//   1. Load each tool module
//   2. When executeToolCalls() is called, parse the text for tool calls,
//      then dispatch each call to the right module
//   3. Collect results and return them
//
// RESILIENCE:
// Each tool module is loaded with safeRequire() — if a module is missing
// or broken, the server still starts.  Tools from that module just won't
// be available (they'll return an error instead of crashing the server).
//
// EXPORTS (public API — same as the old monolith):
//   extractToolCalls(text)                — Parse text for tool calls
//   executeToolCalls(text, opts)           — Parse + execute all tool calls
//   executeNativeToolCalls(toolCalls, opts) — Execute pre-parsed native calls
//   formatToolResults(results)             — Format results for LLM context
//   stripToolCalls(text)                   — Remove tool blocks from text
//   ToolSchemas                            — The Zod schemas for all tools
// ─────────────────────────────────────────────────────────────────────────────
'use strict';

// ─────────────────────────────────────────────────────────────────────────────
// safeRequire(modulePath, label)
//
// Like require(), but returns null instead of crashing if the module is
// missing or broken.  This way one broken tool module doesn't take down
// every other tool.
//
//   modulePath — the path to require (e.g. './tools/tools-fs')
//   label      — a friendly name for log messages
// ─────────────────────────────────────────────────────────────────────────────
function safeRequire(modulePath, label) {
  try {
    return require(modulePath);
  } catch (err) {
    console.warn(`[MA-workspace-tools] ⚠ Could not load tool module "${label}": ${err.message}`);
    return null;
  }
}

// ── Load tool modules (resiliently) ─────────────────────────────────────────
const schemas = safeRequire('./tools/tools-schemas', 'schemas');
const parser  = safeRequire('./tools/tools-parser',  'parser');
const toolsFs = safeRequire('./tools/tools-fs',      'fs');
const entity  = safeRequire('./tools/tools-entity',  'entity');
const book    = safeRequire('./tools/tools-book',    'book');
const web     = safeRequire('./tools/tools-web',     'web');

// ── Re-export schemas and parser functions ──────────────────────────────────
// These are used directly by other MA modules (MA-tool-adapter, core-chat, etc.)
const ToolSchemas      = schemas ? schemas.ToolSchemas : {};
const extractToolCalls = parser  ? parser.extractToolCalls : () => [];
const stripToolCalls   = parser  ? parser.stripToolCalls   : (t) => t || '';

// ─────────────────────────────────────────────────────────────────────────────
// _dispatch(name, params, wp, opts)
//
// Routes a single tool call to the correct module function.
// This is the central switch that connects tool names to implementations.
//
// Think of it like a phone operator — when someone calls "ws_read",
// the operator connects them to the file-reading department.
//
//   name   — normalised tool name (e.g. "ws_read", "web_search")
//   params — validated parameters for the tool
//   wp     — workspace path (for file tools)
//   opts   — execution options (webFetchEnabled, cmdRunEnabled, etc.)
//   Returns: the tool's result string
// ─────────────────────────────────────────────────────────────────────────────
async function _dispatch(name, params, wp, opts) {
  const p = params;
  switch (name) {
    // ── File tools ──────────────────────────────────────────────────
    case 'ws_list':
      return toolsFs ? toolsFs.wsList(wp, p.path) : 'ws_list: file module not available';
    case 'ws_read':
      return toolsFs ? toolsFs.wsRead(wp, p.path) : 'ws_read: file module not available';
    case 'ws_write':
      return toolsFs ? toolsFs.wsWrite(wp, p.path, p.content) : 'ws_write: file module not available';
    case 'ws_append':
      return toolsFs ? toolsFs.wsAppend(wp, p.path, p.content) : 'ws_append: file module not available';
    case 'ws_delete':
      return toolsFs ? toolsFs.wsDelete(wp, p.path) : 'ws_delete: file module not available';
    case 'ws_mkdir':
      return toolsFs ? toolsFs.wsMkdir(wp, p.path) : 'ws_mkdir: file module not available';
    case 'ws_move':
      return toolsFs ? toolsFs.wsMove(wp, p.src, p.dst) : 'ws_move: file module not available';

    // ── Web tools ───────────────────────────────────────────────────
    case 'web_search':
      if (opts.webFetchEnabled === false) return 'web_search disabled';
      return web ? await web.webSearch(p.query) : 'web_search: web module not available';
    case 'web_fetch':
      if (opts.webFetchEnabled === false) return 'web_fetch disabled';
      if (web && web.isIntegrationBlocked(p.url, opts.integrationMode)) {
        return 'web_fetch blocked: integrationMode is off. Set integrationMode to "nekocore" to access localhost:3847 endpoints.';
      }
      return web ? await web.webFetch(p.url) : 'web_fetch: web module not available';

    // ── Command tool ────────────────────────────────────────────────
    case 'cmd_run':
      if (opts.cmdRunEnabled === false) return 'cmd_run disabled';
      return web ? await web.cmdRun(wp, p.cmd) : 'cmd_run: web module not available';

    // ── Memory tool ─────────────────────────────────────────────────
    case 'memory_search':
      if (opts.memorySearch) {
        const hits = opts.memorySearch(p.query, p.limit || 5);
        return hits.length
          ? hits.map(m => `- [${m.type || 'memory'}] ${(m.summary || m.content || '').slice(0, 300)}`).join('\n')
          : 'No matching memories found.';
      }
      return 'memory_search: memory module not available';

    // ── Entity tools ────────────────────────────────────────────────
    case 'entity_create':
      return entity ? entity.entityCreate(wp, p) : 'entity_create: entity module not available';
    case 'entity_inject_memory':
      return entity ? entity.entityInjectMemory(wp, p) : 'entity_inject_memory: entity module not available';

    // ── Book tools ──────────────────────────────────────────────────
    case 'book_list_chunks':
      return book ? book.bookListChunks(wp, p.bookId) : 'book_list_chunks: book module not available';
    case 'book_read_chunk':
      return book ? book.bookReadChunk(wp, p.bookId, p.index) : 'book_read_chunk: book module not available';

    default:
      return `Unknown tool: ${name}`;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// executeToolCalls(text, opts)
//
// The main tool execution pipeline:
//   1. Parse the LLM's text to find [TOOL:...] calls
//   2. For each call, validate and dispatch to the right handler
//   3. Collect and return all results
//
// If a tool call has a parse/validation error, the error is reported
// without crashing.  If a tool throws at runtime, the error is caught
// and reported gracefully.
//
//   text — the raw LLM response text containing tool calls
//   opts — execution options:
//     .workspacePath    — where workspace files live
//     .webFetchEnabled  — allow web tools? (default: true)
//     .cmdRunEnabled    — allow command execution? (default: true)
//     .integrationMode  — 'nekocore' or 'off'
//     .memorySearch     — function to search memories (optional)
//     .blockedTools     — Set of tool names blocked in current mode
//
//   Returns: array of { tool, result, ok }
// ─────────────────────────────────────────────────────────────────────────────
async function executeToolCalls(text, opts = {}) {
  const calls = extractToolCalls(text);
  if (!calls.length) return [];

  const wp = opts.workspacePath || '';
  const results = [];

  for (const call of calls) {
    // If the parser found an error (bad JSON, schema mismatch), report it
    if (call.error) {
      results.push({ tool: call.name, result: call.error, ok: false });
      continue;
    }
    // Block tools restricted by current mode (e.g. Chat Mode)
    if (opts.blockedTools && opts.blockedTools.has(call.name)) {
      results.push({ tool: call.name, result: `I'm currently in Chat Mode and can't use ${call.name}. Please switch to Work Mode to use this tool.`, ok: false });
      continue;
    }
    try {
      const result = await _dispatch(call.name, call.params, wp, opts);
      results.push({ tool: call.name, result, ok: true });
    } catch (e) {
      results.push({ tool: call.name, result: `Error: ${e.message}`, ok: false });
    }
  }
  return results;
}

// ─────────────────────────────────────────────────────────────────────────────
// executeNativeToolCalls(toolCalls, opts)
//
// Same as executeToolCalls but for pre-parsed native function calls
// (from APIs that support structured tool use, like Anthropic).
// Instead of parsing text, it takes an array of { id, name, input }.
//
//   toolCalls — array of { id, name, input } from the API
//   opts      — same options as executeToolCalls
//   Returns: array of { id, tool, result, ok }
// ─────────────────────────────────────────────────────────────────────────────
async function executeNativeToolCalls(toolCalls, opts = {}) {
  if (!toolCalls || !toolCalls.length) return [];

  const wp = opts.workspacePath || '';
  const results = [];

  for (const call of toolCalls) {
    const name = call.name.toLowerCase().replace(/-/g, '_');
    const schema = ToolSchemas[name];
    if (!schema) {
      results.push({ id: call.id, tool: name, result: `Unknown tool: ${name}`, ok: false });
      continue;
    }

    // Validate the parameters against the Zod schema
    const validation = schema.safeParse(call.input || {});
    if (!validation.success) {
      const issues = validation.error?.issues || [];
      const msgs = issues.map(i => `${(i.path || []).join('.') || 'param'}: ${i.message}`);
      results.push({ id: call.id, tool: name, result: `Schema error: ${msgs.join('; ')}`, ok: false });
      continue;
    }

    // Block tools restricted by current mode
    if (opts.blockedTools && opts.blockedTools.has(name)) {
      results.push({ id: call.id, tool: name, result: `I'm currently in Chat Mode and can't use ${name}. Please switch to Work Mode to use this tool.`, ok: false });
      continue;
    }

    try {
      const result = await _dispatch(name, validation.data, wp, opts);
      results.push({ id: call.id, tool: name, result, ok: true });
    } catch (e) {
      results.push({ id: call.id, tool: name, result: `Error: ${e.message}`, ok: false });
    }
  }
  return results;
}

// ─────────────────────────────────────────────────────────────────────────────
// formatToolResults(results)
//
// Turns tool results into a text block the AI can read.
// Each result is wrapped in [TOOL_RESULT: name] ... [/TOOL_RESULT] tags.
// Errors get an "ERROR:" prefix so the AI knows something went wrong.
//
//   results — array of { tool, result, ok } from executeToolCalls
//   Returns: formatted string
// ─────────────────────────────────────────────────────────────────────────────
function formatToolResults(results) {
  if (!results.length) return '';
  return results.map(r =>
    `[TOOL_RESULT: ${r.tool}]\n${r.ok ? r.result : 'ERROR: ' + r.result}\n[/TOOL_RESULT]`
  ).join('\n\n');
}

// ── Exports ─────────────────────────────────────────────────────────────────
// Same public API as the original monolith — nothing changes for consumers.
module.exports = {
  extractToolCalls,
  executeToolCalls,
  executeNativeToolCalls,
  formatToolResults,
  stripToolCalls,
  ToolSchemas,
  getPreEditSnapshots: toolsFs ? toolsFs.getPreEditSnapshots : () => ({}),
  clearPreEditSnapshots: toolsFs ? toolsFs.clearPreEditSnapshots : () => {}
};
