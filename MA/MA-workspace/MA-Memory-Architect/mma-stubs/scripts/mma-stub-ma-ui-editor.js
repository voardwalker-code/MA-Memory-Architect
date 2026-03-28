'use strict';
// ── mma-stub · Maps to MA/FrontEnd/js/ma-ui-editor.js ─────────────────────────
//
// Shared editor globals + beforeunload. Browser registers listener on load.
//
// EXPORTS: mmaStubPing, registerBeforeUnloadGuard
// ─────────────────────────────────────────────────────────────────────────────

function mmaStubPing() {
  throw new Error('NOT_IMPLEMENTED: mmaStubPing');
}

function registerBeforeUnloadGuard(openTabsGetter) {
  // ALGORITHM:
  // 1. window.addEventListener('beforeunload', if any tab.dirty preventDefault)
  throw new Error('NOT_IMPLEMENTED: registerBeforeUnloadGuard');
}

module.exports = {
  mmaStubPing,
  registerBeforeUnloadGuard
};
