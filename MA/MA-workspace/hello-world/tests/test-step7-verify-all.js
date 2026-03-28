// ── Step 7 · Verify All Existing Components Render Correctly ─────────────────
//
// This test harness imports every existing module (contracts, config, validator,
// encoder, processor) and exercises each exported function to confirm:
//   1. All modules load without errors
//   2. All exported functions exist and are callable
//   3. Happy-path inputs produce correct outputs
//   4. Edge cases (empty string, null, wrong types) throw appropriately
//   5. The full pipeline chain (config → validate → encode → process) works
//      end-to-end with the existing 5 modules
//
// Run:  node hello-world/tests/test-step7-verify-all.js
// ─────────────────────────────────────────────────────────────────────────────
'use strict';

// ── Test Harness ────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;
const failures = [];

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log('  ✓ ' + name);
  } catch (err) {
    failed++;
    failures.push({ name, error: err.message });
    console.log('  ✗ ' + name);
    console.log('    → ' + err.message);
  }
}

function assert(cond, msg) {
  if (!cond) throw new Error('Assertion failed: ' + (msg || 'expected truthy'));
}

function assertEqual(actual, expected, msg) {
  if (actual !== expected) {
    throw new Error(
      (msg || 'assertEqual') + ': expected ' + JSON.stringify(expected) +
      ', got ' + JSON.stringify(actual)
    );
  }
}

function assertThrows(fn, substr) {
  let threw = false;
  try { fn(); } catch (err) {
    threw = true;
    if (substr && !err.message.includes(substr)) {
      throw new Error('Expected error containing "' + substr + '", got: "' + err.message + '"');
    }
  }
  if (!threw) throw new Error('Expected function to throw' + (substr ? ' (' + substr + ')' : ''));
}

// ─────────────────────────────────────────────────────────────────────────────
// MODULE 1: contracts.js
// ─────────────────────────────────────────────────────────────────────────────

console.log('\n═══ MODULE: contracts.js ═══════════════════════════════════\n');

let contracts;
test('contracts.js loads without error', () => {
  contracts = require('../src/contracts');
  assert(contracts !== null && typeof contracts === 'object', 'module is an object');
});

console.log('\n  Constants:');

test('SUPPORTED_ENCODINGS is correct array', () => {
  const e = contracts.SUPPORTED_ENCODINGS;
  assert(Array.isArray(e), 'is array');
  assertEqual(e.length, 4, 'length');
  assert(e.includes('base64'), 'has base64');
  assert(e.includes('hex'), 'has hex');
  assert(e.includes('rot13'), 'has rot13');
  assert(e.includes('reverse'), 'has reverse');
});

test('SUPPORTED_FORMATS is correct array', () => {
  const f = contracts.SUPPORTED_FORMATS;
  assert(Array.isArray(f), 'is array');
  assertEqual(f.length, 4, 'length');
  assert(f.includes('uppercase'), 'has uppercase');
  assert(f.includes('bordered'), 'has bordered');
  assert(f.includes('banner'), 'has banner');
  assert(f.includes('plain'), 'has plain');
});

test('SUPPORTED_OUTPUTS is correct array', () => {
  const o = contracts.SUPPORTED_OUTPUTS;
  assert(Array.isArray(o), 'is array');
  assertEqual(o.length, 3, 'length');
  assert(o.includes('console'), 'has console');
  assert(o.includes('file'), 'has file');
  assert(o.includes('return'), 'has return');
});

test('PIPELINE_STAGES has 7 stages in order', () => {
  const s = contracts.PIPELINE_STAGES;
  assertEqual(s.length, 7, 'length');
  assertEqual(s[0], 'config', 'stage 0');
  assertEqual(s[6], 'output', 'stage 6');
});

test('MAX_MESSAGE_LENGTH is 1000', () => {
  assertEqual(contracts.MAX_MESSAGE_LENGTH, 1000, 'MAX_MESSAGE_LENGTH');
});

