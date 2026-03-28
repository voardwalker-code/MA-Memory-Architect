// ── MA Core ─────────────────────────────────────────────────────────────────
// Shared bootstrap, state, and chat orchestration for MA.
// Both MA-Server.js (HTTP) and MA-cli.js (terminal) import this.
// No HTTP, no readline — pure logic + state.
//
// HOW IT WORKS:
// This file is the "conductor" of the orchestra.  Instead of having all
// the music in one giant score, each section has its own sheet:
//
//   core-config.js    — Loading and saving LLM provider settings
//   core-bootstrap.js — Starting up: dirs, entity, skills, agents, memory
//   core-tokens.js    — Token counting and history compression
//   core-context.js   — Gathering context (files, memories, knowledge...)
//   core-chat.js      — The main chat handler (tasks + conversation)
//
// This file (MA-core.js) just holds the shared state, calls the boot
// sequence, and delegates handleChat to the chat module.
// The conductor doesn't play every instrument — it coordinates them.
//
// RESILIENCE:
// Each core module is loaded with safeRequire() — so if a module file
// is missing or broken, the server logs a warning instead of crashing.
// One broken piece won't take down the whole system.
//
// EXPORTS (public API — used by MA-Server, CLI, routes, slash-commands):
//   Boot:       boot, ensureDirs, loadConfig, loadEntity, initMemory
//   State:      getConfig, getMemory, getEntity, isConfigured, setConfig
//   Mode:       getMode, setMode, getIntegrationMode
//   Chat:       handleChat
//   Knowledge:  loadKnowledge, listKnowledge
//   Re-exports: health, tasks, wsTools, agentCatalog, projectArchive,
//               modelRouter, worklog
//   Paths:      MA_ROOT, CONFIG_PATH, LEGACY_GLOBAL_CONFIG_PATH,
//               ENTITY_DIR, WORKSPACE_DIR, KNOWLEDGE_DIR
// ─────────────────────────────────────────────────────────────────────────────
'use strict';

const path = require('path');

// ── External MA modules (NOT part of the core/* extraction) ─────────────────
// These are other BackEnd modules that core orchestrates and re-exports.
const { callLLM }           = require('./llm/llm-api');
const { createMemoryStore } = require('./services/svc-memory');
const { hasCapability }     = require('./llm/llm-capabilities');
const { buildToolSchemas }  = require('./llm/llm-tool-adapter');
const tasks                 = require('./services/svc-tasks');
const wsTools               = require('./MA-workspace-tools');
const health                = require('./infra/infra-health');
const agentCatalog          = require('./services/svc-agents');
const projectArchive        = require('./services/svc-project-archive');
const modelRouter           = require('./llm/llm-router');
const worklog               = require('./services/svc-worklog');
const { DEFAULT_AGENTS, DEFAULT_ENTITY } = require('../MA-scripts/agent-definitions');

// ─────────────────────────────────────────────────────────────────────────────
// safeRequire(modulePath, label)
//
// Like require(), but if the module is missing or broken it returns null
// instead of crashing.  Think of it as a safety net — if someone
// accidentally breaks core-config.js, the rest of MA still loads.
//
//   modulePath — the path to require (e.g. './core/core-config')
//   label      — a friendly name for log messages
// ─────────────────────────────────────────────────────────────────────────────
function safeRequire(modulePath, label) {
  try {
    return require(modulePath);
  } catch (err) {
    console.warn(`[MA-core] ⚠ Could not load core module "${label}": ${err.message}`);
    return null;
  }
}

// ── Core sub-modules (loaded resiliently) ───────────────────────────────────
// Each module handles one area of responsibility.
// If one module fails to load, things that depend on it degrade gracefully.
const coreConfig  = safeRequire('./core/core-config',    'config');
const coreBoot    = safeRequire('./core/core-bootstrap', 'bootstrap');
const coreTokens  = safeRequire('./core/core-tokens',    'tokens');
const coreContext = safeRequire('./core/core-context',   'context');
const coreChat    = safeRequire('./core/core-chat',      'chat');

