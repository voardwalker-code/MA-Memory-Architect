// ── Tool FS (File System Tools) ──────────────────────────────────────────────
//
// Workspace file operations: list, read, write, append, delete, mkdir, move.
//
// HOW IT WORKS:
// These are the tools the AI uses to interact with files in the workspace.
// Each function takes the workspace root path (wp) and the parameters
// from the AI's tool call, then performs the file operation safely.
//
// SAFETY:
// Every path goes through _safe() first, which makes sure the AI can't
// read or write files OUTSIDE the workspace.  If the AI tries to sneak
// a path like "../../secrets.txt", _safe() will catch it and throw an error.
// Think of it like a fence around the playground — you can play inside,
// but you can't wander off.
//
// WHAT IT EXPORTS:
//   wsList(wp, dirPath)              — List files in a directory
//   wsRead(wp, filePath)             — Read a file's contents
//   wsWrite(wp, filePath, content)   — Write content to a file (creates dirs)
//   wsAppend(wp, filePath, content)  — Append content to a file
//   wsDelete(wp, filePath)           — Delete a file or folder
//   wsMkdir(wp, dirPath)             — Create a directory
//   wsMove(wp, src, dst)             — Move/rename a file or folder
//
// USED BY: MA-workspace-tools.js (the orchestrator's executeToolCalls)
// ─────────────────────────────────────────────────────────────────────────────
'use strict';

const fs   = require('fs');
const path = require('path');

// ─────────────────────────────────────────────────────────────────────────────
// _safe(wp, rel)
//
// Resolves a relative path and makes sure it stays inside the workspace.
// This is the security boundary — no file operation should bypass this.
//
//   wp  — absolute path to the workspace root
//   rel — the relative path the AI requested
//   Returns: the resolved absolute path (guaranteed inside workspace)
//   Throws: if path would escape the workspace
// ─────────────────────────────────────────────────────────────────────────────
function _safe(wp, rel) {
  if (!wp) throw new Error('No workspace path');
  const resolved = path.resolve(wp, rel.trim());
  if (!resolved.startsWith(path.resolve(wp))) throw new Error('Path outside workspace');
  return resolved;
}

// ─────────────────────────────────────────────────────────────────────────────
// wsList(wp, dirPath)
//
// Lists files and folders in a directory.  Folders get a "/" suffix
// so the AI can tell them apart from files.
// Returns "(empty)" if the directory has nothing in it.
// ─────────────────────────────────────────────────────────────────────────────
function wsList(wp, dirPath) {
  const dir = dirPath && dirPath !== '.' ? _safe(wp, dirPath) : wp;
  if (!fs.existsSync(dir)) return 'Directory not found';
  return fs.readdirSync(dir).map(f => {
    const full = path.join(dir, f);
    return fs.statSync(full).isDirectory() ? f + '/' : f;
  }).join('\n') || '(empty)';
}

// ─────────────────────────────────────────────────────────────────────────────
// wsRead(wp, filePath)
//
// Reads a file and returns its text content.
// Caps at 32KB to avoid flooding the AI's context window.
// ─────────────────────────────────────────────────────────────────────────────
function wsRead(wp, filePath) {
  const p = _safe(wp, filePath);
  if (!fs.existsSync(p)) return `File not found: ${filePath}`;
  return fs.readFileSync(p, 'utf8').slice(0, 32000);
}

// ─────────────────────────────────────────────────────────────────────────────
// wsWrite(wp, filePath, content)
//
// Writes content to a file.  Creates parent directories if needed.
// Returns a message saying how many bytes were written and to what path.
// ─────────────────────────────────────────────────────────────────────────────
// ── Pre-edit snapshots ──────────────────────────────────────────────────
// Captures file content before MA overwrites it, so the UI can offer Reject.
// Map of relative-path → previous content string.
const _preEditSnapshots = {};

function getPreEditSnapshots() { return _preEditSnapshots; }
function clearPreEditSnapshots() { for (const k in _preEditSnapshots) delete _preEditSnapshots[k]; }

function wsWrite(wp, filePath, content) {
  if (content === undefined || content === null) {
    return 'Error: content required. Use block format: [TOOL:ws_write {"path":"file"}]\\ncontent\\n[/TOOL]';
  }
  const p = _safe(wp, filePath);
  // Snapshot existing content before overwriting
  const relPath = path.relative(wp, p).replace(/\\/g, '/');
  if (fs.existsSync(p) && fs.statSync(p).isFile()) {
    try { _preEditSnapshots[relPath] = fs.readFileSync(p, 'utf8'); } catch (_) { /* ignore */ }
  }
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, content, 'utf8');
  const bytes = Buffer.byteLength(content, 'utf8');
  return `Wrote ${bytes} bytes to ${path.relative(wp, p)}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// wsAppend(wp, filePath, content)
//
// Appends content to the END of an existing file (or creates it).
// Used when the AI writes a file in multiple chunks.
// ─────────────────────────────────────────────────────────────────────────────
function wsAppend(wp, filePath, content) {
  if (content === undefined || content === null) {
    return 'Error: content required. Use block format: [TOOL:ws_append {"path":"file"}]\\ncontent\\n[/TOOL]';
  }
  const p = _safe(wp, filePath);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.appendFileSync(p, content, 'utf8');
  const bytes = Buffer.byteLength(content, 'utf8');
  return `Appended ${bytes} bytes to ${path.relative(wp, p)}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// wsDelete(wp, filePath)
//
// Deletes a file or folder (including everything inside it).
// Returns a confirmation message with the relative path that was deleted.
// ─────────────────────────────────────────────────────────────────────────────
function wsDelete(wp, filePath) {
  const p = _safe(wp, filePath);
  if (!fs.existsSync(p)) return `Not found: ${filePath}`;
  fs.rmSync(p, { recursive: true, force: true });
  return `Deleted: ${path.relative(wp, p)}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// wsMkdir(wp, dirPath)
//
// Creates a directory (and any parent directories that don't exist).
// ─────────────────────────────────────────────────────────────────────────────
function wsMkdir(wp, dirPath) {
  const p = _safe(wp, dirPath);
  fs.mkdirSync(p, { recursive: true });
  return `Created: ${path.relative(wp, p)}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// wsMove(wp, src, dst)
//
// Moves or renames a file or folder from src to dst.
// Creates the destination's parent directory if needed.
// ─────────────────────────────────────────────────────────────────────────────
function wsMove(wp, src, dst) {
  const srcP = _safe(wp, src);
  const dstP = _safe(wp, dst);
  if (!fs.existsSync(srcP)) return `Source not found: ${src}`;
  fs.mkdirSync(path.dirname(dstP), { recursive: true });
  fs.renameSync(srcP, dstP);
  return `Moved: ${path.relative(wp, srcP)} → ${path.relative(wp, dstP)}`;
}

module.exports = { wsList, wsRead, wsWrite, wsAppend, wsDelete, wsMkdir, wsMove, getPreEditSnapshots, clearPreEditSnapshots };
