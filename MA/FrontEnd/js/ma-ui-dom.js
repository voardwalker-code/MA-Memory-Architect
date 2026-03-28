// ── FrontEnd · Safe text for HTML (escape helpers) ────────────────────────────
//
// HOW ESCAPING WORKS:
// We often build HTML by gluing strings together: file names, folder paths,
// chat snippets. If a name contains a `<` or a quote, the page can break — or
// worse, a bad actor could sneak in script. So we never paste "raw" text into
// HTML or into onclick="..." attributes.
//
// Think of escHtml and escAttr like two different safety lids:
//   • escHtml — for text that shows ON the page (inside tags).
//   • escAttr — for text stuffed inside a single-quoted JavaScript string in
//     an HTML attribute (so the string cannot "break out" and end early).
//
// WHAT USES THIS:
//   ma-ui-nav.js, ma-ui-chat.js, ma-ui-config-*.js, ma-ui-editor*.js,
//   ma-ui-workspace-*.js, ma-ui-input.js — anywhere we use innerHTML or
//   inline onclick with user or server-provided text.
//
// LOAD ORDER:
//   Right after ma-ui.js. Before ma-ui-api.js and every script that calls
//   escHtml() or escAttr().
//
// GLOBAL API:
//   escHtml(str)  — makes text safe to embed as visible HTML text
//   escAttr(str)  — makes text safe inside single-quoted onclick="..." args
// ─────────────────────────────────────────────────────────────────────────────
'use strict';

// ─────────────────────────────────────────────────────────────────────────────
// escHtml(text)
//
// Shows arbitrary text on the page without letting HTML characters "wake up".
// We let the browser encode for us via a temporary element — that handles
// &, <, >, and quotes the same way the rest of the page does.
//
//   text — any string (file name, message, path)
//   Returns: a string safe to concatenate into .innerHTML as text content
// ─────────────────────────────────────────────────────────────────────────────
function escHtml(text) {
  const holder = document.createElement('div');
  holder.textContent = text == null ? '' : String(text);
  return holder.innerHTML;
}

// ─────────────────────────────────────────────────────────────────────────────
// escAttr(text)
//
// For inline handlers like onclick="openThing('PATH')" the PATH sits inside
// single quotes in JavaScript. A quote or backslash in the path would "escape"
// the string early — like leaving a door unlocked. We double backslashes and
// turn ' into \' so the whole path stays one neat value.
//
//   text — usually a file or folder path from the user or server
//   Returns: a string safe inside single-quoted JS in an HTML attribute
// ─────────────────────────────────────────────────────────────────────────────
function escAttr(text) {
  return String(text == null ? '' : text)
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/"/g, '&quot;');
}

if (window.MA && window.MA.dom) {
  window.MA.dom.escHtml = escHtml;
  window.MA.dom.escAttr = escAttr;
}