test('DEFAULT_CONFIG has required keys', () => {
  const d = contracts.DEFAULT_CONFIG;
  assert(typeof d === 'object', 'is object');
  assertEqual(d.message, 'Hello, World!', 'message');
  assertEqual(d.encoding, 'base64', 'encoding');
  assertEqual(d.format, 'bordered', 'format');
  assertEqual(d.output, 'console', 'output');
});

console.log('\n  Factory: createPipelineState:');

test('createPipelineState returns correct shape', () => {
  const state = contracts.createPipelineState({ message: 'Test' });
  assertEqual(state.raw, 'Test', 'raw');
  assertEqual(state.encoded, null, 'encoded');
  assertEqual(state.processed, null, 'processed');
  assertEqual(state.decoded, null, 'decoded');
  assertEqual(state.formatted, null, 'formatted');
  assertEqual(state.output, null, 'output');
  assertEqual(state.status, 'pending', 'status');
  assertEqual(state.error, null, 'error');
  assert(typeof state.startTime === 'number', 'startTime is number');
  assert(Array.isArray(state.log), 'log is array');
  assertEqual(state.log.length, 0, 'log empty');
});

test('createPipelineState throws on null', () => {
  assertThrows(() => contracts.createPipelineState(null), 'config must be');
});

test('createPipelineState throws on missing message', () => {
  assertThrows(() => contracts.createPipelineState({}), 'config.message must be');
});

test('createPipelineState throws on empty message', () => {
  assertThrows(() => contracts.createPipelineState({ message: '' }), 'config.message must be');
});

console.log('\n  Factory: createLogEntry:');

test('createLogEntry returns correct shape', () => {
  const entry = contracts.createLogEntry('encode', 'ok', 'did it');
  assertEqual(entry.stage, 'encode', 'stage');
  assertEqual(entry.status, 'ok', 'status');
  assertEqual(entry.detail, 'did it', 'detail');
  assert(typeof entry.timestamp === 'string', 'timestamp is string');
  assert(entry.timestamp.includes('T'), 'ISO format');
});

test('createLogEntry accepts "error" status', () => {
  const entry = contracts.createLogEntry('validate', 'error', 'bad input');
  assertEqual(entry.status, 'error', 'status');
});

test('createLogEntry throws on empty stage', () => {
  assertThrows(() => contracts.createLogEntry('', 'ok', 'x'), 'stage must be');
});

test('createLogEntry throws on invalid status', () => {
  assertThrows(() => contracts.createLogEntry('encode', 'warn', 'x'), 'status must be');
});

test('createLogEntry throws on non-string detail', () => {
  assertThrows(() => contracts.createLogEntry('encode', 'ok', 42), 'detail must be');
});

console.log('\n  Validators: isValid*:');

test('isValidEncoding accepts all supported', () => {
  assert(contracts.isValidEncoding('base64'), 'base64');
  assert(contracts.isValidEncoding('hex'), 'hex');
  assert(contracts.isValidEncoding('rot13'), 'rot13');
  assert(contracts.isValidEncoding('reverse'), 'reverse');
});

test('isValidEncoding rejects unknown', () => {
  assert(!contracts.isValidEncoding('aes256'), 'aes256 should fail');
  assert(!contracts.isValidEncoding(''), 'empty should fail');
});

test('isValidFormat accepts all supported', () => {
  contracts.SUPPORTED_FORMATS.forEach(f => {
    assert(contracts.isValidFormat(f), f + ' should pass');
  });
});

test('isValidFormat rejects unknown', () => {
  assert(!contracts.isValidFormat('markdown'), 'markdown should fail');
});

test('isValidOutput accepts all supported', () => {
  contracts.SUPPORTED_OUTPUTS.forEach(o => {
    assert(contracts.isValidOutput(o), o + ' should pass');
  });
});

test('isValidOutput rejects unknown', () => {
  assert(!contracts.isValidOutput('socket'), 'socket should fail');
});

