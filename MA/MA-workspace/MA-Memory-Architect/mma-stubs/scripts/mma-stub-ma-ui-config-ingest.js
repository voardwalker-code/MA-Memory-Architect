'use strict';
// ── mma-stub · Maps to MA/FrontEnd/js/ma-ui-config-ingest.js ──────────────────
//
// EXPORTS: mmaStubPing, toggleIngestPanel, loadArchivesList, ingestFolder
// ─────────────────────────────────────────────────────────────────────────────

function mmaStubPing() {
  throw new Error('NOT_IMPLEMENTED: mmaStubPing');
}

function toggleIngestPanel() {
  throw new Error('NOT_IMPLEMENTED: toggleIngestPanel');
}

function loadArchivesList() {
  throw new Error('NOT_IMPLEMENTED: loadArchivesList');
}

function ingestFolder() {
  // ALGORITHM:
  // 1. Read path inputs; POST stream SSE; update progress UI
  throw new Error('NOT_IMPLEMENTED: ingestFolder');
}

module.exports = {
  mmaStubPing,
  toggleIngestPanel,
  loadArchivesList,
  ingestFolder
};
