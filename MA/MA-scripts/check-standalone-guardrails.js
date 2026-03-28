#!/usr/bin/env node
// Static checks so the MA tree stays self-contained under MA_ROOT (no accidental ../ escapes in require()).
'use strict';

const fs = require('fs');
const path = require('path');
const { scan, formatReport } = require('../BackEnd/infra/infra-health');

const MA_ROOT = path.join(__dirname, '..');
const SCAN_ROOTS = ['BackEnd', 'FrontEnd', 'MA-scripts'];

let failed = false;

function walkJs(absDir, onFile) {
  if (!fs.existsSync(absDir)) return;
  for (const name of fs.readdirSync(absDir)) {
    const full = path.join(absDir, name);
    const st = fs.statSync(full);
    if (st.isDirectory()) {
      if (name === 'node_modules') continue;
      walkJs(full, onFile);
    } else if (name.endsWith('.js')) onFile(full);
  }
}

function checkRequires(absFile) {
  const text = fs.readFileSync(absFile, 'utf8');
  // Flag require() paths with three or more parent hops (often leaves MA_ROOT).
  if (/require\s*\(\s*['"]\.\.\/\.\.\/\.\./.test(text)) {
    console.error('[guardrails] Possible parent escape in require():', path.relative(MA_ROOT, absFile));
    failed = true;
  }
}

const health = scan();
if (health.summary.critical > 0) {
  console.error('[guardrails] Health scan reported critical issues:\n');
  console.error(formatReport(health));
  process.exit(1);
}

for (const root of SCAN_ROOTS) {
  walkJs(path.join(MA_ROOT, root), checkRequires);
}

for (const entry of ['MA-Server-standalone.js', 'MA-Server.js', 'MA-cli.js', 'ma-start.js']) {
  const f = path.join(MA_ROOT, entry);
  if (fs.existsSync(f)) checkRequires(f);
}

if (failed) {
  console.error('[guardrails] FAILED — fix require paths above.');
  process.exit(1);
}

console.log('[guardrails] OK — health critical=0, no suspicious require() escapes.');
