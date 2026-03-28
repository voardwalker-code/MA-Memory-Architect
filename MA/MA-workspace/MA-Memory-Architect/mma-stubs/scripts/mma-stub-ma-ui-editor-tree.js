'use strict';
// ── mma-stub · Maps to MA/FrontEnd/js/ma-ui-editor-tree.js ────────────────────
//
// EXPORTS: mmaStubPing, loadWorkspaceTree, refreshWorkspaceSection
// ─────────────────────────────────────────────────────────────────────────────

function mmaStubPing() {
  throw new Error('NOT_IMPLEMENTED: mmaStubPing');
}

function loadWorkspaceTree() {
  // ALGORITHM:
  // 1. GET /api/workspace/tree
  // 2. Build HTML with escHtml/escAttr; attach click + drag handlers
  throw new Error('NOT_IMPLEMENTED: loadWorkspaceTree');
}

function refreshWorkspaceSection() {
  // ALGORITHM:
  // 1. Switch on currentInspector; call loadBlueprints | loadProjects | loadWorklog | …
  throw new Error('NOT_IMPLEMENTED: refreshWorkspaceSection');
}

module.exports = {
  mmaStubPing,
  loadWorkspaceTree,
  refreshWorkspaceSection
};
