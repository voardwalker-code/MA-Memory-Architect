'use strict';
// ── mma-contracts · Generic API result helpers ───────────────────────────────
//
// Many MA routes return { ok: true } or { ok: false, error: '...' }.
// These helpers normalize checks for stubs and tests.
//
// EXPORTS: isOkEnvelope, assertOkShape
// ─────────────────────────────────────────────────────────────────────────────

function isOkEnvelope(d) {
  return d && typeof d === 'object' && typeof d.ok === 'boolean';
}

function assertOkShape(d) {
  if (!isOkEnvelope(d)) return { valid: false, errors: ['Not an ok/error envelope'] };
  if (d.ok === false && (d.error === undefined || d.error === null)) {
    return { valid: false, errors: ['error string expected when ok is false'] };
  }
  return { valid: true, errors: [] };
}

module.exports = {
  isOkEnvelope,
  assertOkShape
};