// ─────────────────────────────────────────────────────────────────────────────
// MODULE 2: config.js
// ─────────────────────────────────────────────────────────────────────────────

console.log('\n═══ MODULE: config.js ══════════════════════════════════════\n');

let config;
test('config.js loads without error', () => {
  config = require('../src/config');
  assert(config !== null && typeof config === 'object', 'module is an object');
});

console.log('\n  Constants:');

test('XOR_KEY is 0x42', () => {
  assertEqual(config.XOR_KEY, 0x42, 'XOR_KEY');
});

test('ENCRYPTED_MESSAGE is a non-empty string', () => {
  assert(typeof config.ENCRYPTED_MESSAGE === 'string', 'is string');
  assert(config.ENCRYPTED_MESSAGE.length > 0, 'non-empty');
});

test('ENVIRONMENT_MAP has 7 entries', () => {
  assertEqual(Object.keys(config.ENVIRONMENT_MAP).length, 7, 'env map size');
});

test('DEFAULT_FEATURES has 6 flags', () => {
  assertEqual(Object.keys(config.DEFAULT_FEATURES).length, 6, 'feature count');
});

console.log('\n  decryptMessage:');

test('decryptMessage recovers "Hello, World!" (with possible trailing newline)', () => {
  const msg = config.decryptMessage(config.ENCRYPTED_MESSAGE, config.XOR_KEY);
  // The encrypted constant may produce a trailing newline from the \n in the XOR
  const trimmed = msg.trim();
  assertEqual(trimmed, 'Hello, World!', 'decrypted message');
});

test('decryptMessage throws on empty string', () => {
  assertThrows(() => config.decryptMessage('', 0x42), 'non-empty string');
});

test('decryptMessage throws on invalid key', () => {
  assertThrows(() => config.decryptMessage('YQ==', 999), 'between 0x00 and 0xFF');
});

test('decryptMessage throws on non-string input', () => {
  assertThrows(() => config.decryptMessage(42, 0x42), 'non-empty string');
});

console.log('\n  loadEnvironment:');

test('loadEnvironment returns an object', () => {
  const env = config.loadEnvironment();
  assert(typeof env === 'object', 'is object');
});

console.log('\n  loadFeatureFlags:');

test('loadFeatureFlags returns defaults when no overrides', () => {
  const flags = config.loadFeatureFlags();
  assertEqual(flags.enableChecksum, true, 'enableChecksum');
  assertEqual(flags.enableTimestamp, true, 'enableTimestamp');
  assertEqual(flags.enableBorder, true, 'enableBorder');
  assertEqual(flags.enableAuditLog, false, 'enableAuditLog');
  assertEqual(flags.enableColour, true, 'enableColour');
  assertEqual(flags.failFast, true, 'failFast');
});

test('loadFeatureFlags merges overrides', () => {
  const flags = config.loadFeatureFlags({ enableChecksum: false, failFast: false });
  assertEqual(flags.enableChecksum, false, 'overridden enableChecksum');
  assertEqual(flags.failFast, false, 'overridden failFast');
  assertEqual(flags.enableTimestamp, true, 'default enableTimestamp preserved');
});

test('loadFeatureFlags ignores non-boolean overrides', () => {
  const flags = config.loadFeatureFlags({ enableChecksum: 'yes' });
  assertEqual(flags.enableChecksum, true, 'non-boolean ignored');
});

test('loadFeatureFlags ignores unknown keys', () => {
  const flags = config.loadFeatureFlags({ unknownFlag: true });
  assert(!('unknownFlag' in flags), 'unknown key excluded');
});

console.log('\n  buildRuntimeInfo:');

test('buildRuntimeInfo returns correct shape', () => {
  const info = config.buildRuntimeInfo();
  assert(typeof info.pid === 'number', 'pid');
  assert(typeof info.startedAt === 'string', 'startedAt');
  assert(typeof info.nodeVersion === 'string', 'nodeVersion');
  assert(typeof info.platform === 'string', 'platform');
  assert(typeof info.cwd === 'string', 'cwd');
});

