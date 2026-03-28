// ── Tool Schemas ─────────────────────────────────────────────────────────────
//
// Zod validation schemas for every tool MA can use.
//
// HOW IT WORKS:
// When the AI tries to use a tool (like reading a file or searching the web),
// it sends parameters as JSON.  Before we actually DO anything, we check
// those parameters with Zod — a validation library.  This makes sure the
// AI sent the right kind of data (correct types, required fields present).
//
// Think of it like a bouncer at a door — before you get in, you need to
// show the right credentials.  Zod is the bouncer for tool parameters.
//
// WHAT IT EXPORTS:
//   ToolSchemas — an object where each key is a tool name and each value
//                 is a Zod schema that validates that tool's parameters
//
// TOOL CATEGORIES:
//   ws_*             — Workspace file tools (list, read, write, delete, etc.)
//   web_*            — Web tools (search, fetch)
//   cmd_run          — Run a whitelisted terminal command
//   memory_search    — Search MA's memories
//   entity_*         — Create/manage AI entities
//   book_*           — Read chunked books (from book ingestion)
//
// USED BY:
//   tools-parser.js  — validates parsed tool calls against these schemas
//   MA-tool-adapter.js — converts these into native function-call schemas
// ─────────────────────────────────────────────────────────────────────────────
'use strict';

const { z } = require('zod');

// ─────────────────────────────────────────────────────────────────────────────
// Each schema defines what parameters a tool expects.
//
// For example, ws_read needs a "path" (a string) — nothing else.
// entity_create needs a "name" (required) plus optional fields like
// "traits" (array of strings) and "gender" (defaults to "neutral").
//
// The .default() calls set fallback values when the AI doesn't provide them.
// The .optional() calls mean the field can be left out entirely.
// ─────────────────────────────────────────────────────────────────────────────
const ToolSchemas = {
  // ── Workspace file tools ──────────────────────────────────────────
  ws_list:    z.object({ path: z.string().default('.') }),
  ws_read:    z.object({ path: z.string() }),
  ws_write:   z.object({ path: z.string(), content: z.string().optional() }),
  ws_append:  z.object({ path: z.string(), content: z.string().optional() }),
  ws_delete:  z.object({ path: z.string() }),
  ws_mkdir:   z.object({ path: z.string() }),
  ws_move:    z.object({ src: z.string(), dst: z.string() }),

  // ── Web tools ─────────────────────────────────────────────────────
  web_search:     z.object({ query: z.string() }),
  web_fetch:      z.object({ url: z.string() }),

  // ── Command tool ──────────────────────────────────────────────────
  cmd_run:        z.object({ cmd: z.string() }),

  // ── Memory tool ───────────────────────────────────────────────────
  memory_search:  z.object({
    query: z.string(),
    limit: z.number().int().min(1).max(50).default(5)
  }),

  // ── Entity tools (create AI characters, inject their memories) ────
  entity_create:  z.object({
    name: z.string(),
    gender: z.string().default('neutral'),
    traits: z.array(z.string()).default([]),
    introduction: z.string().default(''),
    source: z.string().optional(),
    personality_summary: z.string().optional(),
    speech_style: z.string().optional(),
    beliefs: z.array(z.string()).optional(),
    behavior_rules: z.array(z.string()).optional(),
  }),

  entity_inject_memory: z.object({
    entityId: z.string(),
    content: z.string(),
    type: z.string().default('episodic'),
    emotion: z.string().default('neutral'),
    topics: z.array(z.string()).default([]),
    importance: z.number().min(0).max(1).default(0.5),
    narrative: z.string().optional(),
    phase: z.string().default('book_ingestion'),
  }),

  // ── Book chunk tools (for reading ingested books) ─────────────────
  book_list_chunks: z.object({ bookId: z.string() }),
  book_read_chunk:  z.object({ bookId: z.string(), index: z.number().int().min(0) }),
};

module.exports = { ToolSchemas };
