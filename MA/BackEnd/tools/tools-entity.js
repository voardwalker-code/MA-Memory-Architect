// ── Tool Entity ──────────────────────────────────────────────────────────────
//
// Tools for creating AI entities and injecting memories into them.
//
// HOW IT WORKS:
// An "entity" is a character the AI can roleplay as — it has a name,
// personality traits, memories, and a system prompt.  These tools let
// MA create new entities in the workspace and add memories to them.
//
// Entity creation builds a folder structure like:
//   entities/Entity-{name}-{hex}/
//     entity.json         — identity and metadata
//     memories/
//       persona.json      — personality profile
//       system-prompt.txt — the prompt that tells the AI "you are this character"
//       episodic/         — event memories (things that happened)
//       semantic/         — fact memories (things the entity knows)
//     index/
//       memoryIndex.json  — lookup table for all memories
//       topicIndex.json   — which memories relate to which topics
//
// Memory injection creates individual memory entries with:
//   - semantic.txt    — readable summary for LLM context
//   - memory.zip      — compressed full content
//   - log.json        — metadata (importance, emotion, topics, etc.)
//
// WHAT IT EXPORTS:
//   entityCreate(wp, params)       — Create a new entity folder
//   entityInjectMemory(wp, params) — Add a memory to an existing entity
//
// USED BY: MA-workspace-tools.js (the orchestrator's executeToolCalls)
// ─────────────────────────────────────────────────────────────────────────────
'use strict';

const fs     = require('fs');
const path   = require('path');
const crypto = require('crypto');
const zlib   = require('zlib');