console.log('\n  loadConfig:');

test('loadConfig returns a full config object', () => {
  const cfg = config.loadConfig();
  assert(typeof cfg.message === 'string', 'has message');
  assert(cfg.message.length > 0, 'message non-empty');
  assert(typeof cfg.encoding === 'string', 'has encoding');
  assert(typeof cfg.format === 'string', 'has format');
  assert(typeof cfg.output === 'string', 'has output');
  assert(typeof cfg.features === 'object', 'has features');
  assert(typeof cfg.runtime === 'object', 'has runtime');
  assert(Array.isArray(cfg._sources), 'has _sources');
});

test('loadConfig respects overrides', () => {
  const cfg = config.loadConfig({ encoding: 'hex', format: 'plain' });
  assertEqual(cfg.encoding, 'hex', 'encoding override');
  assertEqual(cfg.format, 'plain', 'format override');
});

test('loadConfig message is "Hello, World!" (trimmed)', () => {
  const cfg = config.loadConfig();
  assertEqual(cfg.message.trim(), 'Hello, World!', 'message from decryption');
});

// ─────────────────────────────────────────────────────────────────────────────
// MODULE 3: validator.js
// ─────────────────────────────────────────────────────────────────────────────

console.log('\n═══ MODULE: validator.js ═══════════════════════════════════\n');

let validator;
test('validator.js loads without error', () => {
  validator = require('../src/validator');
  assert(validator !== null && typeof validator === 'object', 'module is an object');
});

test('validateConfig accepts valid config', () => {
  const cfg = {
    message: 'Hello, World!',
    encoding: 'base64',
    format: 'bordered',
    output: 'console',
    features: { enableChecksum: true, failFast: true }
  };
  const result = validator.validateConfig(cfg);
  assert(typeof result._messageHash === 'string', 'has hash');
  assertEqual(result._messageHash.length, 64, 'hash length');
  assert(result._env.validated === true, 'env validated');
});

test('validateConfig rejects bad config', () => {
  assertThrows(() => validator.validateConfig(null), 'validateShape');
});

test('computeMessageHash returns 64-char hex', () => {
  const h = validator.computeMessageHash('test');
  assertEqual(h.length, 64, 'length');
  assert(/^[0-9a-f]+$/.test(h), 'hex chars');
});

// ─────────────────────────────────────────────────────────────────────────────
// MODULE 4: encoder.js
// ─────────────────────────────────────────────────────────────────────────────

console.log('\n═══ MODULE: encoder.js ═════════════════════════════════════\n');

let encoder;
test('encoder.js loads without error', () => {
  encoder = require('../src/encoder');
  assert(encoder !== null && typeof encoder === 'object', 'module is an object');
});

console.log('\n  encodeBase64:');

test('encodeBase64 encodes "Hello, World!" correctly', () => {
  const result = encoder.encodeBase64('Hello, World!');
  assertEqual(result, Buffer.from('Hello, World!').toString('base64'), 'base64 match');
});

test('encodeBase64 handles empty string', () => {
  assertEqual(encoder.encodeBase64(''), '', 'empty string');
});

test('encodeBase64 throws on non-string', () => {
  assertThrows(() => encoder.encodeBase64(42), 'must be a string');
});

console.log('\n  encodeHex:');

test('encodeHex encodes "Hi" correctly', () => {
  assertEqual(encoder.encodeHex('Hi'), '4869', 'hex of Hi');
});

test('encodeHex throws on non-string', () => {
  assertThrows(() => encoder.encodeHex(null), 'must be a string');
});

console.log('\n  encodeRot13:');

test('encodeRot13 encodes "Hello" → "Uryyb"', () => {
  assertEqual(encoder.encodeRot13('Hello'), 'Uryyb', 'rot13 Hello');
});

test('encodeRot13 is its own inverse', () => {
  const original = 'Hello, World!';
  assertEqual(encoder.encodeRot13(encoder.encodeRot13(original)), original, 'double rot13');
});

