// ── FrontEnd · Global namespace shell (load FIRST) ───────────────────────────
//
// One object on window so the console and new code can use MA.chat.send() instead
// of hoping fifty different names on window never collide. Feature scripts register
// functions on the right sub-object as they load; inline HTML handlers call MA.*.
//
// LOAD ORDER: Must be the first <script> in MA-index.html (before ma-ui.js).
// ─────────────────────────────────────────────────────────────────────────────
'use strict';

window.MA = window.MA || {
  dom: {},
  api: {},
  chat: {},
  nav: {},
  config: {},
  ingest: {},
  editor: {},
  workspace: {},
  input: {},
  ui: {}
};
