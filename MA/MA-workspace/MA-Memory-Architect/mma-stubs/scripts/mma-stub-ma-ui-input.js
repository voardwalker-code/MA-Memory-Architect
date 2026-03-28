'use strict';
// ── mma-stub · Maps to MA/FrontEnd/js/ma-ui-input.js ─────────────────────────
//
// EXPORTS: mmaStubPing, handleInput, handleKey, execSlash
// ─────────────────────────────────────────────────────────────────────────────

const { validateChatPayload, createChatPayload } = require('../../mma-contracts/mma-chat-payload.js');

function mmaStubPing() {
  throw new Error('NOT_IMPLEMENTED: mmaStubPing');
}

function handleInput() {
  throw new Error('NOT_IMPLEMENTED: handleInput');
}

function handleKey(e) {
  throw new Error('NOT_IMPLEMENTED: handleKey');
}

function execSlash(command) {
  // ALGORITHM:
  // 1. POST /api/slash with { command }; show result bubble
  // 2. validateChatPayload optional if wrapping as pseudo-message
  throw new Error('NOT_IMPLEMENTED: execSlash');
}

module.exports = {
  mmaStubPing,
  handleInput,
  handleKey,
  execSlash,
  _contracts: { validateChatPayload, createChatPayload }
};
