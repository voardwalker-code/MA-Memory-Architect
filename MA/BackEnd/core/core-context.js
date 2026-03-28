// ── Core Context ─────────────────────────────────────────────────────────────
//
// This module gathers all the background information MA needs before
// talking to the AI, and then assembles it into a system prompt.
//
// HOW IT WORKS:
// Before MA sends your question to the AI, it first collects "context" —
// relevant memories, referenced files, knowledge docs, workspace info,
// active skills, and more.  All of that gets bundled into a big system
// prompt that tells the AI who it is, what tools it has, and what it
// knows about your projects.
//
// Think of it like a teacher preparing a lesson — they gather their notes,
// check the textbook, look at the student's past work, and THEN start
// teaching.  This module is the "gathering notes" step.
//
// WHAT IT EXPORTS:
//   gatherContext(opts)      — Collect all relevant context for a chat message
//   buildSystemPrompt(opts)  — Build the full system prompt from context
//
// USED BY: core-chat.js (calls these before each LLM interaction)
// ─────────────────────────────────────────────────────────────────────────────
'use strict';

const fs   = require('fs');
const path = require('path');

// ─────────────────────────────────────────────────────────────────────────────
// gatherContext(opts)
//
// Scans for ALL relevant context before a chat message goes to the AI.
// This includes:
//   1. Files mentioned in the user's message (auto-detected file paths)
//   2. Dragged/attached files and images
//   3. Relevant memories from MA's memory store
//   4. Knowledge documents that match the topic
//   5. Workspace projects (folders with PROJECT-MANIFEST.json)
//   6. Project archive entries (active and closed projects)
//   7. Active skills that match the message topic
//   8. Session worklog (what MA has been working on recently)
//
// Returns an object with all these context strings ready to inject.
//
//   opts.message         — the user's chat message
//   opts.attachments     — array of attached files [{name, content, type}]
//   opts.config          — current LLM config (for memory settings)
//   opts.memory          — the memory store instance (or null)
//   opts.skills          — array of loaded skills [{name, content}]
//   opts.workspacePath   — absolute path to the workspace folder
//   opts.knowledgeDir    — absolute path to the knowledge folder
//   opts.projectArchive  — the project-archive module
//   opts.worklog         — the worklog module
//   opts.listKnowledgeFn — function to list knowledge docs
//   opts.loadKnowledgeFn — function to load a knowledge doc by name
//   opts.onActivity      — callback for activity events (optional)
//
//   Returns: {
//     fileCtx, attachCtx, imageAttachments, memCtx, knowledgeCtx,
//     workspaceCtx, archiveCtx, skillsCtx, worklogCtx
//   }
// ─────────────────────────────────────────────────────────────────────────────
async function gatherContext(opts) {
  const {
    message, attachments = [], config, memory, skills = [],
    workspacePath, projectArchive, worklog,
    listKnowledgeFn, loadKnowledgeFn, onActivity
  } = opts;

  // Start with empty context — we'll fill in what we find
  const result = {
    fileCtx: '',
    attachCtx: '',
    imageAttachments: [],
    memCtx: '',
    knowledgeCtx: '',
    workspaceCtx: '',
    archiveCtx: '',
    skillsCtx: '',
    worklogCtx: ''
  };

  // ── 1. File path detection ──────────────────────────────────────────
  // Scan the user's message for things that look like file paths.
  // If we find files that exist in the workspace, read them and include
  // their contents so the AI can see what the user is talking about.
  try {
    // Match paths like "src/components/App.js" or "config/settings.json"
    const pathPatterns = /(?:^|\s|["'`(])(\/?(?:[\w.-]+\/)+[\w.-]+\.\w{1,10})(?=[\s"'`),;:?!]|$)/gm;
    const detected = new Set();
    let pm;
    while ((pm = pathPatterns.exec(message))) {
      const raw = pm[1].replace(/^\//, '');
      if (raw.length > 2 && raw.includes('/')) detected.add(raw);
    }
    // Also check for bare filenames like "package.json" at workspace root
    const bareFile = /(?:^|\s)([\w.-]+\.\w{1,10})(?=[\s,;:]|$)/g;
    while ((pm = bareFile.exec(message))) {
      const name = pm[1];
      if (name.includes('.') && fs.existsSync(path.join(workspacePath, name))) {
        detected.add(name);
      }
    }
    const fileContents = [];
    for (const rel of detected) {
      try {
        const abs = path.resolve(workspacePath, rel);
        // Safety check: don't read files outside the workspace
        if (!abs.startsWith(path.resolve(workspacePath))) continue;
        if (!fs.existsSync(abs) || !fs.statSync(abs).isFile()) continue;
        const size = fs.statSync(abs).size;
        if (size > 32768) {
          fileContents.push(`[File: ${rel}] (${(size/1024).toFixed(1)}KB — too large, showing first 32KB)\n${fs.readFileSync(abs, 'utf8').slice(0, 32768)}`);
        } else {
          fileContents.push(`[File: ${rel}]\n${fs.readFileSync(abs, 'utf8')}`);
        }
      } catch { /* skip unreadable files */ }
    }
    if (fileContents.length) {
      result.fileCtx = '\n[Referenced Files]\n' + fileContents.join('\n\n');
    }
  } catch { /* ignore detection errors */ }

  // ── 2. Attachments ──────────────────────────────────────────────────
  // The user can drag files or images into the chat.  We separate them
  // into text attachments (code, docs) and image attachments (pictures).
  if (Array.isArray(attachments) && attachments.length > 0) {
    const textParts = [];
    for (const a of attachments.slice(0, 5)) {
      const name = typeof a.name === 'string' ? a.name : 'file';
      if (a.type === 'image' && typeof a.content === 'string') {
        result.imageAttachments.push({ name, dataUrl: a.content, mime: a.mime || 'image/png' });
      } else {
        const content = typeof a.content === 'string' ? a.content.slice(0, 131072) : '';
        textParts.push(`[Attached: ${name}]\n${content}`);
      }
    }
    if (textParts.length) result.attachCtx = '\n[User Attachments]\n' + textParts.join('\n\n');
    if (result.imageAttachments.length) {
      result.attachCtx += `\n[Images Attached: ${result.imageAttachments.map(i => i.name).join(', ')}]`;
    }
  }

  // ── 3. Memory recall ────────────────────────────────────────────────
  // Search MA's memories for anything relevant to this message.
  // Like looking through a notebook for related notes before answering.
  const memLimit = (config && config.memoryLimit > 0) ? config.memoryLimit : 6;
  const memRecall = config ? config.memoryRecall !== false : true;
  const memResults = (memRecall && memory) ? memory.searchWithArchives(message, memLimit) : [];
  if (memResults.length) {
    result.memCtx = '\n[Relevant Memories]\n' + memResults.map(m =>
      `- ${(m.summary || m.content || '').slice(0, 200)}`
    ).join('\n');
    if (onActivity) await onActivity('memory_search', `Found ${memResults.length} relevant memories`);
  }

  // ── 4. Knowledge documents ──────────────────────────────────────────
  // Check if any knowledge docs match the topic (keyword matching).
  // These are reference documents like architecture guides.
  const knowledgeDocs = listKnowledgeFn();
  if (knowledgeDocs.length > 0) {
    const msgLow = message.toLowerCase();
    const relevant = knowledgeDocs.filter(d => {
      const stem = d.replace('.md', '').replace(/-/g, ' ').toLowerCase();
      return stem.split(' ').some(w => w.length >= 4 && msgLow.includes(w));
    });
    if (relevant.length > 0) {
      const loaded = relevant.slice(0, 2).map(d => {
        const content = loadKnowledgeFn(d);
        return content ? `[Knowledge: ${d}]\n${content.slice(0, 3000)}` : '';
      }).filter(Boolean);
      if (loaded.length) {
        result.knowledgeCtx = '\n' + loaded.join('\n\n');
        if (onActivity) await onActivity('knowledge_load', `Loaded ${loaded.length} knowledge doc(s)`);
      }
    }
  }

  // ── 5. Workspace projects ──────────────────────────────────────────
  // Scan the workspace folder for project directories.
  // If a project has a PROJECT-MANIFEST.json, read its status.
  try {
    if (fs.existsSync(workspacePath)) {
      const entries = fs.readdirSync(workspacePath).filter(f => {
        const full = path.join(workspacePath, f);
        return fs.statSync(full).isDirectory();
      });
      if (entries.length > 0) {
        const projectLines = [];
        for (const dir of entries) {
          const manifestPath = path.join(workspacePath, dir, 'PROJECT-MANIFEST.json');
          if (fs.existsSync(manifestPath)) {
            try {
              const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
              const layers = manifest.layers || manifest.parts || {};
              const layerCount = Object.keys(layers).length;
              const statuses = Object.values(layers).map(l => l.status);
              const done = statuses.filter(s => s === 'complete' || s === 'done').length;
              projectLines.push(`- ${dir}/ — ${manifest.description || manifest.project || dir} (${done}/${layerCount} layers complete)`);
            } catch { projectLines.push(`- ${dir}/`); }
          } else {
            projectLines.push(`- ${dir}/`);
          }
        }
        result.workspaceCtx = '\n[Workspace Projects — YOUR active projects]\n' + projectLines.join('\n');
        result.workspaceCtx += '\nYou built these projects. When the user asks to continue or start one, read its PROJECT-MANIFEST.json and BUILD-ORDER.md for full context.';
        if (onActivity) await onActivity('workspace_scan', `Found ${entries.length} workspace project(s)`);
      }
    }
  } catch { /* ignore scan errors */ }

  // ── 6. Project archives ─────────────────────────────────────────────
  // List active and closed project archive entries.
  try {
    const projects = projectArchive.listProjects();
    if (projects.length > 0) {
      result.archiveCtx = '\n[Project Archives]\n' + projects.map(p =>
        `- ${p.id} (${p.status}) — ${p.name}${p.nodeCount ? `, ${p.nodeCount} nodes` : ''}`
      ).join('\n');
    }
  } catch { /* ignore */ }

  // ── 7. Skills ───────────────────────────────────────────────────────
  // Find skills whose name matches words in the message.
  // Skills teach MA specialised abilities (like app building, coding, etc.)
  if (skills.length > 0) {
    const msgLow = message.toLowerCase();
    const relevant = skills.filter(s => {
      const words = s.name.replace(/-/g, ' ').split(' ');
      return words.some(w => w.length >= 3 && msgLow.includes(w));
    });
    const toLoad = relevant.length > 0 ? relevant.slice(0, 2) : [];
    if (toLoad.length) {
      result.skillsCtx = '\n[Active Skills]\n' + toLoad.map(s => s.content.slice(0, 1500)).join('\n\n');
    }
  }

  // ── 8. Worklog ──────────────────────────────────────────────────────
  // Load the session worklog so the AI knows what it's been working on.
  const wlSummary = worklog.getSummaryForPrompt();
  if (wlSummary) {
    result.worklogCtx = '\n[Session Worklog — your work history]\n' + wlSummary;
    if (onActivity) await onActivity('worklog', 'Loaded session worklog');
  }

  return result;
}

// ─────────────────────────────────────────────────────────────────────────────
// buildSystemPrompt(opts)
//
// Assembles the full system prompt that tells the AI who it is, what tools
// it has, what mode it's in, and all the gathered context.
//
// The system prompt is like a set of instructions you give someone before
// they start a job: "Here's your name, here's what you can do, here's
// what you know, and here are the rules."
//
//   opts.entityName      — the AI's name (usually "MA")
//   opts.isChatMode      — true if in read-only chat mode
//   opts.context         — the object returned by gatherContext()
//   opts.config          — current LLM config
//   opts.integrationMode — 'nekocore' or 'off'
//
//   Returns: { sysPrompt, responseReserve, contextBudget }
// ─────────────────────────────────────────────────────────────────────────────
function buildSystemPrompt(opts) {
  const { entityName, isChatMode, context, config, integrationMode } = opts;
  const { skillsCtx, memCtx, knowledgeCtx, workspaceCtx, archiveCtx, fileCtx, attachCtx, worklogCtx } = context;

  const maxTokens = config.maxTokens || 12288;
  // Reserve some tokens for the AI's response (20% of max)
  const responseReserve = Math.floor(maxTokens * 0.20);
  // How much space we have for context (system prompt + history + message)
  const contextWindow   = config.contextWindow || maxTokens;
  const contextBudget   = Math.min(contextWindow, maxTokens * 4) - responseReserve;

  let sysPrompt = `You are ${entityName}, a minimal Memory Architect. You help with memory storage, research, coding, and self-repair.
${isChatMode ? `
[MODE: Chat Mode]
You are in Chat Mode. You may read files, search the web, follow links, and search your memories.
You CANNOT create, write, edit, or delete files, run commands, or execute research/writing tasks.
Available tools: ws_list, ws_read, web_search, web_fetch, memory_search
If the user asks you to do something that requires file creation, editing, deletion, running commands, or task execution, politely tell them: "I'm currently in Chat Mode — I can read and search, but I can't make changes or run tasks. Please switch to Work Mode to do that!"
Do NOT attempt to use ws_write, ws_append, ws_delete, ws_mkdir, ws_move, or cmd_run.

[Available Tools]
ws_list, ws_read, web_search, web_fetch, memory_search` : `
[Available Tools]
ws_list, ws_read, ws_write, ws_append, ws_delete, ws_mkdir, ws_move, web_search, web_fetch, cmd_run, memory_search`}

[Tool Syntax — STRICT]
Tools use JSON parameters. Two formats:

INLINE (for simple tools):
[TOOL:tool_name {"param":"value"}]

BLOCK (for ws_write and ws_append — file content goes between tags):
[TOOL:ws_write {"path":"file.js"}]
file content here
[/TOOL]

Examples:
[TOOL:ws_list {"path":"myproject"}]
[TOOL:ws_read {"path":"myproject/package.json"}]
${isChatMode ? '' : `[TOOL:ws_write {"path":"myproject/hello.txt"}]
Hello world content here
[/TOOL]
[TOOL:ws_delete {"path":"old-file.js"}]
[TOOL:ws_move {"src":"old.js","dst":"new.js"}]
[TOOL:cmd_run {"cmd":"npm test"}]
`}[TOOL:web_search {"query":"node.js streams"}]
[TOOL:memory_search {"query":"previous conversation about APIs"}]

RULES:
- Parameters MUST be valid JSON: {"key":"value"}
- File content goes AFTER the opening tag, closed with [/TOOL]
- Do NOT put file content inside the JSON — use the block format
- Do NOT wrap tool calls in code fences, quotes, or backticks
- One tool per block. Do NOT nest tool calls.
${isChatMode ? '' : `
[Code Output — MANDATORY]
ALWAYS write code to workspace files using [TOOL:ws_write]. NEVER paste raw code blocks into the chat.
If the user asks you to write, create, build, or implement code — use ws_write to put it in a file.
The user sees your chat response — keep it conversational (what you're doing, what you built). The actual code goes in files.

[Writing Large Files]
Your response has a token limit. When writing files that might be large (>80 lines):
1. Use [TOOL:ws_write {"path":"file"}] with [/TOOL] for the FIRST chunk
2. Use [TOOL:ws_append {"path":"file"}] with [/TOOL] for EACH additional chunk
3. Tell the user "I'll write this in parts" so they know to wait
4. After writing all parts, verify with [TOOL:ws_read {"path":"file"}]
Never try to output an entire large file in one response — split it across multiple tool calls.

[Script Review — MANDATORY]
After you finish writing or editing ANY script/code file:
1. ALWAYS read it back with [TOOL:ws_read {"path":"file"}] to verify it's complete
2. Check for: missing closing brackets, incomplete functions, truncated content, syntax errors
3. If the file is incomplete or has errors, continue writing the missing parts using [TOOL:ws_append {"path":"file"}] with [/TOOL] then verify again
4. Only tell the user you're done AFTER you've verified the file is complete
`}
[Token Budget Awareness]
Your max response is ~${responseReserve} tokens (~${responseReserve * 4} chars). Context budget: ~${contextBudget} tokens.
If you are writing a long response or large file and feel you are getting close to your limit:
1. STOP at a logical breakpoint (end of a function, end of a section)
2. Output this marker on its own line: [CONTINUE_FROM: <brief description of where you stopped>]
3. Tell the user what was completed and what remains
The user can then say "continue" and you will resume from that point.
Do NOT try to rush or compress your output to fit — it's better to stop cleanly and continue.

[Integration Mode]
Current integration mode: ${integrationMode}.
If integration mode is off, requests that depend on NekoCore OS endpoints (localhost:3847) are optional and may be unavailable. Prefer local MA entity/workspace tools.${skillsCtx}${memCtx}${knowledgeCtx}${workspaceCtx}${archiveCtx}${fileCtx}${attachCtx}`;

  // Append worklog context if available
  if (worklogCtx) sysPrompt += worklogCtx;

  return { sysPrompt, responseReserve, contextBudget };
}

module.exports = { gatherContext, buildSystemPrompt };
