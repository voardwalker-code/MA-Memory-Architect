// ── FrontEnd · Editor shared state & "unsaved?" guard ───────────────────────
//
// HOW THIS SLICE FITS:
// The code editor is split across several files so none of them grow huge.
// This tiny file holds GLOBAL VARIABLES that more than one slice needs: which
// code folds are open, find/replace state, etc. It also registers beforeunload
// so the browser warns you if you try to close the tab with dirty files.
//
// Think of it as a shared toolbox lid: everyone grabs the same wrenches
// (variables), and a buzzer rings if you leave with the engine half apart
// (unsaved tabs).
//
// EDITOR SCRIPT ORDER (do not shuffle in MA-index.html):
//   1. ma-ui-editor.js (this file) — shared vars + beforeunload
//   2. ma-ui-editor-tabs.js — tabs, open/save, main pane
//   3. ma-ui-editor-tree.js — sidebar tree + context menu
//   4. ma-ui-editor-find.js — Ctrl+F / replace
//   5. ma-ui-editor-styled.js — markdown preview, highlighting, folds
//
// WHAT IT NEEDS FIRST:
//   ma-ui.js (openTabs, activeTabId, …), ma-ui-dom.js.
// ─────────────────────────────────────────────────────────────────────────────
'use strict';

var _editorFoldState = {};
var _editorErrors   = [];
var _findOpen       = false;
var _findReplace    = false;
var _findQuery      = '';
var _findReplaceVal = '';
var _findMatches    = [];
var _findIdx        = -1;

// If any tab has unsaved edits, ask the browser to show "Leave site?" — like
// a store alarm when the door opens with items not paid for yet.
window.addEventListener('beforeunload', function(e) {
  if (openTabs.some(function(t){ return t.dirty; })) {
    e.preventDefault();
    e.returnValue = '';
  }
});