// ── Paths ───────────────────────────────────────────────────────────────────
// These are the important folder locations that MA uses.
// WORKSPACE_DIR is a `let` because the user can change it in config.
const MA_ROOT       = path.join(__dirname, '..');
const CONFIG_PATH   = path.join(MA_ROOT, 'MA-Config', 'ma-config.json');
const LEGACY_GLOBAL_CONFIG_PATH = path.join(MA_ROOT, '..', 'Config', 'ma-config.json');
const ENTITY_DIR    = path.join(MA_ROOT, 'MA-entity', 'entity_ma');
let   WORKSPACE_DIR = path.join(MA_ROOT, 'MA-workspace');
const KNOWLEDGE_DIR = path.join(MA_ROOT, 'MA-knowledge');

// ── State ───────────────────────────────────────────────────────────────────
// These variables hold MA's runtime state.  They start empty and get
// filled in during boot().
let config = null;    // { type, endpoint, apiKey, model, vision?, capabilities? }
let memory = null;    // memory store instance
let entity = null;    // entity.json contents
let skills = [];      // loaded skill contents [{ name, content }]
let maMode = 'work';  // 'work' (full tool access) or 'chat' (read-only)

// ── Mode getters/setters ────────────────────────────────────────────────────
// MA has two modes:
//   'work'  — full access to all tools (read, write, execute)
//   'chat'  — read-only mode (can search and read, but can't change things)
function getMode()  { return maMode; }
function setMode(m) { maMode = (m === 'chat') ? 'chat' : 'work'; }
function getIntegrationMode() {
  return (config && config.integrationMode) ? config.integrationMode : 'off';
}

// ── Bootstrap functions ─────────────────────────────────────────────────────
// These are called during boot() to set everything up.

/** Create required folders if they don't exist yet. */
function ensureDirs() {
  if (!coreBoot) return;
  coreBoot.ensureDirs([
    WORKSPACE_DIR,
    path.join(ENTITY_DIR, 'memories', 'episodic'),
    path.join(ENTITY_DIR, 'memories', 'semantic'),
    path.join(ENTITY_DIR, 'index')
  ]);
}

/** Load the LLM config from disk (delegates to core-config module). */
function loadConfig() {
  if (!coreConfig) return;
  const result = coreConfig.loadConfig({
    CONFIG_PATH,
    LEGACY_CONFIG_PATH: LEGACY_GLOBAL_CONFIG_PATH,
    MA_ROOT
  });
  if (result.config) config = result.config;
  if (result.workspacePath) WORKSPACE_DIR = result.workspacePath;
}

/** Load the entity identity from disk (delegates to core-bootstrap). */
function loadEntity() {
  if (!coreBoot) return;
  entity = coreBoot.loadEntity(ENTITY_DIR);
}

/** Start the memory system (delegates to core-bootstrap). */
function initMemory() {
  if (!coreBoot) return;
  memory = coreBoot.initMemory(createMemoryStore);
}

/**
 * Full boot sequence — call once at startup.
 * Each step is wrapped so one failure doesn't stop the rest.
 */
function boot() {
  console.log('\n  MA — Memory Architect');
  console.log('  ' + '─'.repeat(36));
  ensureDirs();
  loadConfig();
  if (coreBoot) coreBoot.ensureEntity(ENTITY_DIR, DEFAULT_ENTITY);
  loadEntity();
  if (coreBoot) skills = coreBoot.loadSkills(ENTITY_DIR, path.join(MA_ROOT, 'MA-skills'));
  if (coreBoot) coreBoot.ensureAgents(agentCatalog, DEFAULT_AGENTS);
  initMemory();
}

// ── State getters ───────────────────────────────────────────────────────────
function getConfig()    { return config; }
function getMemory()    { return memory; }
function getEntity()    { return entity; }
function isConfigured() { return !!config; }

// ── Config setter (delegates to core-config) ────────────────────────────────
/**
 * Save new LLM settings.  Merges with existing config.
 * Delegates the heavy lifting to core-config.js.
 */
