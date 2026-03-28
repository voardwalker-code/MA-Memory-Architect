// ── Pipeline · Validator ──────────────────────────────────────────────────────
//
// HOW VALIDATION WORKS:
// Think of this module as the bouncer at the door.  Before the pipeline
// lets the config through, it has to pass every check:  Is the message
// actually a string?  Is it short enough?  Is the encoding something we
// know how to handle?  Is the format a real format?  Does the runtime
// environment have what we need?
//
// If the config is a guest at a club, this module checks the guest list,
// verifies the ID, pats them down, and THEN lets them in.  Overkill for
// "Hello, World!"?  Absolutely.  That's why we're here.
//
// MESSAGE INTEGRITY:
// Beyond type-checking, we also compute a SHA-256 hash of the message
// and attach it to the config.  Downstream modules can use this hash to
// verify the message hasn't been tampered with between pipeline stages.
// This is the "checksum" the architecture document mentions — it's
// computed here at the gate and verified (optionally) later.
//
// ENVIRONMENT PREREQUISITES:
// The validator also inspects the runtime environment to ensure Node.js
// is a version we support, the platform is known, and required features
// of the runtime are available (like Buffer and crypto).  If any of
// these checks fail, we throw before the pipeline even starts.
//
// VALIDATION LAYERS (in order):
//   1. Shape validation     — is config an object with the right keys?
//   2. Message validation   — is message a non-empty string within limits?
//   3. Encoding validation  — is encoding in SUPPORTED_ENCODINGS?
//   4. Format validation    — is format in SUPPORTED_FORMATS?
//   5. Output validation    — is output in SUPPORTED_OUTPUTS?
//   6. Feature validation   — are feature flags booleans?
//   7. Environment checks   — is Node.js new enough? Are APIs available?
//   8. Integrity stamp      — compute SHA-256 hash and attach to config
//
// WHY SO MANY CHECKS?
// In real systems, "garbage in, garbage out" is the #1 cause of bugs.
// By validating ruthlessly at the boundary, every downstream module can
// trust its inputs and skip defensive coding.  The Encoder doesn't need
// to check if the encoding is valid — the Validator already did.
//
// WHAT USES THIS:
//   main.js (orchestrator) — calls validateConfig() right after loadConfig()
//
// EXPORTS:
//   MIN_NODE_VERSION              — minimum supported Node.js major version
//   REQUIRED_GLOBALS              — list of global APIs we need
//   validateShape(config)         → throws if config is missing required keys
//   validateMessage(message)      → throws if message fails checks
//   validateEncoding(encoding)    → throws if encoding is unsupported
//   validateFormat(format)        → throws if format is unsupported
//   validateOutput(output)        → throws if output is unsupported
//   validateFeatures(features)    → throws if any flag is not a boolean
//   validateEnvironment()         → throws if runtime env is insufficient
//   computeMessageHash(message)   → SHA-256 hex digest of the message
//   validateConfig(config)        → the main entry point; returns stamped config
// ─────────────────────────────────────────────────────────────────────────────
'use strict';

// ── Imports ─────────────────────────────────────────────────────────────────

const crypto = require('crypto');

const {
  MAX_MESSAGE_LENGTH,
  SUPPORTED_ENCODINGS,
  SUPPORTED_FORMATS,
  SUPPORTED_OUTPUTS,
  isValidEncoding,
  isValidFormat,
  isValidOutput
} = require('./contracts');

// ── Constants ───────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────────────────
// MIN_NODE_VERSION
//
// The minimum major version of Node.js that this pipeline supports.
// We use features like Buffer.from() (added in v5.10, safe in v12+),
// crypto.createHash() (always available but we check anyway), and
// modern Array methods.  Setting the floor at 12 is conservative
// but ensures we don't run into surprises on ancient runtimes.
// ─────────────────────────────────────────────────────────────────────────────
const MIN_NODE_VERSION = 12;

// ─────────────────────────────────────────────────────────────────────────────
// REQUIRED_GLOBALS
//
// A list of global constructors / objects that must be available in the
// runtime for the pipeline to function.  If any of these are missing,
// something is very wrong (or we're running in a stripped-down sandbox).
//
//   'Buffer'  — needed by the Encoder/Decoder for Base64 and hex work
//   'crypto'  — needed here for SHA-256 hashing (it's a built-in, but check)
//   'process' — needed for env vars, pid, platform detection
//   'console' — needed by the Output Handler and Logger for display
// ─────────────────────────────────────────────────────────────────────────────
const REQUIRED_GLOBALS = ['Buffer', 'process', 'console'];

