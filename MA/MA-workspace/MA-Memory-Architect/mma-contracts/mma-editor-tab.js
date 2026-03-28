'use strict';
// ── mma-contracts · Editor tab record ────────────────────────────────────────
//
// Subset of fields on open tab objects in ma-ui.js / editor modules.
//
// EXPORTS: TAB_REQUIRED, createEditorTab, validateEditorTab
// ─────────────────────────────────────────────────────────────────────────────

const TAB_VERSION = 1;

const TAB_REQUIRED = ['id', 'path', 'name', 'content'];

const DEFAULTS = {
  dirty: false,
  mode: 'plaintext',
  viewMode: 'source'
};

function createEditorTab(fields) {
  const record = Object.assign({}, DEFAULTS, fields);
  if (!record.id) record.id = 'tab_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
  return record;
}

function validateEditorTab(record) {
  const errors = [];
  if (!record || typeof record !== 'object') {
    errors.push('Tab must be an object');
    return { valid: false, errors };
  }
  for (const f of TAB_REQUIRED) {
    if (record[f] === undefined || record[f] === null) errors.push('Missing: ' + f);
  }
  if (typeof record.dirty !== 'boolean') errors.push('dirty must be boolean');
  return { valid: errors.length === 0, errors };
}

module.exports = {
  TAB_VERSION,
  TAB_REQUIRED,
  DEFAULTS,
  createEditorTab,
  validateEditorTab
};
