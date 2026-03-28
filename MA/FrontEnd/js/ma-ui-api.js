// ── FrontEnd · Talking to the server (JSON POST helper) ─────────────────────
//
// HOW apiPostJson WORKS:
// The MA server speaks HTTP. Many buttons send JSON: "here is my form as one
// lump of data". Browsers need a header that says "this body is JSON" and the
// body itself as a string. We were repeating that recipe in dozens of places.
//
// Think of apiPostJson like a pre-addressed envelope: you hand it the URL,
// the payload (object or already-stringified), and optional extras (like an
// AbortSignal to cancel). It stamps Content-Type: application/json and mails
// the request via fetch().
//
// WHAT USES THIS:
//   ma-ui-chat.js, ma-ui-nav.js, ma-ui-config-*.js, ma-ui-input.js,
//   ma-ui-editor-*.js, ma-ui-workspace-*.js — any POST with a JSON body.
//
// LOAD ORDER:
//   After ma-ui-dom.js, before modules that call apiPostJson().
//
// GLOBAL API:
//   MA_API_JSON_HEADERS — frozen default JSON headers (rarely touched directly)
//   apiPostJson(url, body, extraInit?) → Promise<Response>
//     body — plain object (gets JSON.stringify) OR string (already JSON text)
//     extraInit — merged into fetch (e.g. { signal } for cancel); headers merge
// ─────────────────────────────────────────────────────────────────────────────
'use strict';

// Default stamp we put on every JSON POST so the server knows how to read it.
const MA_API_JSON_HEADERS = Object.freeze({ 'Content-Type': 'application/json' });

// ─────────────────────────────────────────────────────────────────────────────
// apiPostJson(url, body, extraInit?)
//
// Sends a POST request with a JSON body. Same idea every time; this keeps
// mistakes (wrong header, forgot stringify) in one small place.
// ─────────────────────────────────────────────────────────────────────────────
function apiPostJson(url, body, extraInit) {
  const rest = extraInit && typeof extraInit === 'object' ? extraInit : {};
  const { headers, ...fetchRest } = rest;
  const bodyStr = typeof body === 'string' ? body : JSON.stringify(body);
  return fetch(url, {
    ...fetchRest,
    method: 'POST',
    headers: { ...MA_API_JSON_HEADERS, ...headers },
    body: bodyStr
  });
}

if (window.MA && window.MA.api) {
  window.MA.api.postJson = apiPostJson;
  window.MA.api.MA_API_JSON_HEADERS = MA_API_JSON_HEADERS;
}
