// ── Tool Parser ──────────────────────────────────────────────────────────────
//
// Extracts tool calls from LLM text output and validates them.
//
// HOW IT WORKS:
// When the AI responds, it can include tool calls in its text like:
//   [TOOL:ws_read {"path":"myfile.js"}]
// or block-style for writing files:
//   [TOOL:ws_write {"path":"hello.js"}]
//   console.log("hello");
//   [/TOOL]
//
// This module scans the text for those patterns, parses out the tool name
// and parameters, validates the parameters against Zod schemas, and returns
// a clean list of tool calls ready to execute.
//
// It handles THREE formats (from newest to oldest):
//   1. BLOCK   — [TOOL:ws_write {...}]\ncontent\n[/TOOL]  (for file writes)
//   2. INLINE  — [TOOL:tool_name {...}]                   (most tools)
//   3. LEGACY  — [TOOL: name; raw params]                 (old format)
//
// The parser runs three passes so blocks are found first and inline/legacy
// don't accidentally match things inside a block.
//
// WHAT IT EXPORTS:
//   extractToolCalls(text)  — Parse text → array of {name, params, error?}
//   stripToolCalls(text)    — Remove all tool blocks from text
//
// USED BY: MA-workspace-tools.js (the orchestrator calls these)
// ─────────────────────────────────────────────────────────────────────────────
'use strict';

const { ToolSchemas } = require('./tools-schemas');

