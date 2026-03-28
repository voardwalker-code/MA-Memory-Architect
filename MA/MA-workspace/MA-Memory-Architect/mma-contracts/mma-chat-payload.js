'use strict';
// ── mma-contracts · Chat POST payload shape ───────────────────────────────────
//
// Models the JSON body the browser sends to /api/chat and /api/chat/stream.
// Real MA may accept additional fields; this contract captures the stable core.
//
// EXPORTS: CHAT_PAYLOAD_REQUIRED, createChatPayload, validateChatPayload
// ─────────────────────────────────────────────────────────────────────────────

const CHAT_PAYLOAD_VERSION = 1;

/** Keys that must be present (attachments may be undefined). */
const CHAT_PAYLOAD_REQUIRED = ['message', 'history', 'autoPilot'];

const DEFAULTS = {
  autoPilot: false,
  history: []
};

const LIMITS = {
  MAX_HISTORY_MESSAGES: 50,
  MAX_MESSAGE_CHARS: 500000
};

function createChatPayload(fields) {
  const record = Object.assign({}, DEFAULTS, fields);
  if (typeof record.message !== 'string') record.message = '';
  if (!Array.isArray(record.history)) record.history = [];
  return record;
}

function validateChatPayload(record) {
  const errors = [];
  if (!record || typeof record !== 'object') {
    errors.push('Payload must be an object');
    return { valid: false, errors };
  }
  if (typeof record.message !== 'string') errors.push('message must be a string');
  else if (record.message.length > LIMITS.MAX_MESSAGE_CHARS) {
    errors.push('message exceeds MAX_MESSAGE_CHARS (' + LIMITS.MAX_MESSAGE_CHARS + ')');
  }
  if (!Array.isArray(record.history)) errors.push('history must be an array');
  else if (record.history.length > LIMITS.MAX_HISTORY_MESSAGES) {
    errors.push('history too long (max ' + LIMITS.MAX_HISTORY_MESSAGES + ')');
  }
  if (typeof record.autoPilot !== 'boolean') errors.push('autoPilot must be boolean');
  return { valid: errors.length === 0, errors };
}

module.exports = {
  CHAT_PAYLOAD_VERSION,
  CHAT_PAYLOAD_REQUIRED,
  DEFAULTS,
  LIMITS,
  createChatPayload,
  validateChatPayload
};