// ─────────────────────────────────────────────────────────────────────────────
// REQUIRED_CONFIG_KEYS
//
// The keys that MUST be present in the config object for the pipeline
// to proceed.  These correspond to the fields in DEFAULT_CONFIG from
// contracts.js.  If any are missing, the config didn't load correctly.
// ─────────────────────────────────────────────────────────────────────────────
const REQUIRED_CONFIG_KEYS = ['message', 'encoding', 'format', 'output'];

// ── Core Logic ──────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────────────────
// validateShape(config)
//
// Checks that the config object has the right "shape" — it exists, it's
// an object, and it contains all the required keys.  This is the first
// line of defence: if the shape is wrong, nothing else matters.
//
// Think of it like checking that a form has all the fields before you
// even start reading what's written in them.
//
//   config — the config object to validate
//   Throws: if config is not a non-null object
//   Throws: if any required key is missing
// ─────────────────────────────────────────────────────────────────────────────
function validateShape(config) {
  // ALGORITHM:
  // 1. Check that config is a non-null object — throw if not
  // 2. Iterate over REQUIRED_CONFIG_KEYS
  //    a. For each key, check that it exists in config (using `in` operator)
  //    b. If a key is missing, throw with the key name in the message
  // 3. Return true (all keys present)

  // Step 1 — is it even an object?
  if (!config || typeof config !== 'object' || Array.isArray(config)) {
    throw new Error(
      'validator.validateShape: config must be a non-null, non-array object'
    );
  }

  // Step 2 — check each required key
  for (let i = 0; i < REQUIRED_CONFIG_KEYS.length; i++) {
    const key = REQUIRED_CONFIG_KEYS[i];
    if (!(key in config)) {
      throw new Error(
        'validator.validateShape: config is missing required key "' + key + '"'
      );
    }
  }

  // Step 3 — all keys found
  return true;
}

// ─────────────────────────────────────────────────────────────────────────────
// validateMessage(message)
//
// Validates the message string itself.  It must be:
//   • A string (not a number, not null, not undefined)
//   • Non-empty (at least one character after trimming whitespace)
//   • Within the MAX_MESSAGE_LENGTH limit (no War and Peace, please)
//   • Contain only printable characters (no control chars except newline)
//
// Why check for printable characters?  Because if someone passes binary
// garbage as the "message", the Encoder and Formatter will produce
// unpredictable results.  Better to reject early.
//
//   message — the message string to validate
//   Throws:  if message is not a string
//   Throws:  if message is empty after trimming
//   Throws:  if message exceeds MAX_MESSAGE_LENGTH
//   Throws:  if message contains non-printable characters
// ─────────────────────────────────────────────────────────────────────────────
function validateMessage(message) {
  // ALGORITHM:
  // 1. Check that message is a string — throw if not
  // 2. Trim the message and check it's non-empty — throw if empty
  // 3. Check that message.length <= MAX_MESSAGE_LENGTH — throw if over
  // 4. Test message against a regex that matches printable ASCII + common
  //    Unicode ranges (letters, digits, punctuation, spaces, newlines)
  //    — throw if non-printable characters are found
  // 5. Return true

  // Step 1 — type check
  if (typeof message !== 'string') {
    throw new Error(
      'validator.validateMessage: message must be a string, got ' + typeof message
    );
  }

  // Step 2 — non-empty check (after trim)
  if (message.trim().length === 0) {
    throw new Error(
      'validator.validateMessage: message must not be empty or whitespace-only'
    );
  }

  // Step 3 — length cap
  //          MAX_MESSAGE_LENGTH is 1000 (from contracts.js)
  if (message.length > MAX_MESSAGE_LENGTH) {
    throw new Error(
      'validator.validateMessage: message length ' + message.length +
      ' exceeds maximum of ' + MAX_MESSAGE_LENGTH
    );
  }

  // Step 4 — printable characters check
  //          This regex matches strings composed entirely of printable
  //          characters: ASCII 0x20-0x7E, plus tab (\t), newline (\n),
  //          carriage return (\r), and common Unicode letters/symbols.
  //          If the message contains e.g. NUL bytes or ESC sequences,
  //          this will reject it.
  const printablePattern = /^[\x20-\x7E\t\n\r]*$/;
  if (!printablePattern.test(message)) {
    throw new Error(
      'validator.validateMessage: message contains non-printable characters'
    );
  }

  // Step 5 — all good
  return true;
}

