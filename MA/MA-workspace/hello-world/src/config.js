// ── Pipeline · Config Loader ──────────────────────────────────────────────────
//
// HOW CONFIG LOADING WORKS:
// Before the pipeline can do anything, it needs to know WHAT to do.
// This module is like reading the instruction manual before assembling
// furniture — it loads the settings that tell every other module how
// to behave.
//
// THE ENCRYPTED MESSAGE:
// The "Hello, World!" message is NOT stored in plain text — that would be
// far too simple for an over-engineered project.  Instead, it lives as a
// Base64-encoded, byte-reversed, XOR-obfuscated constant.  To retrieve it,
// we must:
//   1. Base64-decode the stored constant
//   2. Reverse the byte order
//   3. XOR each byte with the obfuscation key
// This is spectacularly unnecessary.  That's the point.
//
// ENVIRONMENT SETTINGS:
// The module reads environment variables to allow runtime behaviour changes
// without touching code.  Each env var maps to a config key:
//   HW_MESSAGE   → message override
//   HW_ENCODING  → encoding type (base64, hex, rot13, reverse)
//   HW_FORMAT    → display format (uppercase, bordered, banner, plain)
//   HW_OUTPUT    → output destination (console, file, return)
//   HW_LOG_FILE  → path for the audit log file
//   HW_ENV       → environment name (development, staging, production)
//   HW_DEBUG     → enable debug mode ("true" / "false")
//
// FEATURE FLAGS:
// Feature flags let us toggle pipeline behaviours without rewriting logic.
// They live in the config under the `features` key:
//   enableChecksum    — if true, the Processor adds a CRC checksum
//   enableTimestamp   — if true, the Processor adds a timestamp
//   enableBorder      — if true, the Formatter adds a box border
//   enableAuditLog    — if true, the Logger writes to disk
//   enableColour      — if true, the Output Handler uses ANSI colours
//   failFast          — if true, pipeline halts on first error
//
// RUNTIME CONFIGURATION:
// A `runtime` section captures computed values that other modules may need:
//   pid        — the current process ID
//   startedAt  — ISO timestamp of when config was loaded
//   nodeVersion — the Node.js version string
//   platform   — the OS platform (linux, darwin, win32, etc.)
//   cwd        — current working directory at load time
//
// CONFIG PRIORITY (lowest → highest):
//   1. Hardcoded defaults (DEFAULT_CONFIG from contracts.js)
//   2. Decrypted message constant (replaces default message)
//   3. JSON config file on disk (hello-world.config.json)
//   4. Environment variables (HW_*)
//   5. Runtime overrides passed to loadConfig()
//
// WHAT USES THIS:
//   main.js (orchestrator) — calls loadConfig() at pipeline start
//
// EXPORTS:
//   ENCRYPTED_MESSAGE              — the obfuscated message constant
//   XOR_KEY                        — the obfuscation key byte
//   ENVIRONMENT_MAP                — mapping of env var names → config keys
//   DEFAULT_FEATURES               — default feature flag values
//   decryptMessage(encrypted, key) → the plain-text message
//   loadEnvironment()              → config fragment from env vars
//   loadFeatureFlags(overrides?)   → merged feature flag object
//   buildRuntimeInfo()             → runtime info object
//   loadConfig(overrides?)         → complete config object
// ─────────────────────────────────────────────────────────────────────────────
'use strict';

// ── Imports ─────────────────────────────────────────────────────────────────

const fs   = require('fs');
const path = require('path');
const {
  DEFAULT_CONFIG,
  MAX_MESSAGE_LENGTH,
  isValidEncoding,
  isValidFormat,
  isValidOutput
} = require('./contracts');

// ── Constants ───────────────────────────────────────────────────────────────

// The config file name that loadConfig will look for on disk.
const CONFIG_FILENAME = 'hello-world.config.json';

// ─────────────────────────────────────────────────────────────────────────────
// XOR_KEY
//
// The single-byte key used to XOR-obfuscate the message.  Every byte of
// "Hello, World!" was XORed with this value, then the result was reversed
// and Base64-encoded.  The key is 0x42 (66 decimal, the letter 'B') —
// chosen because 42 was taken and 0x42 is the next best thing.
// ─────────────────────────────────────────────────────────────────────────────
const XOR_KEY = 0x42;

