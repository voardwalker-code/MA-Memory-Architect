// ── FrontEnd · App startup (runs last) ───────────────────────────────────────
//
// HOW BOOTSTRAP WORKS:
// All the other scripts only DEFINE functions and variables. This file is the
// starter motor: it runs after everything is loaded so initializeMAUI() can
// safely touch DOM hooks from ma-ui.js and call into other modules.
//
// Think of it as the last runner in a relay — everyone has handed off the baton;
// now we actually start the race. We also peek at the URL for special links
// (e.g. book ingestion) and pre-fill the chat box once.
//
// WHAT USES THIS:
//   MA-index.html — must stay the LAST <script> before </body>.
//
// GLOBAL API:
//   (none by itself) — it calls initializeMAUI(), switchMode(), etc. defined elsewhere
// ─────────────────────────────────────────────────────────────────────────────
'use strict';

if (window.MA && window.MA.ui && typeof window.MA.ui.initializeMAUI === 'function') {
  window.MA.ui.initializeMAUI();
} else {
  initializeMAUI();
}

// ── Optional URL trick: open chat with a book-ingest message ─────────────────
(function() {
  const params = new URLSearchParams(window.location.search);
  const bookId = params.get('bookId');
  const title = params.get('title');
  const projectFolder = params.get('projectFolder');
  if (!bookId) return;

  if (window.MA && window.MA.nav && typeof window.MA.nav.switchMode === 'function') {
    window.MA.nav.switchMode('chat');
  }

  setTimeout(function() {
    let msg = 'Ingest the uploaded book "' + (title || bookId) + '" (bookId: ' + bookId + '). ' +
      'Extract all major characters and create entities for them.';
    if (projectFolder) {
      msg += ' YOUR PROJECT FOLDER IS: "' + projectFolder + '/" — ALL output files (registries, memories, reports) MUST go inside this folder. NEVER write files to the workspace root.';
    }
    if (typeof inputEl !== 'undefined') {
      inputEl.value = msg;
      inputEl.focus();
    }
    if (window.history && window.history.replaceState) {
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }, 500);
})();
