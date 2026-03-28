'use strict';
// ── mma-stub · Maps to MA/FrontEnd/js/ma-ui-bootstrap.js ──────────────────────
//
// Last script: calls initializeMAUI and optional URL book-ingest prefill.
//
// EXPORTS: mmaStubPing, runBootstrap
// ─────────────────────────────────────────────────────────────────────────────

function mmaStubPing() {
  throw new Error('NOT_IMPLEMENTED: mmaStubPing');
}

function runBootstrap() {
  // ALGORITHM:
  // 1. initializeMAUI()
  // 2. Parse ?bookId= ; if set, switchMode('chat') and prefill composer after timeout
  throw new Error('NOT_IMPLEMENTED: runBootstrap');
}

module.exports = {
  mmaStubPing,
  runBootstrap
};
