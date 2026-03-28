'use strict';
// ── mma-stub · Maps to MA/FrontEnd/js/ma-ui-dom.js ───────────────────────────
//
// HOW THIS STUB WORKS:
// In the browser, escHtml and escAttr stop user text from breaking HTML. This
// Node copy is a SPEC ONLY — implement with jsdom later if you want automated tests.
//
// WHAT USES THIS (kit): mma-tests/test-runner.js
//
// EXPORTS: mmaStubPing, escHtml, escAttr
// ─────────────────────────────────────────────────────────────────────────────

function mmaStubPing() {
  throw new Error('NOT_IMPLEMENTED: mmaStubPing');
}

// ─────────────────────────────────────────────────────────────────────────────
// escHtml(text)
//
//   text — any string to show as visible text in HTML
//   Returns: string safe for innerHTML text nodes
// ─────────────────────────────────────────────────────────────────────────────
function escHtml(text) {
  // ALGORITHM:
  // 1. If text is null/undefined, use ''
  // 2. Create a detached div, set textContent, read innerHTML
  // 3. Return encoded string
  throw new Error('NOT_IMPLEMENTED: escHtml');
}

// ─────────────────────────────────────────────────────────────────────────────
// escAttr(text)
//
//   text — path or name embedded in onclick='...' single quotes
//   Returns: escaped string for that JS literal context
// ─────────────────────────────────────────────────────────────────────────────
function escAttr(text) {
  // ALGORITHM:
  // 1. Stringify; replace \ → \\ and ' → \'
  // 2. Return
  throw new Error('NOT_IMPLEMENTED: escAttr');
}

module.exports = {
  mmaStubPing,
  escHtml,
  escAttr
};
