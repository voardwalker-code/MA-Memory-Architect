// ── Core Bootstrap ───────────────────────────────────────────────────────────
//
// This module handles starting up all the pieces MA needs before it can
// do anything useful.
//
// HOW IT WORKS:
// When MA first turns on, it needs to:
//   1. Make sure certain folders exist (so it has somewhere to put files)
//   2. Create the AI entity if it's missing (the entity is MA's "identity")
//   3. Load the entity's personality from disk
//   4. Load skill files (instructions that teach MA special abilities)
//   5. Make sure the default agents exist (agents do specific jobs for MA)
//   6. Start the memory system (so MA can remember things)
//   7. Load knowledge documents (reference docs MA can read)
//
// Think of it like getting ready for school — you need your backpack,
// your books, your lunch, and your homework before you can go!
//
// WHAT IT EXPORTS:
//   ensureDirs(dirs)                       — Create folders if they're missing
//   ensureEntity(entityDir, defaults)      — Create entity.json if missing
//   loadEntity(entityDir)                  — Read entity.json from disk
//   loadSkills(entityDir, maSkillsDir)     — Load all skill markdown files
//   ensureAgents(agentCatalog, defaults)   — Create missing default agents
//   initMemory(createMemoryStore)          — Start up the memory system
//   loadKnowledge(knowledgeDir, name)      — Read one knowledge doc by name
//   listKnowledge(knowledgeDir)            — List all available knowledge docs
//
// USED BY: MA-core.js (calls these functions during the boot() sequence)
// ─────────────────────────────────────────────────────────────────────────────
'use strict';

const fs   = require('fs');
const path = require('path');