// ─────────────────────────────────────────────────────────────────────────────
// validateEncoding(encoding)
//
// Checks that the encoding type is one we actually support.  There's no
// point proceeding if someone asks for "rot47" and we only handle rot13.
//
// Uses the isValidEncoding() helper from contracts.js so the allowed
// list is defined in exactly one place.
//
//   encoding — the encoding type string to validate
//   Throws:  if encoding is not a string
//   Throws:  if encoding is not in SUPPORTED_ENCODINGS
// ─────────────────────────────────────────────────────────────────────────────
function validateEncoding(encoding) {
  // ALGORITHM:
  // 1. Check that encoding is a string — throw if not
  // 2. Check isValidEncoding(encoding) — throw if false, listing valid options
  // 3. Return true

  // Step 1 — type check
  if (typeof encoding !== 'string') {
    throw new Error(
      'validator.validateEncoding: encoding must be a string, got ' + typeof encoding
    );
  }

  // Step 2 — check against the allowed list
  if (!isValidEncoding(encoding)) {
    throw new Error(
      'validator.validateEncoding: unsupported encoding "' + encoding +
      '". Supported: ' + SUPPORTED_ENCODINGS.join(', ')
    );
  }

  // Step 3 — valid
  return true;
}

// ─────────────────────────────────────────────────────────────────────────────
// validateFormat(format)
//
// Checks that the display format is one the Formatter knows how to handle.
//
//   format — the format type string to validate
//   Throws: if format is not a string
//   Throws: if format is not in SUPPORTED_FORMATS
// ─────────────────────────────────────────────────────────────────────────────
function validateFormat(format) {
  // ALGORITHM:
  // 1. Check that format is a string — throw if not
  // 2. Check isValidFormat(format) — throw if false, listing valid options
  // 3. Return true

  // Step 1 — type check
  if (typeof format !== 'string') {
    throw new Error(
      'validator.validateFormat: format must be a string, got ' + typeof format
    );
  }

  // Step 2 — check against the allowed list
  if (!isValidFormat(format)) {
    throw new Error(
      'validator.validateFormat: unsupported format "' + format +
      '". Supported: ' + SUPPORTED_FORMATS.join(', ')
    );
  }

  // Step 3 — valid
  return true;
}

// ─────────────────────────────────────────────────────────────────────────────
// validateOutput(output)
//
// Checks that the output destination is one the Output Handler supports.
//
//   output — the output destination string to validate
//   Throws: if output is not a string
//   Throws: if output is not in SUPPORTED_OUTPUTS
// ─────────────────────────────────────────────────────────────────────────────
function validateOutput(output) {
  // ALGORITHM:
  // 1. Check that output is a string — throw if not
  // 2. Check isValidOutput(output) — throw if false, listing valid options
  // 3. Return true

  // Step 1 — type check
  if (typeof output !== 'string') {
    throw new Error(
      'validator.validateOutput: output must be a string, got ' + typeof output
    );
  }

  // Step 2 — check against the allowed list
  if (!isValidOutput(output)) {
    throw new Error(
      'validator.validateOutput: unsupported output "' + output +
      '". Supported: ' + SUPPORTED_OUTPUTS.join(', ')
    );
  }

  // Step 3 — valid
  return true;
}

// ─────────────────────────────────────────────────────────────────────────────
// validateFeatures(features)
//
// Checks that the feature flags object is well-formed.  Every value
// must be a boolean — no strings, no numbers, no "truthy" values.
// We're strict here because a feature flag that's accidentally the
// string "false" instead of the boolean false would silently enable
// a feature (since "false" is truthy in JavaScript).  Ask me how I know.
//
//   features — the features object from config
//   Throws:  if features is not a non-null object
//   Throws:  if any feature flag value is not a boolean
// ─────────────────────────────────────────────────────────────────────────────
function validateFeatures(features) {
  // ALGORITHM:
  // 1. Check that features is a non-null object — throw if not
  // 2. Iterate over every key in features
  //    a. Check that the value is typeof 'boolean' — throw if not
  // 3. Return true

  // Step 1 — shape check
  if (!features || typeof features !== 'object' || Array.isArray(features)) {
    throw new Error(
      'validator.validateFeatures: features must be a non-null, non-array object'
    );
  }

  // Step 2 — every value must be a boolean
  const keys = Object.keys(features);
  for (let i = 0; i < keys.length; i++) {
    const key   = keys[i];
    const value = features[key];
    if (typeof value !== 'boolean') {
      throw new Error(
        'validator.validateFeatures: feature "' + key +
        '" must be a boolean, got ' + typeof value
      );
    }
  }

  // Step 3 — all flags valid
  return true;
}

