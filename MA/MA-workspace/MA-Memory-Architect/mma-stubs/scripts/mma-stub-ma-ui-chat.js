'use strict';
// ── mma-stub · Maps to MA/FrontEnd/js/ma-ui-chat.js ──────────────────────────
//
// HOW THIS STUB WORKS:
// Chat is the largest integration slice: SSE, sessions, file-change UI. See
// MA-blueprints/MA-Memory-Architect/layer-6-chat.md for full pseudocode.
//
// EXPORTS: mmaStubPing, send, handleChatResult, addMsg, addSystem
// ─────────────────────────────────────────────────────────────────────────────

const { validateChatPayload, createChatPayload } = require('../../mma-contracts/mma-chat-payload.js');

function mmaStubPing() {
  throw new Error('NOT_IMPLEMENTED: mmaStubPing');
}

// ─────────────────────────────────────────────────────────────────────────────
// send()
//
// Browser-only in production. Stub documents stream + fallback flow.
// ─────────────────────────────────────────────────────────────────────────────
function send() {
  // ALGORITHM:
  // 1. Build user bubble + history push + payload via createChatPayload fields
  // 2. validateChatPayload before POST (optional strict mode)
  // 3. apiPostJson stream; parse SSE; handleChatResult on done
  throw new Error('NOT_IMPLEMENTED: send');
}

function handleChatResult(d) {
  // ALGORITHM:
  // 1. addMsg assistant; thinking block; files Keep/Reject; continuation; saveSession
  throw new Error('NOT_IMPLEMENTED: handleChatResult');
}

function addMsg(role, text) {
  throw new Error('NOT_IMPLEMENTED: addMsg');
}

function addSystem(text) {
  throw new Error('NOT_IMPLEMENTED: addSystem');
}

module.exports = {
  mmaStubPing,
  send,
  handleChatResult,
  addMsg,
  addSystem,
  _contracts: { validateChatPayload, createChatPayload }
};
