// ── Tests · Validator Module ──────────────────────────────────────────────────
//
// Tests every exported function in validator.js:
//   - validateShape:       shape / missing-key detection
//   - validateMessage:     type, empty, length, printable checks
//   - validateEncoding:    supported vs unsupported encodings
//   - validateFormat:      supported vs unsupported formats
//   - validateOutput:      supported vs unsupported outputs
//   - validateFeatures:    boolean enforcement on feature flags
//   - validateEnvironment: Node version, globals, crypto smoke test
//   - computeMessageHash:  SHA-256 correctness
//   - validateConfig:      full orchestration + stamp attachment
//
// Run:  node hello-world/tests/test-validator.js
// ─────────────────────────────────────────────────────────────────────────────
'use strict';

const {
  MIN_NODE_VERSION,
  REQUIRED_GLOBALS,
  REQUIRED_CONFIG_KEYS,
  validateShape,
  validateMessage,
  validateEncoding,
  validateFormat,
  validateOutput,
  validateFeatures,
  validateEnvironment,
  computeMessageHash,
  validateConfig
} = require('../src/validator');

const crypto = require('crypto');

// ── Test Harness (minimal) ──────────────────────────────────────────────────

let passed = 0;
let failed = 0;

/**
 * Run a single test case.
 *   name — description of the test
 *   fn   — function that throws on failure
 */
function test(name, fn) {
  try {
    fn();
    passed++;
    console.log('  ✓ ' + name);
  } catch (err) {
    failed++;
    console.log('  ✗ ' + name);
    console.log('    ' + err.message);
  }
}

/**
 * Assert that a value is strictly true.
 */
function assert(value, msg) {
  if (value !== true) {
    throw new Error('Assertion failed: ' + (msg || 'expected true'));
  }
}

/**
 * Assert that calling fn throws an error whose message includes `substr`.
 */
function assertThrows(fn, substr) {
  let threw = false;
  try {
    fn();
  } catch (err) {
    threw = true;
    if (substr && !err.message.includes(substr)) {
      throw new Error(
        'Expected error containing "' + substr + '", got: "' + err.message + '"'
      );
    }
  }
  if (!threw) {
    throw new Error('Expected function to throw' + (substr ? ' (' + substr + ')' : ''));
  }
}

// ── Helper: valid config for reuse ──────────────────────────────────────────

function makeValidConfig() {
  return {
    message:  'Hello, World!',
    encoding: 'base64',
    format:   'bordered',
    output:   'console',
    features: {
      enableChecksum:  true,
      enableTimestamp: true,
      enableBorder:   true,
      enableAuditLog: false,
      enableColour:   true,
      failFast:       true
    }
  };
}

// ── Tests ───────────────────────────────────────────────────────────────────

console.log('\n── Validator Tests ─────────────────────────────────────────\n');

// ── Constants ───────────────────────────────────────────────────────────────

console.log('Constants:');

test('MIN_NODE_VERSION is 12', () => {
  assert(MIN_NODE_VERSION === 12, 'expected 12, got ' + MIN_NODE_VERSION);
});

test('REQUIRED_GLOBALS has 3 entries', () => {
  assert(REQUIRED_GLOBALS.length === 3, 'expected 3');
});

test('REQUIRED_CONFIG_KEYS has 4 entries', () => {
  assert(REQUIRED_CONFIG_KEYS.length === 4, 'expected 4');
  assert(REQUIRED_CONFIG_KEYS.includes('message'), 'missing message');
  assert(REQUIRED_CONFIG_KEYS.includes('encoding'), 'missing encoding');
  assert(REQUIRED_CONFIG_KEYS.includes('format'), 'missing format');
  assert(REQUIRED_CONFIG_KEYS.includes('output'), 'missing output');
});

// ── validateShape ───────────────────────────────────────────────────────────

console.log('\nvalidateShape:');

test('accepts a valid config', () => {
  assert(validateShape(makeValidConfig()) === true);
});

test('throws on null', () => {
  assertThrows(() => validateShape(null), 'validator.validateShape');
});

test('throws on undefined', () => {
  assertThrows(() => validateShape(undefined), 'validator.validateShape');
});

test('throws on a string', () => {
  assertThrows(() => validateShape('not an object'), 'validator.validateShape');
});

test('throws on an array', () => {
  assertThrows(() => validateShape([1, 2, 3]), 'validator.validateShape');
});

test('throws when message key is missing', () => {
  const cfg = makeValidConfig();
  delete cfg.message;
  assertThrows(() => validateShape(cfg), 'missing required key "message"');
});