function setConfig(newConfig) {
  if (!coreConfig) throw new Error('Config module not available');
  const result = coreConfig.setConfig({
    newConfig,
    CONFIG_PATH,
    currentConfig: config
  });
  config = result.config;
  // Update workspace path — either use the new resolved one,
  // or reset to default if the user cleared it
  if (result.workspacePath) {
    WORKSPACE_DIR = result.workspacePath;
    module.exports.WORKSPACE_DIR = WORKSPACE_DIR;
  } else if (!String(newConfig.workspacePath ?? '').trim()) {
    WORKSPACE_DIR = path.join(MA_ROOT, 'MA-workspace');
    module.exports.WORKSPACE_DIR = WORKSPACE_DIR;
  }
}

// ── Workspace root setter ───────────────────────────────────────────────────
/**
 * Change the active workspace root directory at runtime.
 * Used by "Open Folder" to point the workspace at a new location.
 */
function setWorkspaceRoot(dirPath) {
  const fs = require('fs');
  const resolved = path.resolve(dirPath);
  if (!fs.existsSync(resolved) || !fs.statSync(resolved).isDirectory()) {
    throw new Error('Not a valid directory: ' + resolved);
  }
  WORKSPACE_DIR = resolved;
  module.exports.WORKSPACE_DIR = resolved;
  return resolved;
}

function getWorkspaceRoot() {
  return WORKSPACE_DIR;
}

// ── Knowledge (delegates to core-bootstrap) ─────────────────────────────────
function loadKnowledge(name) {
  if (!coreBoot) return null;
  return coreBoot.loadKnowledge(KNOWLEDGE_DIR, name);
}

function listKnowledge() {
  if (!coreBoot) return [];
  return coreBoot.listKnowledge(KNOWLEDGE_DIR);
}

// ── Chat handler (delegates to core-chat) ───────────────────────────────────
/**
 * Process a user chat message.  This is the main entry point used by
 * both the HTTP server and the CLI.
 *
 * Builds a state snapshot and deps object, then hands off to core-chat.js
 * which does all the heavy lifting (context gathering, LLM calls, tools).
 */
async function handleChat(chatOpts) {
  if (!coreChat) throw new Error('Chat module not available');

  // Snapshot of current state — core-chat reads but does not mutate
  const state = {
    config, memory, entity, skills, maMode,
    WORKSPACE_DIR, KNOWLEDGE_DIR, MA_ROOT
  };

  // Dependencies — all the modules and functions core-chat needs
  const deps = {
    callLLM, tasks, wsTools, modelRouter, worklog,
    projectArchive, agentCatalog, hasCapability, buildToolSchemas,
    gatherContext:          coreContext ? coreContext.gatherContext : null,
    buildSystemPrompt:      coreContext ? coreContext.buildSystemPrompt : null,
    compressHistory:        coreTokens ? coreTokens.compressHistory : null,
    estimateTokens:         coreTokens ? coreTokens.estimateTokens : null,
    estimateMessagesTokens: coreTokens ? coreTokens.estimateMessagesTokens : null,
    stripThinkingTags:      coreTokens ? coreTokens.stripThinkingTags : null,
    listKnowledge,
    loadKnowledge
  };

  return coreChat.handleChat(chatOpts, state, deps);
}

// ── Exports ─────────────────────────────────────────────────────────────────
// This is the public API.  Everything listed here is used by other MA files
// (MA-Server-standalone.js, MA-cli.js, route modules, slash commands).
// Do NOT remove or rename anything without checking all consumers first.
module.exports = {
  // Bootstrap
  boot, ensureDirs, loadConfig, loadEntity, initMemory,
  // State
  getConfig, getMemory, getEntity, isConfigured, setConfig,
  // Mode
  getMode, setMode, getIntegrationMode,
  // Workspace root
  setWorkspaceRoot, getWorkspaceRoot,
  // Chat
  handleChat,
  // Knowledge
  loadKnowledge, listKnowledge,
  // Re-exports for convenience (so other files don't need separate imports)
  health, tasks, wsTools, agentCatalog, projectArchive, modelRouter, worklog,
  // Paths
  MA_ROOT, CONFIG_PATH, LEGACY_GLOBAL_CONFIG_PATH, ENTITY_DIR, WORKSPACE_DIR, KNOWLEDGE_DIR
};