// ─────────────────────────────────────────────────────────────────────────────
// validateEnvironment()
//
// Checks that the runtime environment meets our prerequisites.  This is
// like a pre-flight check before takeoff:
//
//   1. Is the Node.js version high enough?
//   2. Are required global APIs (Buffer, process, console) available?
//   3. Is the crypto module functional? (Can we actually hash things?)
//
// If any check fails, we throw immediately.  There's no point trying
// to run the pipeline in an environment that can't support it.
//
//   Throws: if Node.js version is below MIN_NODE_VERSION
//   Throws: if a required global is missing
//   Throws: if crypto.createHash is not available
//   Returns: an object summarising the environment (for logging)
// ─────────────────────────────────────────────────────────────────────────────
function validateEnvironment() {
  // ALGORITHM:
  // 1. Extract the major version number from process.version
  //    (process.version is like "v18.17.0" — parse the number after "v")
  // 2. Check that the major version >= MIN_NODE_VERSION — throw if not
  // 3. Iterate over REQUIRED_GLOBALS
  //    a. Check that each name exists as a property of globalThis (or global)
  //    b. If missing, throw with the name of the missing global
  // 4. Check that crypto.createHash is a function — throw if not
  //    (This confirms the crypto module loaded correctly)
  // 5. Smoke-test the hash function by hashing an empty string
  //    — if it throws, wrap and re-throw the error
  // 6. Return an environment summary object:
  //    { nodeVersion: string, platform: string, pid: number, validated: true }

  // Step 1 — parse Node.js major version
  //          process.version looks like "v18.17.0"
  //          We split on '.', take the first part, strip the 'v', parse as int.
  const versionString = process.version;                      // e.g. "v18.17.0"
  const majorVersion  = parseInt(versionString.slice(1), 10); // e.g. 18

  // Step 2 — check minimum version
  if (isNaN(majorVersion) || majorVersion < MIN_NODE_VERSION) {
    throw new Error(
      'validator.validateEnvironment: Node.js v' + MIN_NODE_VERSION +
      '+ required, found ' + versionString
    );
  }

  // Step 3 — check required globals
  //          We use `typeof` against the global scope because `globalThis`
  //          might not exist in very old Node (but we already checked version).
  const globalScope = typeof globalThis !== 'undefined' ? globalThis : global;
  for (let i = 0; i < REQUIRED_GLOBALS.length; i++) {
    const name = REQUIRED_GLOBALS[i];
    if (typeof globalScope[name] === 'undefined') {
      throw new Error(
        'validator.validateEnvironment: required global "' + name + '" is not available'
      );
    }
  }

  // Step 4 — check that crypto.createHash is a function
  if (typeof crypto.createHash !== 'function') {
    throw new Error(
      'validator.validateEnvironment: crypto.createHash is not available'
    );
  }

  // Step 5 — smoke test the hash function
  //          If the crypto module is somehow broken, this will throw.
  try {
    crypto.createHash('sha256').update('').digest('hex');
  } catch (err) {
    throw new Error(
      'validator.validateEnvironment: crypto smoke test failed — ' + err.message
    );
  }

  // Step 6 — return environment summary
  return {
    nodeVersion: versionString,
    platform:    process.platform,
    pid:         process.pid,
    validated:   true
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// computeMessageHash(message)
//
// Computes a SHA-256 hash of the message and returns it as a hex string.
// This hash serves as a fingerprint — if the message changes by even one
// character, the hash will be completely different.
//
// Downstream modules (especially the Processor) can re-hash the message
// and compare it to this value to detect tampering or corruption.
//
// For "Hello, World!" the SHA-256 hex digest is:
//   dffd6021bb2bd5b0af676290809ec3a53191dd81c7f70a4b28688a362182986f
// (Yes, we computed the hash of a hash of a message that was XOR-encrypted.
//  Peak over-engineering.)
//
//   message — the plain-text message string
//   Returns: the SHA-256 hex digest as a 64-character string
//   Throws:  if message is not a string
// ─────────────────────────────────────────────────────────────────────────────
function computeMessageHash(message) {
  // ALGORITHM:
  // 1. Validate that message is a string — throw if not
  // 2. Create a SHA-256 hash object via crypto.createHash('sha256')
  // 3. Feed the message into the hash via .update(message, 'utf8')
  // 4. Finalize and get the hex digest via .digest('hex')
  // 5. Return the hex digest string

  // Step 1 — type check
  if (typeof message !== 'string') {
    throw new Error(
      'validator.computeMessageHash: message must be a string, got ' + typeof message
    );
  }

  // Step 2 — create the hasher
  const hasher = crypto.createHash('sha256');

  // Step 3 — feed in the message
  hasher.update(message, 'utf8');

  // Step 4 — finalize to hex
  const hexDigest = hasher.digest('hex');

  // Step 5 — return the digest
  return hexDigest;
}

// ─────────────────────────────────────────────────────────────────────────────
// validateConfig(config)
//
// The main entry point for the Validator module.  This is the "bouncer"
// function that orchestrates all the individual checks in order.
//
// It runs every validation layer, then stamps the config with a message
// hash for downstream integrity checking.  The returned config is a
// shallow copy of the original with the hash attached — the original
// config object is not mutated.
//
// Validation order:
//   1. Shape           — does the config have the right keys?
//   2. Message         — is the message valid?
//   3. Encoding        — is the encoding supported?
//   4. Format          — is the format supported?
//   5. Output          — is the output destination supported?
//   6. Features        — are feature flags well-formed? (if present)
//   7. Environment     — does the runtime meet requirements?
//   8. Integrity stamp — compute and attach SHA-256 hash
//
//   config  — the config object from loadConfig()
//   Returns — a validated, hash-stamped copy of the config
//   Throws  — if any validation check fails
// ─────────────────────────────────────────────────────────────────────────────
function validateConfig(config) {
  // ALGORITHM:
  //  1. Run validateShape(config) — will throw if shape is wrong
  //  2. Run validateMessage(config.message) — will throw if message is bad
  //  3. Run validateEncoding(config.encoding) — will throw if encoding unknown
  //  4. Run validateFormat(config.format) — will throw if format unknown
  //  5. Run validateOutput(config.output) — will throw if output unknown
  //  6. If config.features exists and is an object, run validateFeatures()
  //  7. Run validateEnvironment() and store the result
  //  8. Create a shallow copy of config
  //  9. Compute the message hash via computeMessageHash(config.message)
  // 10. Attach the hash to the copy as config._messageHash
  // 11. Attach the environment summary to the copy as config._env
  // 12. Attach a validation timestamp as config._validatedAt (ISO string)
  // 13. Return the stamped copy

  // Step 1 — shape check
  validateShape(config);

  // Step 2 — message check
  validateMessage(config.message);

  // Step 3 — encoding check
  validateEncoding(config.encoding);

  // Step 4 — format check
  validateFormat(config.format);

  // Step 5 — output check
  validateOutput(config.output);

  // Step 6 — feature flags check (only if features are present)
  //          The config might not have features if it was built manually
  //          or from a minimal config file.  That's OK — features are
  //          optional at the config level.
  if (config.features && typeof config.features === 'object') {
    validateFeatures(config.features);
  }

  // Step 7 — environment prerequisites
  const envSummary = validateEnvironment();

  // Step 8 — shallow copy so we don't mutate the original
  const validated = Object.assign({}, config);

  // Step 9 — compute the integrity hash
  const hash = computeMessageHash(config.message);

  // Step 10 — attach the hash
  validated._messageHash = hash;

  // Step 11 — attach the environment summary
  validated._env = envSummary;

  // Step 12 — attach the validation timestamp
  validated._validatedAt = new Date().toISOString();

  // Step 13 — return the stamped config
  return validated;
}

// ── Exports ─────────────────────────────────────────────────────────────────

module.exports = {
  // Constants (exported for testing and documentation)
  MIN_NODE_VERSION,
  REQUIRED_GLOBALS,
  REQUIRED_CONFIG_KEYS,

  // Individual validators (exported for granular testing)
  validateShape,
  validateMessage,
  validateEncoding,
  validateFormat,
  validateOutput,
  validateFeatures,
  validateEnvironment,

  // Utility
  computeMessageHash,

  // Main entry point
  validateConfig
};