test('throws when encoding key is missing', () => {
  const cfg = makeValidConfig();
  delete cfg.encoding;
  assertThrows(() => validateShape(cfg), 'missing required key "encoding"');
});

test('throws when format key is missing', () => {
  const cfg = makeValidConfig();
  delete cfg.format;
  assertThrows(() => validateShape(cfg), 'missing required key "format"');
});

test('throws when output key is missing', () => {
  const cfg = makeValidConfig();
  delete cfg.output;
  assertThrows(() => validateShape(cfg), 'missing required key "output"');
});

// ── validateMessage ─────────────────────────────────────────────────────────

console.log('\nvalidateMessage:');

test('accepts "Hello, World!"', () => {
  assert(validateMessage('Hello, World!') === true);
});

test('accepts a single character', () => {
  assert(validateMessage('x') === true);
});

test('accepts message with tabs and newlines', () => {
  assert(validateMessage('line1\n\tline2\r\n') === true);
});

test('throws on non-string (number)', () => {
  assertThrows(() => validateMessage(42), 'validator.validateMessage');
});

test('throws on non-string (null)', () => {
  assertThrows(() => validateMessage(null), 'validator.validateMessage');
});

test('throws on empty string', () => {
  assertThrows(() => validateMessage(''), 'empty or whitespace');
});

test('throws on whitespace-only string', () => {
  assertThrows(() => validateMessage('   '), 'empty or whitespace');
});

test('throws on message exceeding MAX_MESSAGE_LENGTH', () => {
  const long = 'A'.repeat(1001);
  assertThrows(() => validateMessage(long), 'exceeds maximum');
});

test('accepts message exactly at MAX_MESSAGE_LENGTH', () => {
  const exact = 'A'.repeat(1000);
  assert(validateMessage(exact) === true);
});

test('throws on non-printable characters (NUL byte)', () => {
  assertThrows(() => validateMessage('Hello\x00World'), 'non-printable');
});

test('throws on control character (BEL)', () => {
  assertThrows(() => validateMessage('Hello\x07World'), 'non-printable');
});

// ── validateEncoding ────────────────────────────────────────────────────────

console.log('\nvalidateEncoding:');

test('accepts "base64"', () => {
  assert(validateEncoding('base64') === true);
});

test('accepts "hex"', () => {
  assert(validateEncoding('hex') === true);
});

test('accepts "rot13"', () => {
  assert(validateEncoding('rot13') === true);
});

test('accepts "reverse"', () => {
  assert(validateEncoding('reverse') === true);
});

test('throws on unsupported encoding', () => {
  assertThrows(() => validateEncoding('rot47'), 'unsupported encoding');
});

test('throws on non-string encoding', () => {
  assertThrows(() => validateEncoding(123), 'validator.validateEncoding');
});

// ── validateFormat ──────────────────────────────────────────────────────────

console.log('\nvalidateFormat:');

test('accepts "uppercase"', () => {
  assert(validateFormat('uppercase') === true);
});

test('accepts "bordered"', () => {
  assert(validateFormat('bordered') === true);
});

test('accepts "banner"', () => {
  assert(validateFormat('banner') === true);
});

test('accepts "plain"', () => {
  assert(validateFormat('plain') === true);
});

test('throws on unsupported format', () => {
  assertThrows(() => validateFormat('markdown'), 'unsupported format');
});

test('throws on non-string format', () => {
  assertThrows(() => validateFormat(null), 'validator.validateFormat');
});

// ── validateOutput ──────────────────────────────────────────────────────────

console.log('\nvalidateOutput:');

test('accepts "console"', () => {
  assert(validateOutput('console') === true);
});

test('accepts "file"', () => {
  assert(validateOutput('file') === true);
});

test('accepts "return"', () => {
  assert(validateOutput('return') === true);
});

test('throws on unsupported output', () => {
  assertThrows(() => validateOutput('socket'), 'unsupported output');
});

test('throws on non-string output', () => {
  assertThrows(() => validateOutput(42), 'validator.validateOutput');
});

// ── validateFeatures ────────────────────────────────────────────────────────

console.log('\nvalidateFeatures:');

test('accepts valid feature flags', () => {
  assert(validateFeatures({ enableChecksum: true, failFast: false }) === true);
});

test('accepts empty features object', () => {
  assert(validateFeatures({}) === true);
});

test('throws on null', () => {
  assertThrows(() => validateFeatures(null), 'validator.validateFeatures');
});

test('throws on array', () => {
  assertThrows(() => validateFeatures([]), 'validator.validateFeatures');
});

test('throws on non-boolean flag (string "true")', () => {
  assertThrows(
    () => validateFeatures({ enableChecksum: 'true' }),
    'must be a boolean'
  );
});