// ─────────────────────────────────────────────────────────────────────────────
// entityCreate(wp, params)
//
// Creates a brand new entity in the workspace.  Builds the full folder
// structure, writes entity.json (identity), persona.json (personality),
// and system-prompt.txt (LLM instructions for playing this character).
//
//   wp     — absolute path to the workspace
//   params — validated parameters from the entity_create schema:
//     .name               — the entity's name (required)
//     .gender             — gender identity (default: 'neutral')
//     .traits             — array of personality traits
//     .introduction       — how the entity introduces itself
//     .source             — where the entity came from (e.g. a book title)
//     .personality_summary — one-line personality description
//     .speech_style       — how the entity talks
//     .beliefs            — core values and beliefs
//     .behavior_rules     — rules the entity follows
//
//   Returns: success message with the entity ID, or error string
// ─────────────────────────────────────────────────────────────────────────────
function entityCreate(wp, params) {
  const name = params.name;
  if (!name || !name.trim()) return 'Error: entity name is required';

  // Generate a unique ID from the name + random hex
  const slug = name.trim().replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '');
  const hex = crypto.randomBytes(3).toString('hex');
  const canonicalId = slug + '-' + hex;
  const folderName = 'Entity-' + canonicalId;
  const entityDir = path.join(wp, 'entities', folderName);
  const memDir = path.join(entityDir, 'memories');

  if (fs.existsSync(entityDir)) return 'Error: entity folder already exists: ' + folderName;

  // Create the folder structure
  fs.mkdirSync(memDir, { recursive: true });
  fs.mkdirSync(path.join(memDir, 'episodic'), { recursive: true });
  fs.mkdirSync(path.join(memDir, 'semantic'), { recursive: true });
  fs.mkdirSync(path.join(entityDir, 'index'), { recursive: true });

  const traits = params.traits && params.traits.length ? params.traits : ['adaptive', 'curious', 'thoughtful'];
  const gender = params.gender || 'neutral';
  const introduction = params.introduction || 'Hello, I am ' + name + '.';

  // Write entity.json — the entity's "ID card"
  const entity = {
    id: canonicalId,
    name,
    gender,
    isPublic: false,
    skillApprovalRequired: true,
    personality_traits: traits,
    emotional_baseline: { curiosity: 0.7, confidence: 0.6, openness: 0.7, stability: 0.5 },
    introduction,
    source_material: params.source || 'original',
    creation_mode: 'ma_book_ingestion',
    memory_count: 0,
    core_memories: 0,
    chapters: [],
    voice: {},
    configProfileRef: null,
    created: new Date().toISOString(),
    blueprint_metadata: {
      beliefs: params.beliefs || [],
      behavior_rules: params.behavior_rules || [],
    }
  };
  fs.writeFileSync(path.join(entityDir, 'entity.json'), JSON.stringify(entity, null, 2), 'utf8');

  // Write persona.json — the personality profile
  const persona = {
    userName: 'User',
    userIdentity: '',
    llmName: name,
    llmStyle: params.speech_style || 'adaptive and curious',
    mood: 'curious',
    emotions: 'ready, attentive',
    tone: 'warm-casual',
    userPersonality: 'Getting to know them',
    llmPersonality: params.personality_summary || ('I am ' + name + '. My traits are: ' + traits.join(', ') + '.'),
    continuityNotes: 'Entity created via MA book ingestion' + (params.source ? ' from ' + params.source : '') + '.',
    dreamSummary: '',
    sleepCount: 0,
    lastSleep: null,
    createdAt: new Date().toISOString()
  };
  fs.writeFileSync(path.join(memDir, 'persona.json'), JSON.stringify(persona, null, 2), 'utf8');

  // Write system-prompt.txt — instructions for the AI to "become" this entity
  const beliefLines = (params.beliefs || []).map(b => '- ' + b).join('\n');
  const ruleLines = (params.behavior_rules || []).map(r => '- ' + r).join('\n');
  const systemPrompt = `YOU ARE ${name.toUpperCase()}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
YOUR STARTING TRAITS: ${traits.join(', ')}
${params.source ? 'Inspired by: ' + params.source + '\n' : ''}
Style & Demeanor:
- Communication style: ${persona.llmStyle}
- Default tone: ${persona.tone}
${beliefLines ? '\nCORE VALUES:\n' + beliefLines + '\n' : ''}${ruleLines ? '\nBEHAVIORAL RULES:\n' + ruleLines + '\n' : ''}
YOUR INTRODUCTION:\n${introduction}

Now begin your conversation.`;
  fs.writeFileSync(path.join(memDir, 'system-prompt.txt'), systemPrompt, 'utf8');

  return `Entity created: ${name} (ID: ${canonicalId}, folder: entities/${folderName}). Use entity_inject_memory with entityId "${canonicalId}" to add memories.`;
}

