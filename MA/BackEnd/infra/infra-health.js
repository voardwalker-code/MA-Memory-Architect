// ── Infra · Health Scanner ─────────────────────────────────────────────────
//
// HOW HEALTH CHECKS WORK:
// Before you drive a car, you check the fuel, tires, and engine lights.
// MA does the same thing with its own files — before serving requests,
// it scans to make sure nothing is missing or broken.
//
// THE SCAN PROCESS:
//   1. Check every file in CORE_REGISTRY exists and isn't empty
//   2. For .js files: try to parse them (catches syntax errors)
//   3. For .json files: try to JSON.parse them
//   4. For .html files: check for balanced tags
//   5. Collect all issues with severity levels (critical / warning)
//
// CORE_REGISTRY:
// A list of every file MA needs to run.  If any of these are missing
// or corrupted, the health check catches it immediately.
//
// SEVERITY LEVELS:
//   critical — something is actually broken (missing file, syntax error)
//   warning  — something looks off but won't crash (imbalanced HTML tags)
//
// WHAT USES THIS:
//   MA-core.js          — runs health check during boot
//   svc-pulse.js        — periodic background health scans
//   route-system.js     — /health API endpoint
//   MA-generate-fixer.js — reads CORE_REGISTRY for validation
//
// EXPORTS:
//   scan()              → {issues[], summary}
//   formatReport(scan)  → human-readable report string
//   CORE_REGISTRY       — the file checklist
// ─────────────────────────────────────────────────────────────────────────────
// Small registry — only MA's own files.
'use strict';

const fs   = require('fs');
const path = require('path');
const vm   = require('vm');

const MA_ROOT = path.resolve(__dirname, '..', '..');

// ── MA Core Registry — every file MA needs to run ──────────────────────────
const CORE_REGISTRY = {
  'MA-Server-standalone.js':                'Canonical HTTP server entry',
  'MA-Server.js':                           'Shim → MA-Server-standalone.js',
  'MA-cli.js':                             'Entry point — Terminal CLI',
  'package.json':                          'Package metadata',
  'BackEnd/MA-core.js':                      'Shared bootstrap, state, chat orchestration',
  'BackEnd/MA-workspace-tools.js':           'Tool call parsing + execution',
  'BackEnd/MA-routes.js':                    'HTTP route dispatcher',
  'BackEnd/llm/llm-api.js':                 'LLM caller (OpenRouter + Ollama + Anthropic)',
  'BackEnd/llm/llm-router.js':              'Intelligent model selection + performance tracking',
  'BackEnd/llm/llm-capabilities.js':        'Provider capability registry',
  'BackEnd/llm/llm-tool-adapter.js':        'Tool schema converter for native function calling',
  'BackEnd/services/svc-memory.js':          'Memory store/retrieve/search/ingest',
  'BackEnd/services/svc-tasks.js':           'Intent classifier + task runner',
  'BackEnd/services/svc-agents.js':          'Agent catalog + delegation CRUD',
  'BackEnd/services/svc-pulse.js':           'Pulse engine — timers, health scans, chores',
  'BackEnd/services/svc-project-archive.js': 'Per-project archive with weighted graph',
  'BackEnd/services/svc-worklog.js':         'Persistent session worklog for continuity',
  'BackEnd/services/svc-slash-commands.js':  'Slash command handler',
  'BackEnd/nlp/nlp-rake.js':                'RAKE keyphrasing — topic extraction',
  'BackEnd/nlp/nlp-bm25.js':                'BM25 relevance scoring',
  'BackEnd/nlp/nlp-yake.js':                'YAKE keyword extraction',
  'BackEnd/nlp/nlp-markdown.js':             'Markdown to HTML renderer',
  'BackEnd/infra/infra-health.js':           'Health scanner (this file)',
  'BackEnd/infra/infra-http-utils.js':       'HTTP response helpers + path guards',
  'BackEnd/infra/infra-web-fetch.js':        'Web search + URL fetch',
  'BackEnd/infra/infra-cmd-executor.js':     'Sandboxed command execution',
  'FrontEnd/MA-index.html':                 'Chat GUI',
  'MA-entity/entity_ma/entity.json':         'Entity profile'
};

// ── Scan logic ──────────────────────────────────────────────────────────────

/** Run a full health scan. Returns { issues[], summary } */
function scan() {
  const issues = [];

  // Pass 1: existence + zero-byte
  for (const [rel, desc] of Object.entries(CORE_REGISTRY)) {
    const abs = path.join(MA_ROOT, rel);
    if (!fs.existsSync(abs)) {
      issues.push({ file: rel, severity: 'critical', type: 'missing', desc });
    } else {
      const stat = fs.statSync(abs);
      if (stat.size === 0) {
        issues.push({ file: rel, severity: 'critical', type: 'zero_byte', desc });
      }
    }
  }

  // Pass 2: deep validation on existing files
  for (const [rel] of Object.entries(CORE_REGISTRY)) {
    const abs = path.join(MA_ROOT, rel);
    if (!fs.existsSync(abs) || fs.statSync(abs).size === 0) continue;

    const ext = path.extname(rel).toLowerCase();
    try {
      const content = fs.readFileSync(abs, 'utf8');
      if (ext === '.js') _validateJS(rel, content, issues);
      if (ext === '.json') _validateJSON(rel, content, issues);
      if (ext === '.html') _validateHTML(rel, content, issues);
    } catch (e) {
      issues.push({ file: rel, severity: 'warning', type: 'read_error', detail: e.message });
    }
  }

  // Summary
  const critical = issues.filter(i => i.severity === 'critical').length;
  const warnings = issues.filter(i => i.severity === 'warning').length;
  return {
    issues,
    summary: {
      total: Object.keys(CORE_REGISTRY).length,
      critical,
      warnings,
      healthy: critical === 0 && warnings === 0
    }
  };
}

function _validateJS(rel, content, issues) {
  try {
    new vm.Script(content, { filename: rel });
  } catch (e) {
    issues.push({ file: rel, severity: 'critical', type: 'syntax_error', detail: e.message });
  }
}

function _validateJSON(rel, content, issues) {
  try {
    JSON.parse(content);
  } catch (e) {
    issues.push({ file: rel, severity: 'critical', type: 'json_error', detail: e.message });
  }
}

function _validateHTML(rel, content, issues) {
  // Simple tag balance check
  const opens = (content.match(/<[a-z][^/>]*>/gi) || []).length;
  const closes = (content.match(/<\/[a-z][^>]*>/gi) || []).length;
  if (Math.abs(opens - closes) > 3) {
    issues.push({ file: rel, severity: 'warning', type: 'html_imbalance', detail: `open=${opens} close=${closes}` });
  }
}

/** Format scan results as readable text. */
function formatReport(result) {
  const lines = ['MA Health Scan', '='.repeat(40)];
  if (result.summary.healthy) {
    lines.push(`All ${result.summary.total} core files OK.`);
  } else {
    lines.push(`Files: ${result.summary.total} | Critical: ${result.summary.critical} | Warnings: ${result.summary.warnings}`);
    lines.push('');
    for (const i of result.issues) {
      lines.push(`  [${i.severity.toUpperCase()}] ${i.file} — ${i.type}${i.detail ? ': ' + i.detail : ''}`);
    }
  }
  return lines.join('\n');
}

module.exports = { scan, formatReport, CORE_REGISTRY, MA_ROOT };
