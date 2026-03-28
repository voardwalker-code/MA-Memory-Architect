'use strict';
const path = require('path');

function assert(cond, msg) {
  if (!cond) throw new Error(msg || 'Assertion failed');
}

function assertThrows(fn, substr) {
  try {
    fn();
    throw new Error('Expected function to throw');
  } catch (e) {
    const s = (e && e.message) ? e.message : String(e);
    assert(substr ? s.includes(substr) : true, 'Throw message mismatch: ' + s);
  }
}

const root = path.join(__dirname, '..');

function runLayer0() {
  const chat = require(path.join(root, 'mma-contracts', 'mma-chat-payload.js'));
  const tab = require(path.join(root, 'mma-contracts', 'mma-editor-tab.js'));
  const env = require(path.join(root, 'mma-contracts', 'mma-api-envelope.js'));
  const dom = require(path.join(root, 'mma-stubs', 'scripts', 'mma-stub-ma-ui-dom.js'));
  const api = require(path.join(root, 'mma-stubs', 'scripts', 'mma-stub-ma-ui-api.js'));

  const v1 = chat.validateChatPayload(chat.createChatPayload({ message: 'hi', history: [], autoPilot: false }));
  assert(v1.valid, 'valid chat payload');

  const v2 = chat.validateChatPayload({ message: 'x'.repeat(chat.LIMITS.MAX_MESSAGE_CHARS + 1), history: [], autoPilot: false });
  assert(!v2.valid, 'long message invalid');

  const t1 = tab.validateEditorTab(tab.createEditorTab({ id: '1', path: 'a', name: 'a', content: '' }));
  assert(t1.valid, 'valid tab');

  assert(env.isOkEnvelope({ ok: true }), 'envelope');
  assert(!env.assertOkShape({ ok: false }).valid, 'bad envelope');

  assertThrows(() => dom.escHtml('x'), 'NOT_IMPLEMENTED');
  assertThrows(() => api.apiPostJson('/x', {}), 'NOT_IMPLEMENTED');
  console.log('  Layer 0: OK');
}

function runStubLayer(layerNum, files) {
  for (const f of files) {
    const mod = require(path.join(root, 'mma-stubs', 'scripts', f));
    const firstExport = Object.keys(mod).find(k => typeof mod[k] === 'function');
    if (firstExport) {
      assertThrows(() => mod[firstExport](), 'NOT_IMPLEMENTED');
    }
  }
  console.log('  Layer ' + layerNum + ': OK (stubs throw)');
}

function main() {
  const arg = process.argv[2];
  const maxLayer = arg === undefined ? 6 : Number(arg);

  console.log('\n  mma-tests / test-runner\n  ' + '─'.repeat(36));

  if (maxLayer >= 0) runLayer0();

  if (maxLayer >= 1) {
    runStubLayer(1, [
      'mma-stub-ma-ui.js',
      'mma-stub-ma-ui-editor.js',
      'mma-stub-ma-ui-bootstrap.js'
    ]);
  }
  if (maxLayer >= 2) {
    runStubLayer(2, [
      'mma-stub-ma-ui-editor-tabs.js',
      'mma-stub-ma-ui-editor-tree.js',
      'mma-stub-ma-ui-editor-find.js',
      'mma-stub-ma-ui-editor-styled.js'
    ]);
  }
  if (maxLayer >= 3) {
    runStubLayer(3, ['mma-stub-ma-ui-nav.js', 'mma-stub-ma-ui-input.js']);
  }
  if (maxLayer >= 4) {
    runStubLayer(4, ['mma-stub-ma-ui-config-settings.js', 'mma-stub-ma-ui-config-ingest.js']);
  }
  if (maxLayer >= 5) {
    runStubLayer(5, [
      'mma-stub-ma-ui-workspace-session.js',
      'mma-stub-ma-ui-workspace-projects.js',
      'mma-stub-ma-ui-workspace-blueprints.js',
      'mma-stub-ma-ui-workspace-todos-chores.js'
    ]);
  }
  if (maxLayer >= 6) {
    runStubLayer(6, ['mma-stub-ma-ui-chat.js']);
  }

  console.log('\n  All requested layers passed.\n');
}

main();
