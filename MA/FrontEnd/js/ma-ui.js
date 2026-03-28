// ── FrontEnd · Shared UI state (the coat rack) ───────────────────────────────
//
// HOW THE SHARED STATE WORKS:
// The web app does not use a bundler — each .js file is a separate <script> tag.
// They all share one global `window`, so we need ONE place that holds the stuff
// every panel cares about: pointers to big HTML pieces, open editor tabs, chat
// history, theme, and "which sidebar section is showing".
//
// Think of this file as the coat rack by the front door. Jackets (other scripts)
// do not carry their own pegs; they hang keys, hats, and bags on hooks defined
// here. That way every file can find the same chat box or the same tab list.
//
// WHAT USES THIS:
//   Every ma-ui-*.js file after it — they read and update these hooks.
//   ma-ui-bootstrap.js — calls initializeMAUI() once the page is ready.
//
// LOAD ORDER:
//   After ma-ui-namespace.js (defines window.MA). Before ma-ui-dom.js,
//   ma-ui-api.js, and the feature modules.
//
// GLOBAL API (variables and functions on window):
//   chatEl, inputEl, sendBtn, statusDot, explorerBodyEl, … — DOM nodes
//   openTabs[], activeTabId, history[], pendingFiles — data the UI shares
//   initializeMAUI() — sets up theme, workspace title, todos, tree, etc.
// ─────────────────────────────────────────────────────────────────────────────
'use strict';

// ── Chat & status DOM ─────────────────────────────────────────────────────────

const chatEl    = document.getElementById('chat');
const inputEl   = document.getElementById('msg-input');
const sendBtn   = document.getElementById('send-btn');
const statusDot = document.getElementById('status-dot');
const statusTxt = document.getElementById('status-text');
const cfgPanel  = document.getElementById('config-panel');

// ── Session / explorer DOM (Session rail uses these when scaffolded) ────────

const sessionSummaryEl = document.getElementById('session-summary');
const sessionRecentEl  = document.getElementById('session-recent');
const explorerTitleEl  = document.getElementById('explorer-title');
const explorerBodyEl   = document.getElementById('explorer-body');

// ── Chat data (messages, uploads, Continue button) ────────────────────────────

let history = [];
let sending = false;
let pendingFiles = []; // { name, content } from drag-and-drop
let lastContinuation = null; // continuation point for the "Continue" button
const MA_MASKED_KEY = '********';
const TODO_STORAGE_KEY = 'ma-ui-todos-v1';

// Pretty names for the left sidebar title when you click each rail icon.
const inspectorTitles = {
  session: 'Session',
  blueprints: 'Blueprints',
  projects: 'Projects',
  tasks: 'Tasks',
  todos: 'Todos',
  chores: 'Chores',
  archives: 'Archives',
  workspace: 'Workspace Files'
};

let currentInspector = 'session';
let selectedBlueprintPath = '';

// ── Light / dark / follow-the-computer theme ─────────────────────────────────

const THEME_KEY = 'ma-theme-v1';

function applyTheme(choice) {
  if (!choice) choice = localStorage.getItem(THEME_KEY) || 'system';
  localStorage.setItem(THEME_KEY, choice);
  const themeSelect = document.getElementById('cfg-theme');
  if (themeSelect) themeSelect.value = choice;

  let effective;
  if (choice === 'system') {
    effective = window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
  } else {
    effective = choice;
  }

  if (effective === 'light') {
    document.body.setAttribute('data-theme', 'light');
  } else {
    document.body.removeAttribute('data-theme');
  }
}

applyTheme();
window.matchMedia('(prefers-color-scheme: light)').addEventListener('change', () => {
  if ((localStorage.getItem(THEME_KEY) || 'system') === 'system') applyTheme('system');
});

// ── Editor strip (tab bar + big content area) ─────────────────────────────────

const editorTabs = document.getElementById('editor-tabs');
const editorContent = document.getElementById('editor-content');
const openTabs = []; // { id, path, name, content, mode, dirty, ... }
let activeTabId = null;

// ─────────────────────────────────────────────────────────────────────────────
// initializeMAUI()
//
// Runs once when the page is ready. Checks LLM config, loads chat sessions,
// syncs Chat/Work mode with the server, draws todos if present, opens the
// workspace rail, and asks the server which folder is mounted.
// ─────────────────────────────────────────────────────────────────────────────
function initializeMAUI() {
  checkConfig();
  loadSessionList();
  syncMode();
  if (document.getElementById('todo-list') && typeof renderTodos === 'function') {
    renderTodos();
  }
  selectWorkspaceSection('workspace');
  fetch('/api/workspace/info').then(r => r.json()).then(d => {
    if (d.root && typeof _updateWorkspaceTitle === 'function') {
      _updateWorkspaceTitle(d.root);
    }
  }).catch(() => {});
}

if (window.MA && window.MA.ui) {
  window.MA.ui.initializeMAUI = initializeMAUI;
  window.MA.ui.applyTheme = applyTheme;
}
