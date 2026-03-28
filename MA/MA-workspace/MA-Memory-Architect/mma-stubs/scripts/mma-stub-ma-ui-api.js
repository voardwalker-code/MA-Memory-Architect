'use strict';
// ── mma-stub · Maps to MA/FrontEnd/js/ma-ui-api.js ───────────────────────────
//
// HOW THIS STUB WORKS:
// Real file wraps fetch POST + JSON headers. Stub documents the same contract.
//
// EXPORTS: mmaStubPing, MA_API_JSON_HEADERS, apiPostJson
// ─────────────────────────────────────────────────────────────────────────────

const MA_API_JSON_HEADERS = Object.freeze({ 'Content-Type': 'application/json' });

function mmaStubPing() {
  throw new Error('NOT_IMPLEMENTED: mmaStubPing');
}

// ─────────────────────────────────────────────────────────────────────────────
// apiPostJson(url, body, extraInit?)
//
//   url — same-origin API path
//   body — object (JSON.stringify) or pre-stringified JSON string
//   extraInit — optional fetch init (e.g. { signal })
//   Returns: Promise<Response>
// ─────────────────────────────────────────────────────────────────────────────
function apiPostJson(url, body, extraInit) {
  // ALGORITHM:
  // 1. Merge MA_API_JSON_HEADERS with extra headers
  // 2. Body string = typeof body === 'string' ? body : JSON.stringify(body)
  // 3. return fetch(url, { method: 'POST', headers, body, ...rest })
  throw new Error('NOT_IMPLEMENTED: apiPostJson');
}

module.exports = {
  mmaStubPing,
  MA_API_JSON_HEADERS,
  apiPostJson
};
