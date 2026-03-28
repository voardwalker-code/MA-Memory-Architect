'use strict';
const fs   = require('fs');
const path = require('path');

const MANIFEST = path.join(__dirname, '..', 'PROJECT-MANIFEST.json');

function run() {
  if (!fs.existsSync(MANIFEST)) {
    console.log('No PROJECT-MANIFEST.json found.');
    return;
  }
  const m = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'));
  const mods = m.modules || [];
  const total = mods.length;
  const done = mods.filter(x => x.status === 'complete' || x.status === 'implemented').length;
  const stubs = mods.filter(x => x.status === 'stub').length;

  console.log('\n  ' + (m.project || 'Project') + ' Status');
  console.log('  ' + '─'.repeat(40));
  console.log('  Modules: ' + total + '  |  Implemented: ' + done + '  |  Stubs: ' + stubs);
  console.log('  Progress: ' + (total ? Math.round(done / total * 100) : 0) + '%\n');

  const layers = m.layers || {};
  for (const num of Object.keys(layers).sort((a, b) => Number(a) - Number(b))) {
    const info = layers[num];
    const layerMods = mods.filter(x => String(x.layer) === String(num));
    const layerDone = layerMods.filter(x => x.status === 'complete' || x.status === 'implemented').length;
    const mark = layerDone === layerMods.length ? '✓' : ' ';
    console.log('  [' + mark + '] Layer ' + num + ': ' + info.name + ' — ' + layerDone + '/' + layerMods.length);
  }
  console.log();
}

run();
