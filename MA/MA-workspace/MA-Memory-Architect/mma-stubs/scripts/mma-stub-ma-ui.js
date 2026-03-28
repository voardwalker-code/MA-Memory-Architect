'use strict';
// ── mma-stub · Maps to MA/FrontEnd/js/ma-ui.js ────────────────────────────────
//
// HOW THIS STUB WORKS:
// Coat-rack globals for the SPA. Real file touches DOM on load; stub only lists API.
//
// EXPORTS: mmaStubPing, applyTheme, initializeMAUI (stubs)
// ─────────────────────────────────────────────────────────────────────────────

const { createEditorTab, validateEditorTab } = require('../../mma-contracts/mma-editor-tab.js');

function mmaStubPing() {
  throw new Error('NOT_IMPLEMENTED: mmaStubPing');
}

function applyTheme(choice) {
  // ALGORITHM:
  // 1. Persist choice in localStorage key ma-theme-v1
  // 2. Set body data-theme for light vs dark vs system
  throw new Error('NOT_IMPLEMENTED: applyTheme');
}

function initializeMAUI() {
  // ALGORITHM:
  // 1. checkConfig(); loadSessionList(); syncMode();
  // 2. renderTodos if element exists; selectWorkspaceSection('workspace');
  // 3. fetch workspace info for title
  throw new Error('NOT_IMPLEMENTED: initializeMAUI');
}

module.exports = {
  mmaStubPing,
  applyTheme,
  initializeMAUI,
  _contracts: { createEditorTab, validateEditorTab }
};
