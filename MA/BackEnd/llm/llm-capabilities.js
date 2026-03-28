// ── LLM · Provider Capability Registry ───────────────────────────────────────
//
// HOW CAPABILITY DETECTION WORKS:
// Different AI providers support different features.  Instead of having
// if/else checks scattered everywhere ("if anthropic, do X"), this file
// declares a clean registry of what each provider can do.
//
// Think of it like a features chart on a product comparison page:
//
//   Feature              | Anthropic | OpenRouter | Ollama
//   ---------------------|-----------|------------|-------
//   Native tool use      |    ✓      |     ✓      |   ✗
//   Extended thinking    |    ✓      |     ✗      |   ✗
//   Prompt caching       |    ✓      |     ✗      |   ✗
//   Vision (images)      |    ✓      |  depends   |   ✓
//   JSON mode            |    ✗      |     ✓      |   ✓
//
// Other modules just ask: "does this config support native tools?"
// and this registry gives the answer.
//
// Users can override defaults in their config (e.g. enable vision
// for a specific OpenRouter model that supports it).
//
// WHAT USES THIS:
//   core-config.js — resolves capabilities when loading/saving config
//   MA-core.js     — checks capabilities for feature gates
//
// EXPORTS:
//   getCapabilities(config)       → {nativeTools, vision, ...}
//   hasCapability(config, name)   → boolean
//   resolveCapabilities(config)   → config with .capabilities merged
//   PROVIDER_CAPS                 — the raw defaults table
// ─────────────────────────────────────────────────────────────────────────────
'use strict';

// ── Provider Capability Defaults ────────────────────────────────────────────
const PROVIDER_CAPS = {
  anthropic: {
    promptCaching:    true,
    extendedCache:    true,       // 1-hour cache TTL
    compaction:       false,      // Disabled by default pending stable context compaction behavior
    extendedThinking: true,       // native thinking parameter
    adaptiveThinking: true,       // adaptive mode (Opus 4.6)
    nativeToolUse:    true,       // tools array in request
    contextEditing:   true,       // context_management.edits clear operations
  },
  openrouter: {
    promptCaching:    false,      // provider-dependent, conservative default
    extendedCache:    false,
    compaction:       'prompt',   // LLM prompt-based summarization
    extendedThinking: false,      // model-dependent, conservative default
    adaptiveThinking: false,
    nativeToolUse:    true,       // OpenAI-compatible tool use
    contextEditing:   false,
  },
  ollama: {
    promptCaching:    false,
    extendedCache:    false,
    compaction:       'prompt',   // LLM prompt-based summarization
    extendedThinking: false,
    adaptiveThinking: false,
    nativeToolUse:    false,      // model-dependent, conservative default
    contextEditing:   false,
  }
};

/**
 * Get default capabilities for a provider type.
 * @param {string} providerType - 'anthropic' | 'openrouter' | 'ollama'
 * @returns {object} Capability map (all false for unknown providers)
 */
function getCapabilities(providerType) {
  return { ...(PROVIDER_CAPS[providerType] || PROVIDER_CAPS.ollama) };
}

/**
 * Check if a config supports a specific capability.
 * @param {object} config - { type, capabilities? }
 * @param {string} capName - Capability key (e.g. 'extendedThinking')
 * @returns {boolean|string} true/false or capability mode string (e.g. 'api'/'prompt')
 */
function hasCapability(config, capName) {
  if (config.capabilities && config.capabilities[capName] !== undefined) {
    return config.capabilities[capName];
  }
  const defaults = PROVIDER_CAPS[config.type] || PROVIDER_CAPS.ollama;
  return defaults[capName] || false;
}

/**
 * Resolve full capability set: provider defaults + user overrides.
 * @param {object} config - { type, capabilities? }
 * @returns {object} Frozen resolved capabilities object
 */
function resolveCapabilities(config) {
  const defaults = getCapabilities(config.type);
  const overrides = config.capabilities || {};
  const resolved = { ...defaults };
  for (const key of Object.keys(overrides)) {
    if (key in defaults) {
      resolved[key] = overrides[key];
    }
  }
  return Object.freeze(resolved);
}

module.exports = { getCapabilities, hasCapability, resolveCapabilities, PROVIDER_CAPS };
