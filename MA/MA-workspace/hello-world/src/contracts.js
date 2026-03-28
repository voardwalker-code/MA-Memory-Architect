// ── Contracts · Shared Constants & Factories ─────────────────────────────────
//
// HOW CONTRACTS WORK:
// Imagine every department in a company agrees to use the same forms.
// The accounting department and the shipping department both use the
// same order form — same fields, same rules.  That's what this file is.
//
// Every module in the Hello World pipeline imports these shared constants
// and factory functions so they all agree on:
//   • What encodings are allowed (base64, hex, rot13, reverse)
//   • What display formats exist (uppercase, bordered, banner, plain)
//   • What output destinations are valid (console, file, return)
//   • What a PipelineState looks like (the "form" passed between stages)
//   • What a LogEntry looks like (the "receipt" each stage generates)
//
// No module defines its own magic strings — they all point here.
//
// WHAT USES THIS:
//   config.js        — reads DEFAULT_CONFIG and validation helpers
//   validator.js     — uses isValidEncoding, isValidFormat, isValidOutput
//   encoder.js       — reads SUPPORTED_ENCODINGS
//   processor.js     — uses createLogEntry
//   decoder.js       — reads SUPPORTED_ENCODINGS
//   formatter.js     — reads SUPPORTED_FORMATS
//   output-handler.js — reads SUPPORTED_OUTPUTS
//   logger.js        — uses createLogEntry
//   main.js          — uses createPipelineState, PIPELINE_STAGES
//
// EXPORTS:
//   SUPPORTED_ENCODINGS            — ['base64','hex','rot13','reverse']
//   SUPPORTED_FORMATS              — ['uppercase','bordered','banner','plain']
//   SUPPORTED_OUTPUTS              — ['console','file','return']
//   PIPELINE_STAGES                — stage names in execution order
//   MAX_MESSAGE_LENGTH             — 1000
//   DEFAULT_CONFIG                 — fallback config object
//   createPipelineState(config)    → PipelineState object
//   createLogEntry(stage, status, detail) → LogEntry object
//   isValidEncoding(enc)           → boolean
//   isValidFormat(fmt)             → boolean
//   isValidOutput(out)             → boolean
// ─────────────────────────────────────────────────────────────────────────────
'use strict';

// ── Constants ───────────────────────────────────────────────────────────────

const SUPPORTED_ENCODINGS = ['base64', 'hex', 'rot13', 'reverse'];
const SUPPORTED_FORMATS   = ['uppercase', 'bordered', 'banner', 'plain'];
const SUPPORTED_OUTPUTS   = ['console', 'file', 'return'];

const PIPELINE_STAGES = [
  'config',
  'validate',
  'encode',
  'process',
  'decode',
  'format',
  'output'
];

const MAX_MESSAGE_LENGTH = 1000;

const DEFAULT_CONFIG = {
  message:  'Hello, World!',
  encoding: 'base64',
  format:   'bordered',
  output:   'console',
  logFile:  null
};

// ── Factory Functions ───────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────────────────
// createPipelineState(config)
//
// Builds the blank "form" that travels through every pipeline stage.
// Each stage reads what it needs and fills in its section.
//
//   config — a validated config object (message, encoding, format, output)
//   Returns: a fresh PipelineState with all fields initialized
// ─────────────────────────────────────────────────────────────────────────────
function createPipelineState(config) {
  // ALGORITHM:
  // 1. Validate that config is a non-null object — throw if not
  // 2. Validate that config.message is a non-empty string — throw if not
  // 3. Return a new object with:
  //    - raw: config.message
  //    - encoded: null
  //    - processed: null
  //    - decoded: null
  //    - formatted: null
  //    - output: null
  //    - config: shallow copy of config
  //    - log: empty array
  //    - status: 'pending'
  //    - error: null
  //    - startTime: Date.now()

  if (!config || typeof config !== 'object') {
    throw new Error('contracts.createPipelineState: config must be a non-null object');
  }
  if (typeof config.message !== 'string' || config.message.length === 0) {
    throw new Error('contracts.createPipelineState: config.message must be a non-empty string');
  }

  return {
    raw:       config.message,
    encoded:   null,
    processed: null,
    decoded:   null,
    formatted: null,
    output:    null,
    config:    Object.assign({}, config),
    log:       [],
    status:    'pending',
    error:     null,
    startTime: Date.now()
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// createLogEntry(stage, status, detail)
//
// Builds a "receipt" for one pipeline stage.  The Logger collects these
// to produce a full audit trail of what happened during the pipeline run.
//
//   stage  — which pipeline stage (e.g. 'encode', 'decode')
//   status — 'ok' or 'error'
//   detail — a human-readable description of what happened
//   Returns: a LogEntry object with a timestamp
// ─────────────────────────────────────────────────────────────────────────────
function createLogEntry(stage, status, detail) {
  // ALGORITHM:
  // 1. Validate stage is a non-empty string — throw if not
  // 2. Validate status is 'ok' or 'error' — throw if not
  // 3. Validate detail is a string — throw if not
  // 4. Return { stage, status, detail, timestamp: new Date().toISOString() }

  if (typeof stage !== 'string' || stage.length === 0) {
    throw new Error('contracts.createLogEntry: stage must be a non-empty string');
  }
  if (status !== 'ok' && status !== 'error') {
    throw new Error('contracts.createLogEntry: status must be "ok" or "error"');
  }
  if (typeof detail !== 'string') {
    throw new Error('contracts.createLogEntry: detail must be a string');
  }

  return {
    stage,
    status,
    detail,
    timestamp: new Date().toISOString()
  };
}

// ── Validation Helpers ──────────────────────────────────────────────────────

/** Checks if an encoding type is in the supported list. */
function isValidEncoding(enc) {
  return SUPPORTED_ENCODINGS.includes(enc);
}

/** Checks if a format type is in the supported list. */
function isValidFormat(fmt) {
  return SUPPORTED_FORMATS.includes(fmt);
}

/** Checks if an output destination is in the supported list. */
function isValidOutput(out) {
  return SUPPORTED_OUTPUTS.includes(out);
}

// ── Exports ─────────────────────────────────────────────────────────────────

module.exports = {
  SUPPORTED_ENCODINGS,
  SUPPORTED_FORMATS,
  SUPPORTED_OUTPUTS,
  PIPELINE_STAGES,
  MAX_MESSAGE_LENGTH,
  DEFAULT_CONFIG,
  createPipelineState,
  createLogEntry,
  isValidEncoding,
  isValidFormat,
  isValidOutput
};
