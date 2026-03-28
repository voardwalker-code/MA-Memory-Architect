#!/usr/bin/env node
// ── Step 9 · Pipeline Routing Verification ───────────────────────────────────
//
// PURPOSE:
// Confirm that data "routes" correctly between the 5 existing pipeline stages:
//   Config → Validator → Encoder → Processor
// And that the PipelineState object flows from one stage to the next with
// the correct fields populated at each step.
//
// This is NOT an HTTP router — "routing" in this pipeline means the data
// flow between stages via the PipelineState object.  Each stage reads
// specific fields, writes specific fields, and passes the state along.
//
// WHAT WE VERIFY:
//   1. Config produces a valid config object
//   2. Validator accepts the config and stamps it
//   3. contracts.createPipelineState() produces a valid state from the config
//   4. Encoder reads state.raw + state.config.encoding, writes state.encoded
//   5. Processor reads state.encoded + state.config, writes state.processed
//   6. Each stage's output is valid input for the next stage
//   7. Log entries accumulate correctly across stages
//   8. All 4 encoding types route correctly through the full chain
//   9. Error routing: bad input at any stage produces a clear error
//  10. The pipeline state shape is preserved (no lost/extra fields)
// ─────────────────────────────────────────────────────────────────────────────
'use strict';

// ── Imports ─────────────────────────────────────────────────────────────────

const { createPipelineState, createLogEntry, PIPELINE_STAGES, DEFAULT_CONFIG } = require('../src/contracts');
const { loadConfig }       = require('../src/config');
const { validateConfig }   = require('../src/validator');
const { encode }           = require('../src/encoder');
const { process: processState } = require('../src/processor');

// ── Test Harness ────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;
const failures = [];

function assert(condition, label) {
  if (condition) {
    passed++;
  } else {
    failed++;
    failures.push(label);
    console.error('  ✗ FAIL: ' + label);
  }
}

function section(name) {
  console.log('\n── ' + name + ' ──');
}

// ── Helpers ─────────────────────────────────────────────────────────────────

// Expected fields on a PipelineState object
const PIPELINE_STATE_FIELDS = [
  'raw', 'encoded', 'processed', 'decoded', 'formatted',
  'output', 'config', 'log', 'status', 'error', 'startTime'
];

function hasPipelineShape(obj) {
  if (!obj || typeof obj !== 'object') return false;
  for (let i = 0; i < PIPELINE_STATE_FIELDS.length; i++) {
    if (!(PIPELINE_STATE_FIELDS[i] in obj)) return false;
  }
  return true;
}

// ═════════════════════════════════════════════════════════════════════════════
// TEST GROUP 1: Config → Validator routing
// ═════════════════════════════════════════════════════════════════════════════

section('1. Config → Validator routing');

(function testConfigToValidator() {
  // Load config
  const config = loadConfig();
  assert(typeof config === 'object' && config !== null, '1.1 loadConfig returns an object');
  assert(typeof config.message === 'string' && config.message.length > 0, '1.2 config.message is a non-empty string');
  assert(typeof config.encoding === 'string', '1.3 config.encoding is a string');
  assert(typeof config.format === 'string', '1.4 config.format is a string');
  assert(typeof config.output === 'string', '1.5 config.output is a string');

  // Validate config — this is the "route" from Config stage to Validator stage
  const validated = validateConfig(config);
  assert(typeof validated === 'object' && validated !== null, '1.6 validateConfig returns an object');
  assert(validated.message === config.message, '1.7 validated config preserves message');
  assert(validated.encoding === config.encoding, '1.8 validated config preserves encoding');
  assert(typeof validated._messageHash === 'string' && validated._messageHash.length === 64, '1.9 validator stamps _messageHash (64-char hex)');
  assert(typeof validated._validatedAt === 'string', '1.10 validator stamps _validatedAt');
  assert(typeof validated._env === 'object' && validated._env.validated === true, '1.11 validator stamps _env with validated:true');
})();

// ═════════════════════════════════════════════════════════════════════════════
// TEST GROUP 2: Validator → PipelineState → Encoder routing
// ═════════════════════════════════════════════════════════════════════════════

section('2. Validator → PipelineState → Encoder routing');

