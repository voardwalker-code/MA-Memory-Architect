// ── Pipeline · Processor ──────────────────────────────────────────────────────
//
// HOW PROCESSING WORKS:
// The Processor takes the encoded payload and wraps it with metadata.
// Think of it as the Encoder puts the letter in an envelope, and the
// Processor stamps it with a tracking number, postmark, and checksum.
//
// METADATA ADDED:
//   - checksum:   a simple CRC-style hash of the encoded payload
//   - timestamp:  ISO-8601 timestamp of when processing occurred
//   - encoding:   which encoding was used (for the Decoder to know)
//   - length:     length of the encoded payload
//   - version:    pipeline version string
//
// WHAT USES THIS:
//   main.js (orchestrator) — calls process() during the pipeline
//
// EXPORTS:
//   computeChecksum(str)     → simple numeric checksum
//   buildMetadata(encoded, encoding, features) → metadata object
//   process(state)           → updated PipelineState with processed field
// ─────────────────────────────────────────────────────────────────────────────
'use strict';

// ── Imports ─────────────────────────────────────────────────────────────────

const { createLogEntry } = require('./contracts');

// ── Constants ───────────────────────────────────────────────────────────────

const PIPELINE_VERSION = '1.0.0';

// ── Core Logic ──────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────────────────
// computeChecksum(str)
//
// Computes a simple numeric checksum of a string by summing all character
// codes and taking modulo 65536.  This is NOT cryptographic — it's a
// basic integrity check to detect accidental corruption.
//
//   str — the string to checksum
//   Returns: a number between 0 and 65535
//   Throws: if str is not a string
// ─────────────────────────────────────────────────────────────────────────────
function computeChecksum(str) {
  // ALGORITHM:
  // 1. Validate str is a string — throw if not
  // 2. Sum all character codes
  // 3. Return sum modulo 65536

  if (typeof str !== 'string') {
    throw new Error('processor.computeChecksum: input must be a string, got ' + typeof str);
  }

  let sum = 0;
  for (let i = 0; i < str.length; i++) {
    sum += str.charCodeAt(i);
  }

  return sum % 65536;
}

// ─────────────────────────────────────────────────────────────────────────────
// buildMetadata(encoded, encoding, features)
//
// Builds a metadata object for the encoded payload.  Feature flags control
// which fields are included:
//   - enableChecksum:  include the checksum field
//   - enableTimestamp: include the timestamp field
//
//   encoded  — the encoded payload string
//   encoding — which encoding was used
//   features — feature flags object (or null for defaults)
//   Returns: metadata object
//   Throws: if encoded is not a string
// ─────────────────────────────────────────────────────────────────────────────
function buildMetadata(encoded, encoding, features) {
  // ALGORITHM:
  // 1. Validate encoded is a string — throw if not
  // 2. Start with base metadata: { encoding, length, version }
  // 3. If features.enableChecksum is not false, add checksum field
  // 4. If features.enableTimestamp is not false, add timestamp field
  // 5. Return the metadata object

  if (typeof encoded !== 'string') {
    throw new Error('processor.buildMetadata: encoded must be a string, got ' + typeof encoded);
  }

  const meta = {
    encoding: encoding || 'unknown',
    length:   encoded.length,
    version:  PIPELINE_VERSION
  };

  const flags = features || {};

  if (flags.enableChecksum !== false) {
    meta.checksum = computeChecksum(encoded);
  }

  if (flags.enableTimestamp !== false) {
    meta.timestamp = new Date().toISOString();
  }

  return meta;
}

// ── Pipeline Stage Function ─────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────────────────
// process(state)
//
// The main pipeline stage function.  Takes a PipelineState with the
// `encoded` field set, wraps the payload with metadata, and returns
// an updated state with the `processed` field populated.
//
//   state — PipelineState with `encoded` and `config` set
//   Returns: updated PipelineState with `processed` field set
//   Throws: if state is invalid or encoded is missing
// ─────────────────────────────────────────────────────────────────────────────
function processState(state) {
  // ALGORITHM:
  // 1. Validate that state is a non-null object — throw if not
  // 2. Validate that state.encoded is a non-empty string — throw if not
  // 3. Validate that state.config is a non-null object — throw if not
  // 4. Build metadata from encoded payload, encoding type, and features
  // 5. Create the processed payload object: { payload: state.encoded, metadata }
  // 6. Create a log entry
  // 7. Return a new state with processed field set

  if (!state || typeof state !== 'object') {
    throw new Error('processor.process: state must be a non-null object');
  }

  if (typeof state.encoded !== 'string' || state.encoded.length === 0) {
    throw new Error('processor.process: state.encoded must be a non-empty string');
  }

  if (!state.config || typeof state.config !== 'object') {
    throw new Error('processor.process: state.config must be a non-null object');
  }

  const features = state.config.features || {};
  const metadata = buildMetadata(state.encoded, state.config.encoding, features);

  const processed = {
    payload:  state.encoded,
    metadata: metadata
  };

  const logEntry = createLogEntry(
    'process',
    'ok',
    'Wrapped payload with metadata (checksum: ' +
    (metadata.checksum !== undefined ? metadata.checksum : 'disabled') + ')'
  );

  const newLog = (state.log || []).concat([logEntry]);

  return Object.assign({}, state, {
    processed: processed,
    log:       newLog
  });
}

// ── Exports ─────────────────────────────────────────────────────────────────

module.exports = {
  PIPELINE_VERSION,
  computeChecksum,
  buildMetadata,
  process: processState
};