// ─────────────────────────────────────────────────────────────────────────────
// ensureDirs(dirs)
//
// Takes a list of folder paths and creates any that don't exist yet.
// Uses { recursive: true } so it creates parent folders too.
//
// Example: if you pass ['MA-workspace', 'MA-entity/memories/episodic']
// it will create all those folders (and any parents) if needed.
//
//   dirs — an array of absolute folder paths
// ─────────────────────────────────────────────────────────────────────────────
function ensureDirs(dirs) {
  for (const d of dirs) {
    if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// ensureEntity(entityDir, defaults)
//
// Checks if the entity.json file exists.  If it doesn't, creates one
// using the default entity template.  Also creates the skills folder.
//
// The entity is like MA's "ID card" — it stores the name, personality,
// and other identity info.  Without it, MA doesn't know who it is!
//
//   entityDir — path to the entity folder (e.g. MA-entity/entity_ma)
//   defaults  — the DEFAULT_ENTITY object from agent-definitions.js
// ─────────────────────────────────────────────────────────────────────────────
function ensureEntity(entityDir, defaults) {
  const p = path.join(entityDir, 'entity.json');
  if (fs.existsSync(p)) return;
  console.log('  Entity missing — provisioning default MA entity...');
  fs.mkdirSync(entityDir, { recursive: true });
  const entityDef = { ...defaults, createdAt: new Date().toISOString() };
  fs.writeFileSync(p, JSON.stringify(entityDef, null, 2));
  // Ensure skills directory exists too
  const skillsDir = path.join(entityDir, 'skills');
  if (!fs.existsSync(skillsDir)) fs.mkdirSync(skillsDir, { recursive: true });
  console.log('  Entity provisioned: MA');
}

// ─────────────────────────────────────────────────────────────────────────────
// loadEntity(entityDir)
//
// Reads the entity.json file and returns its contents as an object.
// Returns null if the file doesn't exist or can't be read.
//
//   entityDir — path to the entity folder
//   Returns: the parsed entity object, or null
// ─────────────────────────────────────────────────────────────────────────────
function loadEntity(entityDir) {
  const p = path.join(entityDir, 'entity.json');
  try {
    if (fs.existsSync(p)) {
      const entity = JSON.parse(fs.readFileSync(p, 'utf8'));
      console.log(`  Entity loaded: ${entity.name || 'MA'}`);
      return entity;
    }
  } catch (e) { console.warn('  Entity load failed:', e.message); }
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// loadSkills(entityDir, maSkillsDir)
//
// Skills are markdown files that teach MA how to do special things —
// like building apps, writing code, or running searches.
//
// This function loads skills from TWO places:
//   1. Entity-level skills:  MA-entity/entity_ma/skills/*.md
//      (these are runtime refs — they take priority)
//   2. Drop-in skills:  MA-skills/{name}/SKILL.md
//      (these are user-added — loaded if not already covered by #1)
//
//   entityDir   — path to entity folder (e.g. MA-entity/entity_ma)
//   maSkillsDir — path to MA-skills folder
//   Returns: array of { name, content } objects
// ─────────────────────────────────────────────────────────────────────────────
function loadSkills(entityDir, maSkillsDir) {
  const skillsDir = path.join(entityDir, 'skills');
  const skills = [];
  const loaded = new Set();

  // 1. Entity-level skills (take priority)
  try {
    if (fs.existsSync(skillsDir)) {
      const files = fs.readdirSync(skillsDir).filter(f => f.endsWith('.md'));
      for (const f of files) {
        const content = fs.readFileSync(path.join(skillsDir, f), 'utf8');
        const name = f.replace(/\.md$/, '');
        skills.push({ name, content });
        loaded.add(name);
      }
    }
  } catch (e) { console.warn('  Skills load (entity) failed:', e.message); }

  // 2. Drop-in skills from MA-skills/ (user-added)
  try {
    if (fs.existsSync(maSkillsDir)) {
      const dirs = fs.readdirSync(maSkillsDir).filter(d => {
        return fs.statSync(path.join(maSkillsDir, d)).isDirectory();
      });
      for (const dir of dirs) {
        if (loaded.has(dir)) continue; // entity runtime ref takes precedence
        let skillMd = path.join(maSkillsDir, dir, 'SKILL.md');
        if (!fs.existsSync(skillMd)) skillMd = path.join(maSkillsDir, dir, 'skill.md');
        if (!fs.existsSync(skillMd)) continue;
        const content = fs.readFileSync(skillMd, 'utf8');
        skills.push({ name: dir, content });
        loaded.add(dir);
      }
    }
  } catch (e) { console.warn('  Skills load (MA-skills) failed:', e.message); }

  if (skills.length) console.log(`  Skills loaded: ${skills.length} (${skills.map(s => s.name).join(', ')})`);
  return skills;
}

// ─────────────────────────────────────────────────────────────────────────────
// ensureAgents(agentCatalog, defaults)
//
// Agents are specialised workers that MA can delegate tasks to.
// This checks the agent catalog and creates any default agents that
// are missing.  Existing agents are left alone.
//
//   agentCatalog — the MA-agents module (has listAgents, createAgent)
//   defaults     — the DEFAULT_AGENTS array from agent-definitions.js
// ─────────────────────────────────────────────────────────────────────────────
function ensureAgents(agentCatalog, defaults) {
  const existing = agentCatalog.listAgents();
  const existingIds = new Set(existing.map(a => a.id));
  let created = 0;
  for (const def of defaults) {
    if (existingIds.has(def.id)) continue;
    const result = agentCatalog.createAgent(def);
    if (result.ok) {
      console.log(`  Agent provisioned: ${def.name} (${def.id})`);
      created++;
    }
  }
  if (created) {
    console.log(`  ${created} agent(s) auto-provisioned`);
  } else {
    console.log(`  Agents OK: ${existing.length} in catalog`);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// initMemory(createMemoryStore)
//
// Starts the memory system.  Memory lets MA remember past conversations,
// decisions, and facts — kind of like a notebook it can search through.
//
//   createMemoryStore — the factory function from MA-memory.js
//   Returns: the memory store instance
// ─────────────────────────────────────────────────────────────────────────────
function initMemory(createMemoryStore) {
  const memory = createMemoryStore('ma');
  console.log('  Memory store ready');
  return memory;
}

// ─────────────────────────────────────────────────────────────────────────────
// loadKnowledge(knowledgeDir, name)
//
// Loads a single knowledge document by name.  Knowledge docs are markdown
// files in the MA-knowledge/ folder that contain reference material —
// things like architecture patterns, code quality guides, etc.
//
//   knowledgeDir — path to the MA-knowledge folder
//   name         — document name (with or without .md extension)
//   Returns: the file content as a string, or null if not found
// ─────────────────────────────────────────────────────────────────────────────
function loadKnowledge(knowledgeDir, name) {
  const p = path.join(knowledgeDir, name.endsWith('.md') ? name : name + '.md');
  if (fs.existsSync(p)) return fs.readFileSync(p, 'utf8');
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// listKnowledge(knowledgeDir)
//
// Lists all available knowledge documents (just the filenames).
//
//   knowledgeDir — path to the MA-knowledge folder
//   Returns: array of filenames like ['architecture-patterns.md', ...]
// ─────────────────────────────────────────────────────────────────────────────
function listKnowledge(knowledgeDir) {
  if (!fs.existsSync(knowledgeDir)) return [];
  return fs.readdirSync(knowledgeDir).filter(f => f.endsWith('.md'));
}

module.exports = {
  ensureDirs, ensureEntity, loadEntity, loadSkills, ensureAgents,
  initMemory, loadKnowledge, listKnowledge
};