test('encodeRot13 preserves non-letters', () => {
  assertEqual(encoder.encodeRot13('123!'), '123!', 'non-letters unchanged');
});

test('encodeRot13 throws on non-string', () => {
  assertThrows(() => encoder.encodeRot13(42), 'must be a string');
});

console.log('\n  encodeReverse:');

test('encodeReverse reverses "Hello"', () => {
  assertEqual(encoder.encodeReverse('Hello'), 'olleH', 'reverse');
});

test('encodeReverse handles single char', () => {
  assertEqual(encoder.encodeReverse('x'), 'x', 'single char');
});

test('encodeReverse handles empty string', () => {
  assertEqual(encoder.encodeReverse(''), '', 'empty');
});

test('encodeReverse throws on non-string', () => {
  assertThrows(() => encoder.encodeReverse(123), 'must be a string');
});

console.log('\n  encode (pipeline stage):');

test('encode processes a valid state with base64', () => {
  const state = contracts.createPipelineState({
    message: 'Hello, World!',
    encoding: 'base64',
    format: 'plain',
    output: 'console'
  });
  state.config = { encoding: 'base64', features: {} };
  const result = encoder.encode(state);
  assertEqual(result.encoded, Buffer.from('Hello, World!').toString('base64'), 'encoded');
  assertEqual(result.log.length, 1, 'one log entry');
  assertEqual(result.log[0].stage, 'encode', 'log stage');
  assertEqual(result.log[0].status, 'ok', 'log status');
});

test('encode processes a valid state with rot13', () => {
  const state = contracts.createPipelineState({
    message: 'Hello',
    encoding: 'rot13',
    format: 'plain',
    output: 'console'
  });
  state.config = { encoding: 'rot13', features: {} };
  const result = encoder.encode(state);
  assertEqual(result.encoded, 'Uryyb', 'rot13 encoded');
});

test('encode throws on null state', () => {
  assertThrows(() => encoder.encode(null), 'state must be');
});

test('encode throws on missing raw', () => {
  assertThrows(() => encoder.encode({ raw: '', config: { encoding: 'base64' } }), 'state.raw must be');
});

test('encode throws on invalid encoding', () => {
  const state = contracts.createPipelineState({
    message: 'Hi',
    encoding: 'aes',
    format: 'plain',
    output: 'console'
  });
  state.config = { encoding: 'aes', features: {} };
  assertThrows(() => encoder.encode(state), 'unsupported encoding');
});

// ─────────────────────────────────────────────────────────────────────────────
// MODULE 5: processor.js
// ─────────────────────────────────────────────────────────────────────────────

console.log('\n═══ MODULE: processor.js ═══════════════════════════════════\n');

let processor;
test('processor.js loads without error', () => {
  processor = require('../src/processor');
  assert(processor !== null && typeof processor === 'object', 'module is an object');
});

console.log('\n  computeChecksum:');

test('computeChecksum returns a number', () => {
  const c = processor.computeChecksum('Hello');
  assert(typeof c === 'number', 'is number');
  assert(c >= 0 && c <= 65535, 'in range');
});

test('computeChecksum is deterministic', () => {
  const a = processor.computeChecksum('Hello, World!');
  const b = processor.computeChecksum('Hello, World!');
  assertEqual(a, b, 'same input same output');
});

test('computeChecksum handles empty string', () => {
  assertEqual(processor.computeChecksum(''), 0, 'empty string → 0');
});

test('computeChecksum throws on non-string', () => {
  assertThrows(() => processor.computeChecksum(42), 'must be a string');
});

console.log('\n  buildMetadata:');

test('buildMetadata returns correct shape', () => {
  const m = processor.buildMetadata('SGVsbG8=', 'base64', { enableChecksum: true, enableTimestamp: true });
  assert(typeof m.encoding === 'string', 'has encoding');
  assert(typeof m.length === 'number', 'has length');
  assert(typeof m.version === 'string', 'has version');
  assert(typeof m.checksum === 'number', 'has checksum');
  assert(typeof m.timestamp === 'string', 'has timestamp');
});