(function testValidatorToEncoder() {
  const config    = loadConfig();
  const validated = validateConfig(config);

  // Create pipeline state — this bridges Validator output to Encoder input
  const state = createPipelineState(validated);
  assert(hasPipelineShape(state), '2.1 createPipelineState returns correct shape');
  assert(state.raw === validated.message, '2.2 state.raw equals validated.message');
  assert(state.encoded === null, '2.3 state.encoded starts as null');
  assert(state.processed === null, '2.4 state.processed starts as null');
  assert(state.status === 'pending', '2.5 state.status starts as "pending"');
  assert(Array.isArray(state.log) && state.log.length === 0, '2.6 state.log starts as empty array');
  assert(typeof state.startTime === 'number', '2.7 state.startTime is a number');

  // Route through Encoder
  const afterEncode = encode(state);
  assert(hasPipelineShape(afterEncode), '2.8 encode() returns correct pipeline shape');
  assert(typeof afterEncode.encoded === 'string' && afterEncode.encoded.length > 0, '2.9 state.encoded is now a non-empty string');
  assert(afterEncode.raw === state.raw, '2.10 encode() preserves state.raw');
  assert(afterEncode.processed === null, '2.11 encode() does not touch state.processed');
  assert(afterEncode.config.encoding === validated.encoding, '2.12 encode() preserves config.encoding');
})();

// ═════════════════════════════════════════════════════════════════════════════
// TEST GROUP 3: Encoder → Processor routing
// ═════════════════════════════════════════════════════════════════════════════

section('3. Encoder → Processor routing');

(function testEncoderToProcessor() {
  const config    = loadConfig();
  const validated = validateConfig(config);
  const state     = createPipelineState(validated);
  const encoded   = encode(state);

  // Route through Processor
  const processed = processState(encoded);
  assert(hasPipelineShape(processed), '3.1 process() returns correct pipeline shape');
  assert(typeof processed.processed === 'object' && processed.processed !== null, '3.2 state.processed is now an object');
  assert(processed.processed.payload === encoded.encoded, '3.3 processed.payload equals encoded value');
  assert(typeof processed.processed.metadata === 'object', '3.4 processed.metadata is an object');
  assert(typeof processed.processed.metadata.checksum === 'number', '3.5 metadata has numeric checksum');
  assert(typeof processed.processed.metadata.timestamp === 'string', '3.6 metadata has timestamp string');
  assert(processed.processed.metadata.encoding === validated.encoding, '3.7 metadata.encoding matches config');
  assert(processed.processed.metadata.length === encoded.encoded.length, '3.8 metadata.length matches encoded length');
  assert(processed.raw === state.raw, '3.9 process() preserves state.raw');
  assert(processed.encoded === encoded.encoded, '3.10 process() preserves state.encoded');
})();

// ═════════════════════════════════════════════════════════════════════════════
// TEST GROUP 4: Log accumulation across stages
// ═════════════════════════════════════════════════════════════════════════════

section('4. Log accumulation across stages');

(function testLogAccumulation() {
  const config    = loadConfig();
  const validated = validateConfig(config);
  const state     = createPipelineState(validated);

  assert(state.log.length === 0, '4.1 initial state has 0 log entries');

  const afterEncode = encode(state);
  assert(afterEncode.log.length === 1, '4.2 after encode: 1 log entry');
  assert(afterEncode.log[0].stage === 'encode', '4.3 log[0].stage is "encode"');
  assert(afterEncode.log[0].status === 'ok', '4.4 log[0].status is "ok"');

  const afterProcess = processState(afterEncode);
  assert(afterProcess.log.length === 2, '4.5 after process: 2 log entries');
  assert(afterProcess.log[0].stage === 'encode', '4.6 log[0] is still "encode"');
  assert(afterProcess.log[1].stage === 'process', '4.7 log[1].stage is "process"');
  assert(afterProcess.log[1].status === 'ok', '4.8 log[1].status is "ok"');

  // Verify log entries have timestamps
  assert(typeof afterProcess.log[0].timestamp === 'string', '4.9 log[0] has timestamp');
  assert(typeof afterProcess.log[1].timestamp === 'string', '4.10 log[1] has timestamp');
})();

// ═════════════════════════════════════════════════════════════════════════════
// TEST GROUP 5: All 4 encoding types route through the full chain
// ═════════════════════════════════════════════════════════════════════════════

section('5. All encoding types route through full chain');

(function testAllEncodings() {
  const encodings = ['base64', 'hex', 'rot13', 'reverse'];
  const message   = 'Hello, World!';

  for (let i = 0; i < encodings.length; i++) {
    const enc = encodings[i];
    const config    = loadConfig({ message: message, encoding: enc });
    const validated = validateConfig(config);
    const state     = createPipelineState(validated);
    const encoded   = encode(state);
    const processed = processState(encoded);

    const prefix = '5.' + (i + 1);
    assert(hasPipelineShape(processed), prefix + 'a ' + enc + ': final state has pipeline shape');
    assert(processed.raw === message, prefix + 'b ' + enc + ': raw message preserved');
    assert(typeof processed.encoded === 'string' && processed.encoded.length > 0, prefix + 'c ' + enc + ': encoded is non-empty string');
    assert(processed.processed.payload === processed.encoded, prefix + 'd ' + enc + ': processed.payload matches encoded');
    assert(processed.processed.metadata.encoding === enc, prefix + 'e ' + enc + ': metadata.encoding is correct');
    assert(processed.log.length === 2, prefix + 'f ' + enc + ': 2 log entries accumulated');
  }
})();