// ─────────────────────────────────────────────────────────────────────────────
// ENCRYPTED_MESSAGE
//
// "Hello, World!" stored as a Base64-encoded, byte-reversed, XOR-obfuscated
// constant.  To build this value, the following steps were applied:
//
//   Step A: Start with "Hello, World!" as bytes:
//           [72, 101, 108, 108, 111, 44, 32, 87, 111, 114, 108, 100, 33]
//
//   Step B: XOR each byte with 0x42:
//           [72^66, 101^66, 108^66, ...] = [10, 39, 46, 46, 45, 110, 98, 21, 45, 48, 46, 38, 99]
//
//   Step C: Reverse the byte array:
//           [99, 38, 46, 48, 45, 21, 98, 110, 45, 46, 46, 39, 10]
//
//   Step D: Base64-encode the byte array:
//           "YyYuMC0VYm4tLi4nCg=="
//
// To recover the original message, reverse these steps: decode → reverse → XOR.
// ─────────────────────────────────────────────────────────────────────────────
const ENCRYPTED_MESSAGE = 'YyYuMC0VYm4tLi4nCg==';

// ─────────────────────────────────────────────────────────────────────────────
// ENVIRONMENT_MAP
//
// Maps environment variable names to their corresponding config keys.
// This lets operators configure the pipeline via env vars in production
// without touching the config file or source code.
//
// Example:  HW_ENCODING=hex node main.js  →  config.encoding === 'hex'
// ─────────────────────────────────────────────────────────────────────────────
const ENVIRONMENT_MAP = {
  HW_MESSAGE:  'message',   // Override the pipeline message
  HW_ENCODING: 'encoding',  // Override the encoding type
  HW_FORMAT:   'format',    // Override the display format
  HW_OUTPUT:   'output',    // Override the output destination
  HW_LOG_FILE: 'logFile',   // Set the audit log file path
  HW_ENV:      'env',       // Set the environment name
  HW_DEBUG:    'debug'      // Enable or disable debug mode
};

// ─────────────────────────────────────────────────────────────────────────────
// DEFAULT_FEATURES
//
// Feature flags with sensible defaults.  Each flag controls one optional
// behaviour in the pipeline.  All flags default to true except the audit
// log (which requires a file path) and debug mode.
//
// Why feature flags for "Hello, World!"?  Because we can.
// ─────────────────────────────────────────────────────────────────────────────
const DEFAULT_FEATURES = {
  enableChecksum:  true,   // Processor adds a CRC-style checksum to the payload
  enableTimestamp: true,   // Processor attaches a timestamp to metadata
  enableBorder:   true,    // Formatter draws a box border around the message
  enableAuditLog: false,   // Logger writes audit trail to disk (needs logFile)
  enableColour:   true,    // Output Handler uses ANSI colour codes
  failFast:       true     // Pipeline halts on first error instead of continuing
};

// ── Core Logic ──────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────────────────
// decryptMessage(encrypted, key)
//
// Recovers the original plain-text message from its obfuscated form.
// This reverses the encryption steps: Base64 decode → byte-reverse → XOR.
//
// Think of it like a three-lock safe — you need to undo all three locks
// in reverse order to get to the contents.
//
//   encrypted — the Base64-encoded, reversed, XOR'd string
//   key       — the XOR key byte (must match the one used to encrypt)
//   Returns:  the original plain-text message as a string
//   Throws:   if encrypted is not a non-empty string
//   Throws:   if key is not a number between 0x00 and 0xFF
// ─────────────────────────────────────────────────────────────────────────────
function decryptMessage(encrypted, key) {
  // ALGORITHM:
  // 1. Validate that `encrypted` is a non-empty string — throw if not
  // 2. Validate that `key` is a number in range 0x00..0xFF — throw if not
  // 3. Base64-decode `encrypted` into a byte array (Buffer)
  // 4. Reverse the byte array
  // 5. XOR each byte with `key`
  // 6. Convert the resulting bytes back to a UTF-8 string
  // 7. Return the string

  // Step 1 — validate the encrypted input
  if (typeof encrypted !== 'string' || encrypted.length === 0) {
    throw new Error('config.decryptMessage: encrypted must be a non-empty string');
  }

  // Step 2 — validate the XOR key
  if (typeof key !== 'number' || key < 0x00 || key > 0xFF || !Number.isInteger(key)) {
    throw new Error('config.decryptMessage: key must be an integer between 0x00 and 0xFF');
  }

  // Step 3 — Base64-decode into a byte buffer
  const decoded = Buffer.from(encrypted, 'base64');

  // Step 4 — reverse the byte order
  //          We copy into a new buffer so the original is untouched.
  const reversed = Buffer.from([...decoded].reverse());

  // Step 5 — XOR each byte with the key
  const xored = Buffer.alloc(reversed.length);
  for (let i = 0; i < reversed.length; i++) {
    xored[i] = reversed[i] ^ key;
  }

  // Step 6 — convert to UTF-8 string
  const plainText = xored.toString('utf8');

  // Step 7 — return the recovered message
  return plainText;
}

