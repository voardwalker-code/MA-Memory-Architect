// ── Pipeline · Encoder ────────────────────────────────────────────────────────
//
// HOW ENCODING WORKS:
// This module takes the plain-text message and encodes it into a transport
// format.  Think of it as putting a letter in an envelope — the content
// is the same, but the packaging changes so it can survive the journey.
//
// SUPPORTED ENCODINGS:
//   base64  — Standard Base64 encoding (most common)
//   hex     — Hexadecimal byte representation
//   rot13   — Caesar cipher with rotation of 13 (letters only)
//   reverse — Simply reverses the string
//
// WHAT USES THIS:
//   main.js (orchestrator) — calls encode() during the pipeline
//
// EXPORTS:
//   encodeBase64(str)         → Base64-encoded string
//   encodeHex(str)            → hex-encoded string
//   encodeRot13(str)          → ROT13-encoded string
//   encodeReverse(str)        → reversed string
//   encode(state)             → updated PipelineState with encoded field set
// ─────────────────────────────────────────────────────────────────────────────
'use strict';

// ── Imports ─────────────────────────────────────────────────────────────────

const {
  SUPPORTED_ENCODINGS,
  isValidEncoding,
  createLogEntry
} = require('./contracts');

// ── Encoding Functions ──────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────────────────
// encodeBase64(str)
//
// Encodes a UTF-8 string into Base64.
//
//   str — the plain-text string to encode
//   Returns: the Base64-encoded string
//   Throws: if str is not a string
// ─────────────────────────────────────────────────────────────────────────────
function encodeBase64(str) {
  // ALGORITHM:
  // 1. Validate str is a string — throw if not
  // 2. Convert str to a Buffer using Buffer.from(str, 'utf8')
  // 3. Return buffer.toString('base64')

  if (typeof str !== 'string') {
    throw new Error('encoder.encodeBase64: input must be a string, got ' + typeof str);
  }

  const buffer = Buffer.from(str, 'utf8');
  return buffer.toString('base64');
}

// ─────────────────────────────────────────────────────────────────────────────
// encodeHex(str)
//
// Encodes a UTF-8 string into hexadecimal.
//
//   str — the plain-text string to encode
//   Returns: the hex-encoded string
//   Throws: if str is not a string
// ─────────────────────────────────────────────────────────────────────────────
function encodeHex(str) {
  // ALGORITHM:
  // 1. Validate str is a string — throw if not
  // 2. Convert str to a Buffer using Buffer.from(str, 'utf8')
  // 3. Return buffer.toString('hex')

  if (typeof str !== 'string') {
    throw new Error('encoder.encodeHex: input must be a string, got ' + typeof str);
  }

  const buffer = Buffer.from(str, 'utf8');
  return buffer.toString('hex');
}

// ─────────────────────────────────────────────────────────────────────────────
// encodeRot13(str)
//
// Applies ROT13 substitution cipher — shifts each letter by 13 positions.
// Non-letter characters pass through unchanged.
//
//   str — the plain-text string to encode
//   Returns: the ROT13-encoded string
//   Throws: if str is not a string
// ─────────────────────────────────────────────────────────────────────────────
function encodeRot13(str) {
  // ALGORITHM:
  // 1. Validate str is a string — throw if not
  // 2. For each character in str:
  //    a. If uppercase letter (A-Z): shift by 13, wrapping at Z
  //    b. If lowercase letter (a-z): shift by 13, wrapping at z
  //    c. Otherwise: keep the character unchanged
  // 3. Return the resulting string

  if (typeof str !== 'string') {
    throw new Error('encoder.encodeRot13: input must be a string, got ' + typeof str);
  }

  let result = '';
  for (let i = 0; i < str.length; i++) {
    const code = str.charCodeAt(i);

    if (code >= 65 && code <= 90) {
      // Uppercase A-Z
      result += String.fromCharCode(((code - 65 + 13) % 26) + 65);
    } else if (code >= 97 && code <= 122) {
      // Lowercase a-z
      result += String.fromCharCode(((code - 97 + 13) % 26) + 97);
    } else {
      // Non-letter — pass through
      result += str[i];
    }
  }

  return result;
}

// ─────────────────────────────────────────────────────────────────────────────
// encodeReverse(str)
//
// Reverses the string.  Simple but effective as a "transformation."
//
//   str — the plain-text string to encode
//   Returns: the reversed string
//   Throws: if str is not a string
// ─────────────────────────────────────────────────────────────────────────────
function encodeReverse(str) {
  // ALGORITHM:
  // 1. Validate str is a string — throw if not
  // 2. Split into array, reverse, join back
  // 3. Return the reversed string

  if (typeof str !== 'string') {
    throw new Error('encoder.encodeReverse: input must be a string, got ' + typeof str);
  }

  return str.split('').reverse().join('');
}

// ── Pipeline Stage Function ─────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────────────────
// encode(state)
//
// The main pipeline stage function.  Takes a PipelineState, reads the
// raw message and encoding type from config, encodes the message, and
// returns an updated state with the `encoded` field populated.
//
//   state — PipelineState object with `raw` and `config.encoding` set
//   Returns: updated PipelineState with `encoded` field set
//   Throws: if state is invalid or encoding is unsupported
// ─────────────────────────────────────────────────────────────────────────────
function encode(state) {
  // ALGORITHM:
  // 1. Validate that state is a non-null object — throw if not
  // 2. Validate that state.raw is a non-empty string — throw if not
  // 3. Validate that state.config is a non-null object — throw if not
  // 4. Read the encoding type from state.config.encoding
  // 5. Validate the encoding type via isValidEncoding — throw if invalid
  // 6. Dispatch to the correct encoding function:
  //    - 'base64'  → encodeBase64(state.raw)
  //    - 'hex'     → encodeHex(state.raw)
  //    - 'rot13'   → encodeRot13(state.raw)
  //    - 'reverse' → encodeReverse(state.raw)
  // 7. Create a log entry with createLogEntry('encode', 'ok', detail)
  // 8. Return a new object: { ...state, encoded: result, log: [...state.log, logEntry] }

  if (!state || typeof state !== 'object') {
    throw new Error('encoder.encode: state must be a non-null object');
  }

  if (typeof state.raw !== 'string' || state.raw.length === 0) {
    throw new Error('encoder.encode: state.raw must be a non-empty string');
  }

  if (!state.config || typeof state.config !== 'object') {
    throw new Error('encoder.encode: state.config must be a non-null object');
  }

  const encoding = state.config.encoding;

  if (!isValidEncoding(encoding)) {
    throw new Error(
      'encoder.encode: unsupported encoding "' + encoding +
      '". Supported: ' + SUPPORTED_ENCODINGS.join(', ')
    );
  }

  let encoded;
  switch (encoding) {
    case 'base64':  encoded = encodeBase64(state.raw);  break;
    case 'hex':     encoded = encodeHex(state.raw);     break;
    case 'rot13':   encoded = encodeRot13(state.raw);   break;
    case 'reverse': encoded = encodeReverse(state.raw); break;
    default:
      throw new Error('encoder.encode: unhandled encoding "' + encoding + '"');
  }

  const logEntry = createLogEntry(
    'encode',
    'ok',
    'Encoded message using ' + encoding + ' (' + state.raw.length + ' chars → ' + encoded.length + ' chars)'
  );

  const newLog = (state.log || []).concat([logEntry]);

  return Object.assign({}, state, {
    encoded: encoded,
    log:     newLog
  });
}

// ── Exports ─────────────────────────────────────────────────────────────────

module.exports = {
  encodeBase64,
  encodeHex,
  encodeRot13,
  encodeReverse,
  encode
};