// ═════════════════════════════════════════════════════════════════════════════
// TEST GROUP 6: Error routing — bad input at each stage
// ═════════════════════════════════════════════════════════════════════════════

section('6. Error routing — bad input at each stage');

(function testErrorRouting() {
  // 6.1 — Bad config to validator
  let threw = false;
  try { validateConfig(null); } catch (e) { threw = true; }
  assert(threw, '6.1 validateConfig(null) throws');

  // 6.2 — Config with bad encoding to validator
  threw = false;
  try {
    validateConfig({ message: 'hi', encoding: 'rot47', format: 'plain', output: 'console' });
  } catch (e) { threw = true; }
  assert(threw, '6.2 validateConfig with bad encoding throws');

  // 6.3 — Bad state to encoder
  threw = false;
  try { encode(null); } catch (e) { threw = true; }
  assert(threw, '6.3 encode(null) throws');

  // 6.4 — State with missing raw to encoder
  threw = false;
  try { encode({ raw: '', config: { encoding: 'base64' }, log: [] }); } catch (e) { threw = true; }
  assert(threw, '6.4 encode with empty raw throws');

  // 6.5 — State with missing encoded to processor
  threw = false;
  try {
    processState({ encoded: '', config: { encoding: 'base64' }, log: [] });
  } catch (e) { threw = true; }
  assert(threw, '6.5 process with empty encoded throws');

  // 6.6 — State with null config to processor
  threw = false;
  try {
    processState({ encoded: 'abc', config: null, log: [] });
  } catch (e) { threw = true; }
  assert(threw, '6.6 process with null config throws');

  // 6.7 — createPipelineState with bad config
  threw = false;
  try { createPipelineState(null); } catch (e) { threw = true; }
  assert(threw, '6.7 createPipelineState(null) throws');

  // 6.8 — createPipelineState with missing message
  threw = false;
  try { createPipelineState({ encoding: 'base64' }); } catch (e) { threw = true; }
  assert(threw, '6.8 createPipelineState without message throws');
})();

// ═════════════════════════════════════════════════════════════════════════════
// TEST GROUP 7: Pipeline state immutability (stages don't mutate input)
// ═════════════════════════════════════════════════════════════════════════════

section('7. Pipeline state immutability');

(function testImmutability() {
  const config    = loadConfig();
  const validated = validateConfig(config);
  const state     = createPipelineState(validated);

  // Snapshot before encode
  const rawBefore    = state.raw;
  const logLenBefore = state.log.length;
  const encodedBefore = state.encoded;

  const afterEncode = encode(state);

  // Original state should be unchanged
  assert(state.raw === rawBefore, '7.1 original state.raw unchanged after encode');
  assert(state.log.length === logLenBefore, '7.2 original state.log length unchanged after encode');
  assert(state.encoded === encodedBefore, '7.3 original state.encoded unchanged after encode');
  assert(state.encoded === null, '7.4 original state.encoded still null');

  // Snapshot before process
  const encodedBeforeProcess = afterEncode.encoded;
  const logLenBeforeProcess  = afterEncode.log.length;

  const afterProcess = processState(afterEncode);

  // afterEncode state should be unchanged
  assert(afterEncode.encoded === encodedBeforeProcess, '7.5 afterEncode.encoded unchanged after process');
  assert(afterEncode.log.length === logLenBeforeProcess, '7.6 afterEncode.log length unchanged after process');
  assert(afterEncode.processed === null || afterEncode.processed === undefined, '7.7 afterEncode.processed still null/undefined');
})();

// ═════════════════════════════════════════════════════════════════════════════
// TEST GROUP 8: Full chain with custom message
// ═════════════════════════════════════════════════════════════════════════════

section('8. Full chain with custom message');

(function testCustomMessage() {
  const customMsg = 'Over-engineered is an understatement!';
  const config    = loadConfig({ message: customMsg, encoding: 'rot13', format: 'plain', output: 'return' });
  const validated = validateConfig(config);
  const state     = createPipelineState(validated);
  const encoded   = encode(state);
  const processed = processState(encoded);

  assert(processed.raw === customMsg, '8.1 custom message preserved through full chain');
  assert(processed.encoded === 'Bire-ratvarrerq vf na haqrefgngrzrag!', '8.2 ROT13 encoding correct for custom message');
  assert(processed.processed.payload === processed.encoded, '8.3 processed payload matches encoded');
  assert(processed.processed.metadata.encoding === 'rot13', '8.4 metadata encoding is rot13');
  assert(processed.log.length === 2, '8.5 two log entries for two stages');
})();

