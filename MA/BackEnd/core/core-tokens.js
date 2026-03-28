// ── Core Tokens ──────────────────────────────────────────────────────────────
//
// Token estimation and history compression utilities.
//
// HOW IT WORKS:
// AI models have a limited "context window" — they can only read so much
// text at once.  We measure text size in "tokens" (roughly 1 token = 4
// characters of English text).
//
// When a conversation gets too long, we need to compress the older messages
// so they fit.  This module handles both the measuring and the compressing.
//
// WHAT IT EXPORTS:
//   stripThinkingTags(text)                     — Remove <thinking> blocks
//   estimateTokens(text)                        — Guess how many tokens text uses
//   estimateMessagesTokens(messages)            — Token count for a message array
//   compressHistory(hist, max, callLLM, config) — Shrink old messages to fit
//
// USED BY: core-chat.js (to manage context window budget)
// ─────────────────────────────────────────────────────────────────────────────
'use strict';

// ─────────────────────────────────────────────────────────────────────────────
// stripThinkingTags(text)
//
// Some AI models wrap their reasoning in <thinking>...</thinking> tags.
// We don't want the user to see those, so this strips them out.
//
//   text — the raw LLM response string
//   Returns: the text with thinking blocks removed
// ─────────────────────────────────────────────────────────────────────────────
function stripThinkingTags(text) {
  if (!text) return text;
  return text.replace(/<thinking>[\s\S]*?<\/thinking>/gi, '').trim();
}

// ─────────────────────────────────────────────────────────────────────────────
// estimateTokens(text)
//
// Quick guess at how many tokens a piece of text uses.
// Rule of thumb: 1 token ≈ 4 characters of English text.
// Not exact, but good enough for budget planning.
//
//   text — any string
//   Returns: estimated token count (number)
// ─────────────────────────────────────────────────────────────────────────────
function estimateTokens(text) {
  if (!text) return 0;
  return Math.ceil(text.length / 4);
}

// ─────────────────────────────────────────────────────────────────────────────
// estimateMessagesTokens(messages)
//
// Counts up the estimated tokens across an array of chat messages.
// Adds 4 tokens per message for overhead (role label, formatting, etc.).
//
//   messages — array of { role, content } objects
//   Returns: total estimated tokens (number)
// ─────────────────────────────────────────────────────────────────────────────
function estimateMessagesTokens(messages) {
  let total = 0;
  for (const m of messages) {
    total += estimateTokens(m.content) + 4; // +4 per message overhead
  }
  return total;
}

// ─────────────────────────────────────────────────────────────────────────────
// compressHistory(hist, maxHistoryTokens, callLLMFn, llmConfig)
//
// When the conversation history is too long to fit in the context window,
// this function compresses it.
//
// HOW THE COMPRESSION WORKS:
//   1. If the history already fits, return it unchanged
//   2. Keep the most recent 6 messages exactly as-is (they're important!)
//   3. For older messages:
//      a. If they're small enough, just paste them as a text summary
//      b. If they're big, ask the AI to summarise them into bullet points
//      c. If the AI call fails, just truncate and keep the last 2 old ones
//
//   hist              — array of { role, content } messages
//   maxHistoryTokens  — the token budget for history
//   callLLMFn         — function to call the AI (for LLM-powered compression)
//   llmConfig         — the config object to pass to callLLMFn
//   Returns: compressed message array (same format as input)
// ─────────────────────────────────────────────────────────────────────────────
async function compressHistory(hist, maxHistoryTokens, callLLMFn, llmConfig) {
  if (!hist.length) return hist;
  const totalTokens = estimateMessagesTokens(hist);
  if (totalTokens <= maxHistoryTokens) return hist;

  // Keep the 6 most recent messages verbatim — they have the freshest context
  const keepRecent = Math.min(6, hist.length);
  const recent = hist.slice(-keepRecent);
  const older  = hist.slice(0, -keepRecent);

  if (!older.length) return recent;

  // Fast path: if older messages are small, just include them as text
  const olderText = older.map(m => `${m.role}: ${(m.content || '').slice(0, 200)}`).join('\n');
  if (estimateTokens(olderText) <= 600) {
    return [
      { role: 'system', content: `[Compressed Earlier Conversation]\n${olderText}` },
      ...recent
    ];
  }

  // Slow path: ask the AI to summarise (for really long histories)
  try {
    const compressPrompt = older.map(m => `${m.role}: ${(m.content || '').slice(0, 300)}`).join('\n');
    const summary = await callLLMFn(llmConfig, [
      { role: 'system', content: 'Summarize this conversation history preserving: key decisions made, files created or modified, current task state, error context and workarounds, the user\'s goals and preferences. Use structured bullet points. Be concise but complete — this summary replaces the original messages.' },
      { role: 'user', content: compressPrompt }
    ], { temperature: 0.3, maxTokens: 768 });
    return [
      { role: 'system', content: `[Compressed Earlier Conversation]\n${summary}` },
      ...recent
    ];
  } catch {
    // Last resort: just truncate older messages and keep the last 2
    const trimmed = older.map(m => ({
      role: m.role,
      content: (m.content || '').slice(0, 100) + '...'
    }));
    return [...trimmed.slice(-2), ...recent];
  }
}

module.exports = { stripThinkingTags, estimateTokens, estimateMessagesTokens, compressHistory };
