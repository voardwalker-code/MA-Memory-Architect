// ── Tool Book ────────────────────────────────────────────────────────────────
//
// Tools for reading ingested book chunks from the workspace.
//
// HOW IT WORKS:
// When MA ingests a book, it splits the text into small "chunks" and
// saves them as numbered text files inside a books/{bookId}/chunks/ folder.
// These tools let the AI read those chunks one at a time.
//
// The book folder contains:
//   meta.json           — book metadata (title, author, bookId, etc.)
//   chunks/
//     chunk_0000.txt    — first chunk of the book
//     chunk_0001.txt    — second chunk
//     ...               — and so on
//
// There are TWO possible locations for books:
//   1. New layout:  projects/{slug}/books/{bookId}/   (inside a project)
//   2. Legacy:      books/{bookId}/                   (standalone)
//
// WHAT IT EXPORTS:
//   bookListChunks(wp, bookId)          — List all chunks in a book
//   bookReadChunk(wp, bookId, index)    — Read one specific chunk
//
// USED BY: MA-workspace-tools.js (the orchestrator's executeToolCalls)
// ─────────────────────────────────────────────────────────────────────────────
'use strict';

const fs   = require('fs');
const path = require('path');

// ─────────────────────────────────────────────────────────────────────────────
// _findBookDir(wp, bookId)
//
// Searches for a book's folder in the workspace.  Checks the new project
// layout first, then falls back to the legacy standalone layout.
//
//   wp     — absolute path to the workspace
//   bookId — the book's unique identifier
//   Returns: absolute path to the book directory, or null if not found
// ─────────────────────────────────────────────────────────────────────────────
function _findBookDir(wp, bookId) {
  // Sanitize bookId — no slashes allowed (prevents path traversal)
  if (!bookId || /[/\\]/.test(bookId)) return null;

  // New layout: projects/{slug}/books/{bookId}
  const projDir = path.join(wp, 'projects');
  if (fs.existsSync(projDir)) {
    try {
      for (const slug of fs.readdirSync(projDir)) {
        const candidate = path.join(projDir, slug, 'books', bookId);
        if (fs.existsSync(path.join(candidate, 'meta.json'))) return candidate;
      }
    } catch (_) {}
  }

  // Legacy layout: books/{bookId}
  const legacy = path.join(wp, 'books', bookId);
  if (fs.existsSync(path.join(legacy, 'meta.json'))) return legacy;

  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// bookListChunks(wp, bookId)
//
// Lists all chunks in a book.  Returns a JSON string with the book's
// metadata, total chunk count, and a preview of each chunk.
//
//   wp     — absolute path to the workspace
//   bookId — the book's unique identifier
//   Returns: JSON string with chunk info, or error message
// ─────────────────────────────────────────────────────────────────────────────
function bookListChunks(wp, bookId) {
  const bookDir = _findBookDir(wp, bookId);
  if (!bookDir) return `Error: Book "${bookId}" not found in workspace.`;

  const meta = JSON.parse(fs.readFileSync(path.join(bookDir, 'meta.json'), 'utf8'));
  const chunkDir = path.join(bookDir, 'chunks');
  if (!fs.existsSync(chunkDir)) return `Error: No chunks directory for book "${bookId}".`;

  const chunkFiles = fs.readdirSync(chunkDir).filter(f => f.endsWith('.txt')).sort();
  const chunks = chunkFiles.map((f, i) => {
    const text = fs.readFileSync(path.join(chunkDir, f), 'utf8');
    return { index: i, preview: text.substring(0, 120), charCount: text.length };
  });

  return JSON.stringify({
    bookId: meta.bookId,
    title: meta.title,
    totalChunks: chunks.length,
    projectFolder: meta.projectFolder || null,
    chunks
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// bookReadChunk(wp, bookId, index)
//
// Reads a single chunk from a book by its index number.
//
//   wp     — absolute path to the workspace
//   bookId — the book's unique identifier
//   index  — the chunk number (0-based)
//   Returns: the chunk text, or error message
// ─────────────────────────────────────────────────────────────────────────────
function bookReadChunk(wp, bookId, index) {
  const bookDir = _findBookDir(wp, bookId);
  if (!bookDir) return `Error: Book "${bookId}" not found in workspace.`;

  const chunkPath = path.join(bookDir, 'chunks', `chunk_${String(index).padStart(4, '0')}.txt`);
  if (!fs.existsSync(chunkPath)) return `Error: Chunk ${index} not found for book "${bookId}".`;

  return fs.readFileSync(chunkPath, 'utf8');
}

module.exports = { bookListChunks, bookReadChunk };