// ═════════════════════════════════════════════════════════════════════════════
// TEST GROUP 9: PIPELINE_STAGES constant matches actual stage flow
// ═════════════════════════════════════════════════════════════════════════════

section('9. PIPELINE_STAGES constant alignment');

(function testPipelineStages() {
  assert(Array.isArray(PIPELINE_STAGES), '9.1 PIPELINE_STAGES is an array');
  assert(PIPELINE_STAGES.length === 7, '9.2 PIPELINE_STAGES has 7 stages');
  assert(PIPELINE_STAGES[0] === 'config', '9.3 stage 0 is "config"');
  assert(PIPELINE_STAGES[1] === 'validate', '9.4 stage 1 is "validate"');
  assert(PIPELINE_STAGES[2] === 'encode', '9.5 stage 2 is "encode"');
  assert(PIPELINE_STAGES[3] === 'process', '9.6 stage 3 is "process"');
  assert(PIPELINE_STAGES[4] === 'decode', '9.7 stage 4 is "decode"');
  assert(PIPELINE_STAGES[5] === 'format', '9.8 stage 5 is "format"');
  assert(PIPELINE_STAGES[6] === 'output', '9.9 stage 6 is "output"');

  // Verify the stages we've tested map to the correct positions
  // (first 4 stages are implemented: config, validate, encode, process)
  const implementedStages = ['config', 'validate', 'encode', 'process'];
  for (let i = 0; i < implementedStages.length; i++) {
    assert(PIPELINE_STAGES[i] === implementedStages[i],
      '9.10.' + i + ' implemented stage ' + i + ' matches PIPELINE_STAGES[' + i + ']');
  }
})();

// ═════════════════════════════════════════════════════════════════════════════
// TEST GROUP 10: Feature flags route through to processor
// ═════════════════════════════════════════════════════════════════════════════

section('10. Feature flags route through to processor');

(function testFeatureFlagRouting() {
  // With checksum disabled
  const config1    = loadConfig({ features: { enableChecksum: false } });
  const validated1 = validateConfig(config1);
  const state1     = createPipelineState(validated1);
  const encoded1   = encode(state1);
  const processed1 = processState(encoded1);

  assert(!('checksum' in processed1.processed.metadata), '10.1 checksum absent when enableChecksum=false');
  assert(typeof processed1.processed.metadata.timestamp === 'string', '10.2 timestamp present when enableTimestamp default (true)');

  // With timestamp disabled
  const config2    = loadConfig({ features: { enableTimestamp: false } });
  const validated2 = validateConfig(config2);
  const state2     = createPipelineState(validated2);
  const encoded2   = encode(state2);
  const processed2 = processState(encoded2);

  assert(typeof processed2.processed.metadata.checksum === 'number', '10.3 checksum present when enableChecksum default (true)');
  assert(!('timestamp' in processed2.processed.metadata), '10.4 timestamp absent when enableTimestamp=false');

  // With both disabled
  const config3    = loadConfig({ features: { enableChecksum: false, enableTimestamp: false } });
  const validated3 = validateConfig(config3);
  const state3     = createPipelineState(validated3);
  const encoded3   = encode(state3);
  const processed3 = processState(encoded3);

  assert(!('checksum' in processed3.processed.metadata), '10.5 checksum absent when both disabled');
  assert(!('timestamp' in processed3.processed.metadata), '10.6 timestamp absent when both disabled');
  assert(typeof processed3.processed.metadata.encoding === 'string', '10.7 encoding always present regardless of flags');
  assert(typeof processed3.processed.metadata.length === 'number', '10.8 length always present regardless of flags');
})();

// ── Summary ─────────────────────────────────────────────────────────────────

console.log('\n══════════════════════════════════════════════');
console.log('  Pipeline Routing Verification Results');
console.log('══════════════════════════════════════════════');
console.log('  Passed: ' + passed);
console.log('  Failed: ' + failed);
console.log('  Total:  ' + (passed + failed));

if (failures.length > 0) {
  console.log('\n  Failures:');
  for (let i = 0; i < failures.length; i++) {
    console.log('    • ' + failures[i]);
  }
}

console.log('══════════════════════════════════════════════\n');

if (failed > 0) {
  process.exit(1);
} else {
  console.log('✓ All pipeline routing tests passed.\n');
  process.exit(0);
}