// ─────────────────────────────────────────────────────────────────────────────
// loadEnvironment()
//
// Reads environment variables and maps them to config keys.  Only variables
// that are actually set in the environment are included — unset vars are
// skipped so they don't overwrite defaults or file config.
//
// The HW_DEBUG variable is special: it's converted from a string to a
// boolean ("true" → true, everything else → false).
//
//   Returns: an object with config keys from env vars (may be empty)
// ─────────────────────────────────────────────────────────────────────────────
function loadEnvironment() {
  // ALGORITHM:
  // 1. Create an empty result object
  // 2. Iterate over every key in ENVIRONMENT_MAP
  //    a. Read the env var from process.env using the key
  //    b. If the env var is undefined, skip it
  //    c. If the config key is 'debug', convert to boolean
  //    d. Otherwise, store the string value under the config key
  // 3. Return the result object

  // Step 1 — start with empty result
  const envConfig = {};

  // Step 2 — iterate over the environment mapping
  const envKeys = Object.keys(ENVIRONMENT_MAP);
  for (let i = 0; i < envKeys.length; i++) {
    const envVar    = envKeys[i];                     // e.g. 'HW_ENCODING'
    const configKey = ENVIRONMENT_MAP[envVar];         // e.g. 'encoding'
    const value     = process.env[envVar];             // e.g. 'hex' or undefined

    // Step 2a/2b — skip unset variables
    if (value === undefined) {
      continue;
    }

    // Step 2c — special handling for boolean flags
    if (configKey === 'debug') {
      envConfig[configKey] = (value.toLowerCase() === 'true');
      continue;
    }

    // Step 2d — store string value
    envConfig[configKey] = value;
  }

  // Step 3 — return whatever we found
  return envConfig;
}

// ─────────────────────────────────────────────────────────────────────────────
// loadFeatureFlags(overrides?)
//
// Builds a complete feature flag object by merging DEFAULT_FEATURES with
// any overrides.  Overrides can come from the config file, env vars, or
// direct function arguments.
//
// Only known feature flag keys are accepted — unknown keys are ignored
// to prevent typos from silently creating phantom flags.
//
//   overrides — optional object with feature flag keys to override
//   Returns:  a complete feature flag object with all flags defined
// ─────────────────────────────────────────────────────────────────────────────
function loadFeatureFlags(overrides) {
  // ALGORITHM:
  // 1. Start with a shallow copy of DEFAULT_FEATURES
  // 2. If overrides is a non-null object:
  //    a. Iterate over keys in DEFAULT_FEATURES
  //    b. If the key exists in overrides AND is a boolean, copy it over
  //    c. Ignore keys that aren't in DEFAULT_FEATURES (prevent phantom flags)
  // 3. Return the merged feature flags

  // Step 1 — copy the defaults
  const flags = Object.assign({}, DEFAULT_FEATURES);

  // Step 2 — merge valid overrides
  if (overrides && typeof overrides === 'object') {
    const knownKeys = Object.keys(DEFAULT_FEATURES);
    for (let i = 0; i < knownKeys.length; i++) {
      const key = knownKeys[i];
      if (key in overrides && typeof overrides[key] === 'boolean') {
        flags[key] = overrides[key];
      }
    }
  }

  // Step 3 — return the complete flags
  return flags;
}

