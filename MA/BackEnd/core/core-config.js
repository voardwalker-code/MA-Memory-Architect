// ── Core Config ─────────────────────────────────────────────────────────────
//
// This module handles loading and saving the LLM provider settings for MA.
//
// HOW IT WORKS:
// MA needs to know which AI model to talk to — like Anthropic (Claude),
// Ollama (local models), or OpenRouter (many models).  This module reads
// those settings from a JSON file on disk, cleans them up into a standard
// shape, and can save new settings when the user changes them.
//
// If there's no config file yet, it copies the example template so the
// user has something to edit.  It can also migrate old settings from a
// legacy parent folder (one-time migration).
//
// WHAT IT EXPORTS:
//   loadConfig(paths)            — Read config file → return clean settings
//   setConfig(params)            — Save new settings → return updated config
//   normalizeRuntime(raw)        — Clean up a raw config object
//   inferContextWindow(cfg)      — Guess model's token limit
//
// USED BY: MA-core.js (the main orchestrator calls these during boot & config changes)
// ─────────────────────────────────────────────────────────────────────────────
'use strict';

const fs   = require('fs');
const path = require('path');

// resolveCapabilities figures out what an AI model can do
// (like: can it use tools? can it think step-by-step?)
const { resolveCapabilities } = require('../llm/llm-capabilities');