test('buildMetadata omits checksum when disabled', () => {
  const m = processor.buildMetadata('data', 'hex', { enableChecksum: false });
  assert(m.checksum === undefined, 'no checksum');
});

test('buildMetadata omits timestamp when disabled', () => {
  const m = processor.buildMetadata('data', 'hex', { enableTimestamp: false });
  assert(m.timestamp === undefined, 'no timestamp');
});

test('buildMetadata throws on non-string encoded', () => {
  assertThrows(() => processor.buildMetadata(42, 'base64', {}), 'must be a string');
});

console.log('\n  process (pipeline stage):');

test('process wraps encoded payload with metadata', () => {
  const state = {
    encoded: 'SGVsbG8sIFdvcmxkIQ==',
    config: { encoding: 'base64', features: { enableChecksum: true, enableTimestamp: true } },
    log: []
  };
  const result = processor.process(state);
  assert(typeof result.processed === 'object', 'processed is object');
  assertEqual(result.processed.payload, state.encoded, 'payload preserved');
  assert(typeof result.processed.metadata === 'object', 'has metadata');
  assertEqual(result.log.length, 1, 'one log entry');
  assertEqual(result.log[0].stage, 'process', 'log stage');
});

test('process throws on null state', () => {
  assertThrows(() => processor.process(null), 'state must be');
});

test('process throws on missing encoded', () => {
  assertThrows(() => processor.process({ encoded: '', config: {} }), 'state.encoded must be');
});

test('PIPELINE_VERSION is a semver string', () => {
  assert(/^\d+\.\d+\.\d+$/.test(processor.PIPELINE_VERSION), 'semver format');
});

// ─────────────────────────────────────────────────────────────────────────────
// INTEGRATION: Chain config → validate → encode → process
// ─────────────────────────────────────────────────────────────────────────────

console.log('\n═══ INTEGRATION: 4-Stage Chain ═════════════════════════════\n');

test('Full chain: loadConfig → validateConfig → encode → process', () => {
  // Stage 1: Load config
  const cfg = config.loadConfig({ message: 'Hello, World!', encoding: 'base64', format: 'bordered', output: 'return' });
  assert(typeof cfg === 'object', 'config loaded');

  // Stage 2: Validate config
  const validated = validator.validateConfig(cfg);
  assert(typeof validated._messageHash === 'string', 'validated has hash');

  // Stage 3: Create pipeline state and encode
  const state = contracts.createPipelineState(validated);
  const encoded = encoder.encode(state);
  assert(typeof encoded.encoded === 'string', 'encoded field set');
  assert(encoded.encoded.length > 0, 'encoded non-empty');

  // Stage 4: Process
  const processed = processor.process(encoded);
  assert(typeof processed.processed === 'object', 'processed field set');
  assertEqual(processed.processed.payload, encoded.encoded, 'payload matches encoded');
  assert(typeof processed.processed.metadata.checksum === 'number', 'has checksum');
  assert(processed.log.length === 2, 'two log entries (encode + process)');

  // Verify the encoded value is correct Base64
  const decoded = Buffer.from(processed.processed.payload, 'base64').toString('utf8');
  assertEqual(decoded, 'Hello, World!', 'round-trip decode matches original');
});

test('Full chain with hex encoding', () => {
  const cfg = config.loadConfig({ message: 'Hello, World!', encoding: 'hex', format: 'plain', output: 'return' });
  const validated = validator.validateConfig(cfg);
  const state = contracts.createPipelineState(validated);
  const encoded = encoder.encode(state);
  const processed = processor.process(encoded);

  const decoded = Buffer.from(processed.processed.payload, 'hex').toString('utf8');
  assertEqual(decoded, 'Hello, World!', 'hex round-trip');
});