// ─────────────────────────────────────────────────────────────────────────────
// Regex patterns for finding tool calls in text
//
// BLOCK_RE  — Matches block-format tools (ws_write / ws_append only)
//             [TOOL:ws_write {"path":"f"}]
//             file content here
//             [/TOOL]
//
// INLINE_RE — Matches single-line tools
//             [TOOL:ws_read {"path":"f"}]
//
// LEGACY_RE — Matches the old semicolon format
//             [TOOL: ws_read; myfile.js]
//
// STRIP_RE  — Matches ANY tool pattern (used for removing them from text)
// ─────────────────────────────────────────────────────────────────────────────
const BLOCK_RE  = /\[TOOL:(ws[-_]write|ws[-_]append)\s*(\{[\s\S]*?\})?\s*\]\n?([\s\S]*?)\[\s*\/\s*TOOL\s*\]/gi;
const INLINE_RE = /\[TOOL:(\w[\w-]*)\s*(\{[\s\S]*?\})?\s*\]/gi;
const LEGACY_RE = /\[\s*TOOL\s*:\s*(\w[\w-]*)\s*;\s*([\s\S]*?)\s*\]/gi;
const STRIP_RE  = /\[TOOL:[\s\S]*?\[\s*\/\s*TOOL\s*\]|\[TOOL:\w[\w-]*\s*(?:\{[\s\S]*?\})?\s*\]|\[\s*TOOL\s*:\s*\w[\w-]*[\s\S]*?\]/gi;

// ─────────────────────────────────────────────────────────────────────────────
// _preCleanToolText(text)
//
// Sometimes the AI wraps tool calls in code fences like:
//   ```json
//   [TOOL:ws_read {"path":"f"}]
//   ```
// This strips those code fences so the real parser can find the tools.
// ─────────────────────────────────────────────────────────────────────────────
function _preCleanToolText(text) {
  if (!text) return text;
  return text.replace(/```[\w]*\s*(\[\s*TOOL[\s\S]*?(?:\[\s*\/\s*TOOL\s*\]|\]))\s*```/gi, '$1');
}

// ─────────────────────────────────────────────────────────────────────────────
// _normName(n)
//
// Normalises a tool name: lowercase and replace dashes with underscores.
// So "ws-read" and "WS_READ" both become "ws_read".
// ─────────────────────────────────────────────────────────────────────────────
function _normName(n) { return n.toLowerCase().replace(/-/g, '_'); }

// ─────────────────────────────────────────────────────────────────────────────
// _parseJSON(raw)
//
// Tries to parse a JSON string.  Returns the parsed object, or null
// if parsing fails (instead of throwing an error).
// ─────────────────────────────────────────────────────────────────────────────
function _parseJSON(raw) {
  if (!raw) return {};
  try { return JSON.parse(raw); } catch { return null; }
}

// ─────────────────────────────────────────────────────────────────────────────
// _overlaps(pos, len, ranges)
//
// Checks if a text region overlaps with any already-matched regions.
// This prevents the inline parser from re-matching something the block
// parser already found.
//
//   pos    — start position of the region
//   len    — length of the region
//   ranges — array of [start, end] pairs already matched
// ─────────────────────────────────────────────────────────────────────────────
function _overlaps(pos, len, ranges) {
  const end = pos + len;
  for (const [s, e] of ranges) {
    if (pos >= s && pos < e) return true;
    if (end > s && end <= e) return true;
    if (pos <= s && end >= e) return true;
  }
  return false;
}

// ─────────────────────────────────────────────────────────────────────────────
// _validate(name, raw, blockContent)
//
// Validates tool parameters against the Zod schema for that tool.
// For block tools (ws_write/ws_append), the file content comes from the
// block body, not the JSON params.
//
//   name         — normalised tool name (e.g. "ws_read")
//   raw          — parsed JSON parameters
//   blockContent — the text between [TOOL:] and [/TOOL] (for writes)
//   Returns: { ok: true, data } or { ok: false, error }
// ─────────────────────────────────────────────────────────────────────────────
function _validate(name, raw, blockContent) {
  const schema = ToolSchemas[name];
  if (!schema) return { ok: false, error: `Unknown tool: ${name}` };

  const params = { ...raw };
  if (blockContent !== undefined && (name === 'ws_write' || name === 'ws_append')) {
    params.content = blockContent;
  }

  const result = schema.safeParse(params);
  if (!result.success) {
    const issues = result.error?.issues || result.error?.errors || [];
    const msgs = issues.map(i => `${(i.path || []).join('.') || 'param'}: ${i.message}`);
    return { ok: false, error: `${name} schema error: ${msgs.join('; ')}. Expected: ${JSON.stringify(Object.keys(schema.shape))}` };
  }
  return { ok: true, data: result.data };
}

// ─────────────────────────────────────────────────────────────────────────────
// _legacyToObject(name, raw)
//
// Converts old-format "semicolon style" tool params into a proper object.
// The old format was like: [TOOL: ws_read; myfile.js]
// We need to turn "myfile.js" into { path: "myfile.js" }.
//
// Different tools need different parsing (ws_move needs two words, etc.)
// ─────────────────────────────────────────────────────────────────────────────
function _legacyToObject(name, raw) {
  switch (name) {
    case 'ws_list':   return { data: { path: raw || '.' } };
    case 'ws_read':   return { data: { path: raw } };
    case 'ws_delete':  return { data: { path: raw } };
    case 'ws_mkdir':   return { data: { path: raw } };
    case 'ws_write':
    case 'ws_append': {
      const nl = raw.indexOf('\n');
      if (nl < 0) return { error: `${name}: expected path then content (newline-separated)` };
      return { data: { path: raw.slice(0, nl).trim() }, blockContent: raw.slice(nl + 1) };
    }
    case 'ws_move': {
      const parts = raw.split(/\s+/);
      if (parts.length < 2) return { error: 'ws_move: expected "src dst"' };
      return { data: { src: parts[0], dst: parts[1] } };
    }
    case 'web_search':    return { data: { query: raw } };
    case 'web_fetch':     return { data: { url: raw } };
    case 'cmd_run':       return { data: { cmd: raw } };
    case 'memory_search': return { data: { query: raw, limit: 5 } };
    default: return { error: `Unknown tool: ${name}` };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// extractToolCalls(text)
//
// The main parser.  Scans LLM text for tool calls in three passes:
//   Pass 1: Block tools (ws_write/ws_append with [/TOOL] closing tag)
//   Pass 2: Inline tools (single-line, JSON params)
//   Pass 3: Legacy tools (semicolon format, backward compatibility)
//
// Each pass skips positions already matched by earlier passes.
// Returns an array of { name, params, error? } sorted by document order.
//
//   text — the raw LLM response text
//   Returns: array of tool call objects
// ─────────────────────────────────────────────────────────────────────────────
function extractToolCalls(text) {
  if (!text) return [];
  const cleaned = _preCleanToolText(text);
  const calls = [];
  const matched = []; // [start, end] ranges already consumed
  let m;

  // Pass 1: Block tools (ws_write / ws_append with [/TOOL] closing tag)
  const blockRe = new RegExp(BLOCK_RE.source, BLOCK_RE.flags);
  while ((m = blockRe.exec(cleaned))) {
    matched.push([m.index, m.index + m[0].length]);
    const name = _normName(m[1]);
    const json = _parseJSON(m[2]);
    if (json === null) {
      calls.push({ name, params: null, error: `Invalid JSON in [TOOL:${name}]: ${m[2]}`, _pos: m.index });
    } else {
      const v = _validate(name, json, m[3]);
      calls.push(v.ok
        ? { name, params: v.data, _pos: m.index }
        : { name, params: null, error: v.error, _pos: m.index });
    }
  }

  // Pass 2: Inline tools — skip positions already covered by blocks
  const inlineRe = new RegExp(INLINE_RE.source, INLINE_RE.flags);
  while ((m = inlineRe.exec(cleaned))) {
    if (_overlaps(m.index, m[0].length, matched)) continue;
    matched.push([m.index, m.index + m[0].length]);
    const name = _normName(m[1]);
    const json = _parseJSON(m[2]);
    if (json === null) {
      calls.push({ name, params: null, error: `Invalid JSON in [TOOL:${name}]: ${m[2]}`, _pos: m.index });
    } else {
      const v = _validate(name, json, undefined);
      calls.push(v.ok
        ? { name, params: v.data, _pos: m.index }
        : { name, params: null, error: v.error, _pos: m.index });
    }
  }

  // Pass 3: Legacy [TOOL: name; params] — backward compatibility
  const legacyRe = new RegExp(LEGACY_RE.source, LEGACY_RE.flags);
  while ((m = legacyRe.exec(cleaned))) {
    if (_overlaps(m.index, m[0].length, matched)) continue;
    const name = _normName(m[1]);
    const raw = (m[2] || '').trim();
    const parsed = _legacyToObject(name, raw);
    if (parsed.error) {
      calls.push({ name, params: null, error: parsed.error, _pos: m.index });
    } else {
      const v = _validate(name, parsed.data, parsed.blockContent);
      calls.push(v.ok
        ? { name, params: v.data, _pos: m.index }
        : { name, params: null, error: v.error, _pos: m.index });
    }
  }

  // Sort by document order, strip internal position marker
  calls.sort((a, b) => a._pos - b._pos);
  return calls.map(({ _pos, ...rest }) => rest);
}

// ─────────────────────────────────────────────────────────────────────────────
// stripToolCalls(text)
//
// Removes all tool call blocks from text.  Used when we want the AI's
// "chat" response without the tool syntax.
//
// First removes code-fence wrappers, then strips all tool patterns,
// then cleans up extra blank lines.
//
//   text — the raw LLM response text
//   Returns: cleaned text with no tool blocks
// ─────────────────────────────────────────────────────────────────────────────
function stripToolCalls(text) {
  if (!text) return '';
  let out = _preCleanToolText(text);
  out = out.replace(STRIP_RE, '');
  return out.replace(/\n{3,}/g, '\n\n').trim();
}

module.exports = { extractToolCalls, stripToolCalls };