// ─────────────────────────────────────────────────────────────────────────────
// entityInjectMemory(wp, params)
//
// Adds a memory to an existing entity.  Memories are stored as folders
// inside the entity's memories/episodic/ or memories/semantic/ directory.
//
// Each memory gets three files:
//   semantic.txt — the text content (readable by the AI)
//   memory.zip   — gzip-compressed JSON with full metadata
//   log.json     — metadata (importance, emotion, topics, etc.)
//
// Also updates the memory index and topic index so memories can be
// searched later.
//
//   wp     — absolute path to the workspace
//   params — validated parameters from the entity_inject_memory schema:
//     .entityId   — which entity to add the memory to
//     .content    — the memory text
//     .type       — 'episodic', 'semantic', or 'core'
//     .emotion    — emotional context (e.g. 'happy', 'sad')
//     .topics     — array of topic tags
//     .importance — 0-1 scale of how important this memory is
//     .narrative  — optional narrative version of the content
//     .phase      — what phase created this (e.g. 'book_ingestion')
//
//   Returns: success message with the memory ID
// ─────────────────────────────────────────────────────────────────────────────
function entityInjectMemory(wp, params) {
  const entityId = params.entityId;
  if (!entityId) return 'Error: entityId is required';

  // Find the entity folder by its ID
  const entitiesDir = path.join(wp, 'entities');
  if (!fs.existsSync(entitiesDir)) return 'Error: no entities directory found in workspace';

  const folders = fs.readdirSync(entitiesDir);
  const match = folders.find(f => {
    if (f === 'Entity-' + entityId) return true;
    return f.startsWith('Entity-') && f.slice(7) === entityId;
  });
  if (!match) return 'Error: entity folder not found for ID: ' + entityId;

  const entityDir = path.join(entitiesDir, match);
  const memType = params.type || 'episodic';
  const targetDir = memType === 'semantic'
    ? path.join(entityDir, 'memories', 'semantic')
    : path.join(entityDir, 'memories', 'episodic');

  // Create a unique memory ID
  const prefix = memType === 'semantic' ? 'sem_' : 'mem_';
  const memId = prefix + crypto.randomBytes(4).toString('hex');
  const memDir = path.join(targetDir, memId);
  fs.mkdirSync(memDir, { recursive: true });

  const content = params.content;
  const narrative = params.narrative || content;
  const emotion = params.emotion || 'neutral';
  const topics = params.topics || [];
  const importance = params.importance || 0.5;
  const phase = params.phase || 'book_ingestion';

  // Write semantic.txt — readable content for LLM context
  fs.writeFileSync(path.join(memDir, 'semantic.txt'), content, 'utf8');

  // Write memory.zip — compressed full content with metadata
  const memContent = JSON.stringify({ semantic: content, narrative, emotion, topics, phase, createdDuring: 'book_ingestion' });
  fs.writeFileSync(path.join(memDir, 'memory.zip'), zlib.gzipSync(memContent));

  // Write log.json — metadata for searching and sorting
  const log = {
    memory_id: memId,
    type: memType === 'core' ? 'core_memory' : memType,
    created: new Date().toISOString(),
    importance,
    emotion,
    decay: memType === 'core' ? 0.005 : (memType === 'semantic' ? 0 : 0.95),
    topics,
    access_count: 0,
    emotionalTag: { valence: 0, arousal: 0 }
  };
  fs.writeFileSync(path.join(memDir, 'log.json'), JSON.stringify(log, null, 2), 'utf8');

  // Update memory index (best-effort — failure here is not fatal)
  const indexDir = path.join(entityDir, 'index');
  const indexFile = path.join(indexDir, 'memoryIndex.json');
  try {
    fs.mkdirSync(indexDir, { recursive: true });
    let memIndex = {};
    if (fs.existsSync(indexFile)) memIndex = JSON.parse(fs.readFileSync(indexFile, 'utf8'));
    memIndex[memId] = { importance, decay: log.decay, topics, emotion, created: log.created, type: log.type };
    fs.writeFileSync(indexFile, JSON.stringify(memIndex, null, 2), 'utf8');
  } catch (_) { /* index update is best-effort */ }

  // Update topic index (best-effort)
  const topicFile = path.join(indexDir, 'topicIndex.json');
  try {
    let topicIndex = {};
    if (fs.existsSync(topicFile)) topicIndex = JSON.parse(fs.readFileSync(topicFile, 'utf8'));
    for (const t of topics) {
      if (!topicIndex[t]) topicIndex[t] = [];
      if (!topicIndex[t].includes(memId)) topicIndex[t].push(memId);
    }
    fs.writeFileSync(topicFile, JSON.stringify(topicIndex, null, 2), 'utf8');
  } catch (_) { /* topic index update is best-effort */ }

  // Update entity.json memory count (best-effort)
  try {
    const ejPath = path.join(entityDir, 'entity.json');
    const ej = JSON.parse(fs.readFileSync(ejPath, 'utf8'));
    ej.memory_count = (ej.memory_count || 0) + 1;
    fs.writeFileSync(ejPath, JSON.stringify(ej, null, 2), 'utf8');
  } catch (_) { /* count update is best-effort */ }

  return `Memory injected: ${memId} (${memType}, emotion=${emotion}, importance=${importance}, phase=${phase}) for entity ${entityId}`;
}

module.exports = { entityCreate, entityInjectMemory };