test('Full chain with rot13 encoding', () => {
  const cfg = config.loadConfig({ message: 'Hello, World!', encoding: 'rot13', format: 'plain', output: 'return' });
  const validated = validator.validateConfig(cfg);
  const state = contracts.createPipelineState(validated);
  const encoded = encoder.encode(state);
  const processed = processor.process(encoded);

  // ROT13 is its own inverse
  const decoded = encoder.encodeRot13(processed.processed.payload);
  assertEqual(decoded, 'Hello, World!', 'rot13 round-trip');
});

test('Full chain with reverse encoding', () => {
  const cfg = config.loadConfig({ message: 'Hello, World!', encoding: 'reverse', format: 'plain', output: 'return' });
  const validated = validator.validateConfig(cfg);
  const state = contracts.createPipelineState(validated);
  const encoded = encoder.encode(state);
  const processed = processor.process(encoded);

  const decoded = processed.processed.payload.split('').reverse().join('');
  assertEqual(decoded, 'Hello, World!', 'reverse round-trip');
});

// ─────────────────────────────────────────────────────────────────────────────
// EXPORT COMPLETENESS CHECK
// ─────────────────────────────────────────────────────────────────────────────

console.log('\n═══ EXPORT COMPLETENESS ════════════════════════════════════\n');

test('contracts.js exports all 11 items', () => {
  const expected = [
    'SUPPORTED_ENCODINGS', 'SUPPORTED_FORMATS', 'SUPPORTED_OUTPUTS',
    'PIPELINE_STAGES', 'MAX_MESSAGE_LENGTH', 'DEFAULT_CONFIG',
    'createPipelineState', 'createLogEntry',
    'isValidEncoding', 'isValidFormat', 'isValidOutput'
  ];
  expected.forEach(key => {
    assert(key in contracts, 'contracts missing: ' + key);
  });
});

test('config.js exports all 10 items', () => {
  const expected = [
    'ENCRYPTED_MESSAGE', 'XOR_KEY', 'ENVIRONMENT_MAP', 'DEFAULT_FEATURES',
    'CONFIG_FILENAME',
    'decryptMessage', 'loadEnvironment', 'loadFeatureFlags',
    'buildRuntimeInfo', 'loadConfig'
  ];
  expected.forEach(key => {
    assert(key in config, 'config missing: ' + key);
  });
});

test('validator.js exports all 12 items', () => {
  const expected = [
    'MIN_NODE_VERSION', 'REQUIRED_GLOBALS', 'REQUIRED_CONFIG_KEYS',
    'validateShape', 'validateMessage', 'validateEncoding',
    'validateFormat', 'validateOutput', 'validateFeatures',
    'validateEnvironment', 'computeMessageHash', 'validateConfig'
  ];
  expected.forEach(key => {
    assert(key in validator, 'validator missing: ' + key);
  });
});

test('encoder.js exports all 5 items', () => {
  const expected = ['encodeBase64', 'encodeHex', 'encodeRot13', 'encodeReverse', 'encode'];
  expected.forEach(key => {
    assert(key in encoder, 'encoder missing: ' + key);
  });
});

test('processor.js exports all 4 items', () => {
  const expected = ['PIPELINE_VERSION', 'computeChecksum', 'buildMetadata', 'process'];
  expected.forEach(key => {
    assert(key in processor, 'processor missing: ' + key);
  });
});

// ── Summary ─────────────────────────────────────────────────────────────────

console.log('\n═══════════════════════════════════════════════════════════');
console.log('  Passed: ' + passed);
console.log('  Failed: ' + failed);
console.log('  Total:  ' + (passed + failed));

if (failed > 0) {
  console.log('\n  ⚠ FAILURES:');
  failures.forEach(f => console.log('    • ' + f.name + ': ' + f.error));
  console.log('');
  process.exit(1);
} else {
  console.log('\n  ✔ ALL COMPONENTS VERIFIED — RENDERING CORRECTLY\n');
  process.exit(0);
}