// ─────────────────────────────────────────────────────────────────────────────
// normalizeRuntime(raw)
//
// Takes a raw config object (straight from the JSON file) and cleans it up.
// Makes sure all the fields are the right type and shape.
// Returns null if the input is missing required stuff.
//
// Think of it like a spell-checker for config objects — it fixes up
// messy input so the rest of MA can trust the data.
//
//   raw — the object we parsed from the JSON config file
//   Returns: a clean config object, or null if not usable
// ─────────────────────────────────────────────────────────────────────────────
function normalizeRuntime(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const type = String(raw.type || '').toLowerCase().trim();
  if (!type || !raw.model) return null;
  const maxTokens = Number.parseInt(raw.maxTokens, 10);
  const vision = raw.vision === true;

  // Ollama runs locally — no API key needed
  if (type === 'ollama') {
    return {
      type: 'ollama',
      endpoint: String(raw.endpoint || 'http://localhost:11434').trim(),
      model: String(raw.model || '').trim(),
      workspacePath: String(raw.workspacePath || '').trim() || undefined,
      ...(maxTokens > 0 ? { maxTokens } : {}),
      ...(vision ? { vision: true } : {})
    };
  }

  // Cloud providers need an API key
  const key = String(raw.apiKey || raw.key || '').trim();
  if (!key) return null;

  if (type === 'anthropic') {
    return {
      type: 'anthropic',
      endpoint: String(raw.endpoint || 'https://api.anthropic.com/v1/messages').trim(),
      apiKey: key,
      model: String(raw.model || '').trim(),
      workspacePath: String(raw.workspacePath || '').trim() || undefined,
      ...(maxTokens > 0 ? { maxTokens } : {}),
      ...(vision ? { vision: true } : {}),
      ...(raw.capabilities && typeof raw.capabilities === 'object' ? { capabilities: raw.capabilities } : {})
    };
  }

  // Default: OpenRouter (catch-all for other providers)
  return {
    type: 'openrouter',
    endpoint: String(raw.endpoint || 'https://openrouter.ai/api/v1/chat/completions').trim(),
    apiKey: key,
    model: String(raw.model || '').trim(),
    workspacePath: String(raw.workspacePath || '').trim() || undefined,
    ...(maxTokens > 0 ? { maxTokens } : {}),
    ...(vision ? { vision: true } : {}),
    ...(raw.capabilities && typeof raw.capabilities === 'object' ? { capabilities: raw.capabilities } : {})
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// inferContextWindow(cfg)
//
// Different AI models can handle different amounts of text at once.
// This is called the "context window" — like how many pages of a book
// the model can read at the same time.
//
// This function guesses that number based on which provider and model
// you're using.  If we don't know, we pick a safe default.
//
//   cfg — the clean config object (needs cfg.type and cfg.model)
//   Returns: a number (estimated tokens the model can handle)
// ─────────────────────────────────────────────────────────────────────────────
function inferContextWindow(cfg) {
  if (cfg.type === 'anthropic') {
    if (/haiku/i.test(cfg.model)) return 200000;
    return 1000000;  // Opus / Sonnet: 1M context
  }
  if (cfg.type === 'ollama') return 32768;  // conservative default
  return 128000;  // OpenRouter default
}

// ─────────────────────────────────────────────────────────────────────────────
// _readLegacyGlobalConfig(legacyPath)
//
// MA used to store its config in a parent folder (../Config/ma-config.json).
// This reads that old file so we can migrate the user's settings into the
// new location.  Returns null if the file doesn't exist or can't be read.
//
// This is a ONE-TIME migration — we read the old file but never write to it.
// ─────────────────────────────────────────────────────────────────────────────
function _readLegacyGlobalConfig(legacyPath) {
  try {
    if (!fs.existsSync(legacyPath)) return null;
    return JSON.parse(fs.readFileSync(legacyPath, 'utf8'));
  } catch (_) {
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// _extractLegacyRuntimeConfig(globalCfg)
//
// The old parent config used a "profiles" system with nested settings.
// This digs the actual MA runtime config out of that nested structure.
//
//   globalCfg — the parsed old config object (or null)
//   Returns: a normalised config, or null
// ─────────────────────────────────────────────────────────────────────────────
function _extractLegacyRuntimeConfig(globalCfg) {
  if (!globalCfg || typeof globalCfg !== 'object') return null;
  const profileName = String(globalCfg.lastActive || '').trim() || 'default-multi-llm';
  const profile = globalCfg.profiles && globalCfg.profiles[profileName];
  if (!profile || typeof profile !== 'object') return null;

  const candidate = normalizeRuntime(profile.ma) || normalizeRuntime(profile.nekocore);
  if (!candidate) return null;

  if (globalCfg.workspacePath && !candidate.workspacePath) {
    candidate.workspacePath = String(globalCfg.workspacePath).trim();
  }
  return candidate;
}

// ─────────────────────────────────────────────────────────────────────────────
// loadConfig(paths)
//
// Reads the config file from disk, cleans it up, and returns it.
// If the local file doesn't have valid config, tries to migrate from
// the legacy location.
//
// WHERE THE CONFIG COMES FROM:
//   1. First try:  MA-Config/ma-config.json (the normal location)
//   2. Fallback:   ../Config/ma-config.json (the old legacy location)
//   3. Last resort: no config (user must set up via GUI or CLI)
//
//   paths.CONFIG_PATH        — where the main config file lives
//   paths.LEGACY_CONFIG_PATH — where the old config used to be
//   paths.MA_ROOT            — project root (for finding the example template)
//
//   Returns: { config, workspacePath } — config may be null if not configured
// ─────────────────────────────────────────────────────────────────────────────
function loadConfig(paths) {
  const { CONFIG_PATH, LEGACY_CONFIG_PATH, MA_ROOT } = paths;
  const configDir = path.dirname(CONFIG_PATH);
  if (!fs.existsSync(configDir)) fs.mkdirSync(configDir, { recursive: true });

  // Copy the example template if no config file exists yet
  if (!fs.existsSync(CONFIG_PATH)) {
    const example = path.join(MA_ROOT, 'ma-config.example.json');
    if (fs.existsSync(example)) {
      fs.copyFileSync(example, CONFIG_PATH);
      console.log('  Created MA-Config/ma-config.json from template — edit it or use the GUI');
    }
  }

  let config = null;
  let workspacePath = null;

  try {
    // Try the local config file first
    if (fs.existsSync(CONFIG_PATH)) {
      const localRaw = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
      const localRuntime = normalizeRuntime(localRaw);
      if (localRuntime) {
        config = { ...localRuntime };
        if (localRaw.capabilities && typeof localRaw.capabilities === 'object') {
          config.capabilities = localRaw.capabilities;
        }
        if (localRaw.memoryLimit !== undefined) config.memoryLimit = localRaw.memoryLimit;
        if (localRaw.memoryRecall !== undefined) config.memoryRecall = localRaw.memoryRecall;
        if (localRaw.taskBudgetMultiplier !== undefined) config.taskBudgetMultiplier = localRaw.taskBudgetMultiplier;
        config.integrationMode = (localRaw.integrationMode === 'nekocore') ? 'nekocore' : 'off';
        console.log(`  Config loaded from local MA-Config: ${config.type}/${config.model}`);
      } else {
        console.log('  Config file exists but needs API key — configure via GUI or CLI');
      }
    }

    // If local didn't work, try migrating from legacy location
    if (!config) {
      const legacy = _extractLegacyRuntimeConfig(_readLegacyGlobalConfig(LEGACY_CONFIG_PATH));
      if (legacy) {
        config = { ...legacy };
        config.integrationMode = 'off';
        fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
        console.log(`  Config migrated from legacy parent profile to local MA-Config: ${config.type}/${config.model}`);
      }
    }

    // Check for a custom workspace path in the config
    const wsPath = String(config?.workspacePath || '').trim();
    if (wsPath) {
      const resolved = path.resolve(wsPath);
      if (fs.existsSync(resolved)) {
        workspacePath = resolved;
        console.log(`  Workspace path: ${workspacePath}`);
      } else {
        console.warn(`  Workspace path not found: ${resolved} — using default`);
      }
    }
  } catch (e) { console.warn('  Config load failed:', e.message); }

  // Figure out what capabilities this AI model has (tool use, vision, etc.)
  if (config) {
    config.capabilities = resolveCapabilities(config);
    config.contextWindow = config.contextWindow || inferContextWindow(config);
    console.log(`  Capabilities resolved: ${Object.entries(config.capabilities).filter(([,v]) => v && v !== false).map(([k]) => k).join(', ') || 'none'}`);
  }

  return { config, workspacePath };
}

// ─────────────────────────────────────────────────────────────────────────────
// setConfig(params)
//
// Saves new LLM settings to disk.  Merges new values with existing ones
// so you don't have to send EVERY field every time — just the ones that
// changed.
//
//   params.newConfig      — the new settings from the user
//   params.CONFIG_PATH    — path to the config JSON file
//   params.currentConfig  — the current running config (for merging)
//
//   Returns: { config, workspacePath } — the updated config + resolved path
// ─────────────────────────────────────────────────────────────────────────────
function setConfig(params) {
  const { newConfig, CONFIG_PATH, currentConfig } = params;

  // Read what's already in the file (so we can merge with it)
  let existingRaw = {};
  try {
    if (fs.existsSync(CONFIG_PATH)) existingRaw = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
  } catch (_) { existingRaw = {}; }

  // Merge new values with existing — new values win
  const type = String(newConfig.type || existingRaw.type || '').toLowerCase().trim();
  const endpoint = String(newConfig.endpoint || existingRaw.endpoint || '').trim();
  const model = String(newConfig.model || existingRaw.model || '').trim();
  const incomingKey = String(newConfig.apiKey || '').trim();
  const existingKey = String(existingRaw.apiKey || '').trim();
  const apiKey = incomingKey || existingKey;
  const requestedMaxTokens = Number.parseInt(newConfig.maxTokens ?? existingRaw.maxTokens, 10);
  const maxTokens = requestedMaxTokens > 0 ? requestedMaxTokens : undefined;
  const vision = newConfig.vision === true || (newConfig.vision === undefined && existingRaw.vision === true);
  const workspacePathStr = String(newConfig.workspacePath ?? existingRaw.workspacePath ?? '').trim();
  const memoryLimit = Number.parseInt(newConfig.memoryLimit ?? existingRaw.memoryLimit, 10);
  const memoryRecall = (newConfig.memoryRecall !== undefined)
    ? (newConfig.memoryRecall !== false)
    : (existingRaw.memoryRecall !== false);
  const integrationMode = String(newConfig.integrationMode ?? existingRaw.integrationMode ?? 'off').toLowerCase() === 'nekocore'
    ? 'nekocore'
    : 'off';
  const taskBudgetMultiplier = parseFloat(newConfig.taskBudgetMultiplier ?? existingRaw.taskBudgetMultiplier);
  const userCapabilities = (newConfig.capabilities && typeof newConfig.capabilities === 'object')
    ? newConfig.capabilities
    : ((newConfig._userCapabilities && typeof newConfig._userCapabilities === 'object')
      ? newConfig._userCapabilities
      : (existingRaw.capabilities && typeof existingRaw.capabilities === 'object' ? existingRaw.capabilities : undefined));

  // Validate required fields
  if (!type || !endpoint || !model) {
    throw new Error('Need type, endpoint, model');
  }
  if (type !== 'ollama' && !apiKey) {
    throw new Error('API key is required');
  }

  // Build the clean config object
  const next = {
    type,
    endpoint,
    model,
    ...(type === 'ollama' ? {} : { apiKey }),
    ...(maxTokens ? { maxTokens } : {}),
    ...(vision ? { vision: true } : {}),
    ...(workspacePathStr ? { workspacePath: workspacePathStr } : {}),
    ...(Number.isFinite(memoryLimit) ? { memoryLimit: Math.min(50, Math.max(6, memoryLimit)) } : {}),
    ...(memoryRecall !== undefined ? { memoryRecall } : {}),
    integrationMode,
    ...(Number.isFinite(taskBudgetMultiplier) ? { taskBudgetMultiplier: Math.max(0.25, Math.min(10, taskBudgetMultiplier)) } : {}),
    ...(userCapabilities ? { capabilities: userCapabilities } : {})
  };

  const config = { ...next };
  // Resolve capabilities for the new config (what can this model do?)
  config.capabilities = resolveCapabilities(config);
  config.contextWindow = Number.parseInt(newConfig.contextWindow, 10)
    || (currentConfig && currentConfig.contextWindow)
    || inferContextWindow(config);

  // Save to disk — strip runtime-only fields first
  const toSave = { ...config };
  delete toSave.capabilities;
  delete toSave.contextWindow;
  // Re-add user-level capability overrides if they existed in the input
  if (newConfig._userCapabilities) toSave.capabilities = newConfig._userCapabilities;
  fs.mkdirSync(path.dirname(CONFIG_PATH), { recursive: true });
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(toSave, null, 2));

  // Figure out the resolved workspace path
  let workspacePath = null;
  if (workspacePathStr) {
    const resolved = path.resolve(workspacePathStr);
    if (fs.existsSync(resolved)) workspacePath = resolved;
  }

  return { config, workspacePath };
}

module.exports = { loadConfig, setConfig, normalizeRuntime, inferContextWindow };