test('throws on non-boolean flag (number 1)', () => {
  assertThrows(
    () => validateFeatures({ failFast: 1 }),
    'must be a boolean'
  );
});

// ── validateEnvironment ─────────────────────────────────────────────────────

console.log('\nvalidateEnvironment:');

test('returns environment summary with validated: true', () => {
  const env = validateEnvironment();
  assert(env.validated === true, 'validated should be true');
  assert(typeof env.nodeVersion === 'string', 'nodeVersion should be string');
  assert(typeof env.platform === 'string', 'platform should be string');
  assert(typeof env.pid === 'number', 'pid should be number');
});

test('nodeVersion starts with "v"', () => {
  const env = validateEnvironment();
  assert(env.nodeVersion.startsWith('v'), 'expected version to start with v');
});

// ── computeMessageHash ──────────────────────────────────────────────────────

console.log('\ncomputeMessageHash:');

test('returns a 64-character hex string', () => {
  const hash = computeMessageHash('Hello, World!');
  assert(hash.length === 64, 'expected 64 chars, got ' + hash.length);
  assert(/^[0-9a-f]{64}$/.test(hash), 'expected lowercase hex');
});

test('matches known SHA-256 of "Hello, World!"', () => {
  // Independently computed:
  const expected = crypto.createHash('sha256')
    .update('Hello, World!', 'utf8')
    .digest('hex');
  const actual = computeMessageHash('Hello, World!');
  assert(actual === expected, 'hash mismatch');
});

test('different messages produce different hashes', () => {
  const h1 = computeMessageHash('Hello, World!');
  const h2 = computeMessageHash('hello, world!');
  assert(h1 !== h2, 'hashes should differ');
});

test('throws on non-string input', () => {
  assertThrows(() => computeMessageHash(123), 'validator.computeMessageHash');
});

test('throws on null input', () => {
  assertThrows(() => computeMessageHash(null), 'validator.computeMessageHash');
});

// ── validateConfig (integration) ────────────────────────────────────────────

console.log('\nvalidateConfig (integration):');

test('returns a stamped copy of valid config', () => {
  const cfg = makeValidConfig();
  const result = validateConfig(cfg);

  // Should have the original keys
  assert(result.message === 'Hello, World!', 'message preserved');
  assert(result.encoding === 'base64', 'encoding preserved');
  assert(result.format === 'bordered', 'format preserved');
  assert(result.output === 'console', 'output preserved');

  // Should have the stamp fields
  assert(typeof result._messageHash === 'string', '_messageHash present');
  assert(result._messageHash.length === 64, '_messageHash is 64 chars');
  assert(typeof result._env === 'object', '_env present');
  assert(result._env.validated === true, '_env.validated is true');
  assert(typeof result._validatedAt === 'string', '_validatedAt present');
});

test('does not mutate the original config', () => {
  const cfg = makeValidConfig();
  const result = validateConfig(cfg);
  assert(cfg._messageHash === undefined, 'original should not have _messageHash');
  assert(cfg._env === undefined, 'original should not have _env');
  assert(cfg._validatedAt === undefined, 'original should not have _validatedAt');
});

test('works without features (optional)', () => {
  const cfg = makeValidConfig();
  delete cfg.features;
  const result = validateConfig(cfg);
  assert(result._messageHash.length === 64, 'hash still computed');
});

test('throws on invalid config (bad encoding)', () => {
  const cfg = makeValidConfig();
  cfg.encoding = 'rot47';
  assertThrows(() => validateConfig(cfg), 'unsupported encoding');
});

test('throws on invalid config (missing key)', () => {
  const cfg = makeValidConfig();
  delete cfg.message;
  assertThrows(() => validateConfig(cfg), 'missing required key');
});

test('throws on invalid config (non-boolean feature)', () => {
  const cfg = makeValidConfig();
  cfg.features.enableChecksum = 'yes';
  assertThrows(() => validateConfig(cfg), 'must be a boolean');
});

test('throws on null config', () => {
  assertThrows(() => validateConfig(null), 'validator.validateShape');
});

// ── Summary ─────────────────────────────────────────────────────────────────

console.log('\n── Results ─────────────────────────────────────────────────');
console.log('  Passed: ' + passed);
console.log('  Failed: ' + failed);
console.log('  Total:  ' + (passed + failed));

if (failed > 0) {
  console.log('\n  ⚠ SOME TESTS FAILED\n');
  process.exit(1);
} else {
  console.log('\n  ✔ ALL TESTS PASSED\n');
  process.exit(0);
}