// ─────────────────────────────────────────────────────────────────────────────
// buildRuntimeInfo()
//
// Captures a snapshot of the runtime environment at the moment config is
// loaded.  This information is useful for debugging and audit logging —
// it tells you exactly where and when the pipeline ran.
//
//   Returns: an object with pid, startedAt, nodeVersion, platform, cwd
// ─────────────────────────────────────────────────────────────────────────────
function buildRuntimeInfo() {
  // ALGORITHM:
  // 1. Build and return an object with:
  //    - pid:         process.pid
  //    - startedAt:   new Date().toISOString()
  //    - nodeVersion: process.version
  //    - platform:    process.platform
  //    - cwd:         process.cwd()

  return {
    pid:         process.pid,
    startedAt:   new Date().toISOString(),
    nodeVersion: process.version,
    platform:    process.platform,
    cwd:         process.cwd()
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// loadConfig(overrides?)
//
// The main entry point.  Builds a complete, merged config object by layering
// five sources from lowest to highest priority:
//
//   1. DEFAULT_CONFIG from contracts.js (base layer)
//   2. Decrypted message from ENCRYPTED_MESSAGE (replaces default message)
//   3. JSON config file on disk, if it exists (overrides defaults)
//   4. Environment variables via loadEnvironment() (overrides file)
//   5. Runtime overrides passed as argument (highest priority)
//
// The returned config also includes:
//   - features: merged feature flags
//   - runtime:  snapshot of the runtime environment
//   - _sources: an array listing which sources contributed (for debugging)
//
//   overrides — optional object with any config keys to override
//   Returns:  a fully assembled config object ready for the Validator
// ─────────────────────────────────────────────────────────────────────────────
function loadConfig(overrides) {
  // ALGORITHM:
  //  1. Start with a shallow copy of DEFAULT_CONFIG
  //  2. Track which sources contributed in a _sources array
  //  3. Decrypt the message from ENCRYPTED_MESSAGE using XOR_KEY
  //     a. If decryption succeeds and result is non-empty, set config.message
  //     b. Add 'encrypted_constant' to _sources
  //     c. If decryption fails, keep the default (log nothing — Validator catches)
  //  4. Try to load and merge a config file:
  //     a. Build the file path: __dirname/../hello-world.config.json
  //     b. If the file exists, read and JSON.parse it
  //     c. If parsing succeeds, merge onto config and add 'config_file' to _sources
  //     d. If file missing or parse fails, skip silently
  //  5. Load environment variables via loadEnvironment()
  //     a. If the env result has any keys, merge and add 'environment' to _sources
  //  6. If overrides is a non-null object, merge and add 'overrides' to _sources
  //  7. Build feature flags:
  //     a. Merge any overrides.features or config.features via loadFeatureFlags
  //     b. Set config.features to the result
  //  8. Attach runtime info via buildRuntimeInfo() to config.runtime
  //  9. Attach _sources to config._sources
  // 10. Return the final config object

  // Step 1 — start with defaults
  const config = Object.assign({}, DEFAULT_CONFIG);

  // Step 2 — track sources for debugging
  const sources = ['defaults'];

  // Step 3 — decrypt the stored message constant
  try {
    const decrypted = decryptMessage(ENCRYPTED_MESSAGE, XOR_KEY);
    if (typeof decrypted === 'string' && decrypted.length > 0) {
      config.message = decrypted;
      sources.push('encrypted_constant');
    }
  } catch (_err) {
    // Decryption failed — keep the default message.
    // The Validator will catch any issues downstream.
  }

  // Step 4 — try to layer on file-based config
  try {
    const filePath = path.resolve(__dirname, '..', CONFIG_FILENAME);
    if (fs.existsSync(filePath)) {
      const raw        = fs.readFileSync(filePath, 'utf8');
      const fileConfig = JSON.parse(raw);
      if (fileConfig && typeof fileConfig === 'object') {
        // Separate features from the rest so we can merge them properly later
        const fileFeatures = fileConfig.features || null;
        delete fileConfig.features;
        Object.assign(config, fileConfig);
        if (fileFeatures) {
          config._fileFeatures = fileFeatures;
        }
        sources.push('config_file');
      }
    }
  } catch (_err) {
    // File missing or malformed — that's fine, we have defaults
  }

  // Step 5 — layer on environment variables
  const envConfig = loadEnvironment();
  if (Object.keys(envConfig).length > 0) {
    Object.assign(config, envConfig);
    sources.push('environment');
  }

  // Step 6 — layer on runtime overrides (highest priority)
  let overrideFeatures = null;
  if (overrides && typeof overrides === 'object') {
    // Pull features aside for proper merging
    overrideFeatures = overrides.features || null;
    const overrideCopy = Object.assign({}, overrides);
    delete overrideCopy.features;
    Object.assign(config, overrideCopy);
    sources.push('overrides');
  }

  // Step 7 — build feature flags by merging all feature sources
  const featureSources = Object.assign(
    {},
    config._fileFeatures || {},
    overrideFeatures || {}
  );
  config.features = loadFeatureFlags(featureSources);
  delete config._fileFeatures; // clean up temp key

  // Step 8 — attach runtime info
  config.runtime = buildRuntimeInfo();

  // Step 9 — attach the sources list
  config._sources = sources;

  // Step 10 — return the final config
  return config;
}

// ── Exports ─────────────────────────────────────────────────────────────────

module.exports = {
  // Constants (exported for testing and for modules that need them directly)
  ENCRYPTED_MESSAGE,
  XOR_KEY,
  ENVIRONMENT_MAP,
  DEFAULT_FEATURES,
  CONFIG_FILENAME,

  // Functions
  decryptMessage,
  loadEnvironment,
  loadFeatureFlags,
  buildRuntimeInfo,
  loadConfig
};
