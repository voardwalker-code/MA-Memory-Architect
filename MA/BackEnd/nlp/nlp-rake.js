// ── NLP · RAKE Keyphrase Extraction ──────────────────────────────────────────
//
// HOW KEYPHRASE EXTRACTION WORKS:
// When you read a paragraph, your brain picks out the important phrases
// — things like "machine learning" or "project planning".  RAKE does
// the same thing automatically using a simple trick:
//
//   1. Split the text at "stop words" (boring words like "the", "and", "is")
//   2. The chunks left over are candidate keyphrases
//   3. Score each phrase by how many interesting words it contains
//      and how often those words appear together
//   4. Return the top-scoring phrases
//
// RAKE stands for "Rapid Automatic Keyword Extraction" — it's fast
// because it doesn't need a dictionary or AI model, just a list of
// stop words and some math.
//
// WHY MULTI-WORD PHRASES MATTER:
// Single words like "memory" are vague.  But "semantic memory search"
// is precise.  RAKE finds these multi-word phrases so the memory system
// can index and retrieve knowledge accurately.
//
// WHAT USES THIS:
//   svc-memory.js          — extracts topics when storing memories
//   svc-project-archive.js — extracts topics for project nodes
//
// EXPORTS:
//   extractPhrases(text, maxPhrases?)  → string[]
//   buildCandidatePhrases(text)        → string[][]
//   computeWordScores(candidates)      → {word: score}
//   scorePhrases(candidates, scores)   → [{phrase, score}]
// ─────────────────────────────────────────────────────────────────────────────
'use strict';

const STOPWORDS = new Set([
  'a', 'about', 'above', 'after', 'again', 'against', 'all', 'am', 'an', 'and',
  'any', 'are', 'as', 'at', 'be', 'because', 'been', 'before', 'being', 'below',
  'between', 'both', 'but', 'by', 'can', 'could', 'did', 'do', 'does', 'doing',
  'down', 'during', 'each', 'few', 'for', 'from', 'further', 'get', 'got', 'had',
  'has', 'have', 'having', 'he', 'her', 'here', 'hers', 'herself', 'him',
  'himself', 'his', 'how', 'i', 'if', 'in', 'into', 'is', 'it', 'its', 'itself',
  'just', 'like', 'me', 'more', 'most', 'my', 'myself', 'no', 'not', 'now', 'of',
  'off', 'on', 'once', 'only', 'or', 'other', 'our', 'out', 'over', 'own', 's',
  'same', 'she', 'should', 'so', 'some', 'such', 't', 'than', 'that', 'the',
  'their', 'theirs', 'them', 'themselves', 'then', 'there', 'these', 'they',
  'this', 'those', 'through', 'to', 'too', 'under', 'until', 'up', 'us', 'very',
  'was', 'we', 'were', 'what', 'when', 'where', 'which', 'while', 'who', 'whom',
  'why', 'will', 'with', 'would', 'you', 'your', 'yours', 'yourself',
  'also', 'about', 'into', 'than', 'then', 'them', 'they', 'been',
]);

const PHRASE_DELIMITERS = /[.!?,;:()\[\]{}"'\n\t]+/;

function buildCandidatePhrases(text) {
  const sentenceChunks = text.toLowerCase().split(PHRASE_DELIMITERS);
  const candidates = [];

  for (const chunk of sentenceChunks) {
    const words = chunk.trim().split(/\s+/).filter(w => w.length > 0);
    if (words.length === 0) continue;

    let currentPhrase = [];
    for (const word of words) {
      const clean = word.replace(/[^a-z0-9]/g, '');
      if (!clean || clean.length < 2) {
        if (currentPhrase.length > 0) { candidates.push(currentPhrase); currentPhrase = []; }
        continue;
      }
      if (STOPWORDS.has(clean)) {
        if (currentPhrase.length > 0) { candidates.push(currentPhrase); currentPhrase = []; }
      } else {
        currentPhrase.push(clean);
      }
    }
    if (currentPhrase.length > 0) candidates.push(currentPhrase);
  }

  return candidates.filter(p => p.length >= 1 && p.length <= 4 && p.every(w => w.length >= 3));
}

function computeWordScores(candidates) {
  const freq = {}, degree = {};
  for (const phrase of candidates) {
    for (const word of phrase) {
      freq[word] = (freq[word] || 0) + 1;
      degree[word] = (degree[word] || 0) + phrase.length;
    }
  }
  const scores = {};
  for (const word of Object.keys(freq)) scores[word] = degree[word] / freq[word];
  return scores;
}

function scorePhrases(candidates, wordScores) {
  const seen = new Set(), results = [];
  for (const phrase of candidates) {
    const phraseStr = phrase.join(' ');
    if (seen.has(phraseStr)) continue;
    seen.add(phraseStr);
    let score = 0;
    for (const word of phrase) score += wordScores[word] || 0;
    results.push({ phrase: phraseStr, score });
  }
  return results.sort((a, b) => b.score - a.score);
}

/**
 * Extract ranked keyphrases from text using RAKE.
 * @param {string} text
 * @param {number} [maxPhrases=12]
 * @returns {string[]}
 */
function extractPhrases(text, maxPhrases = 12) {
  if (!text || typeof text !== 'string' || text.trim().length === 0) return [];

  const candidates = buildCandidatePhrases(text);
  if (candidates.length < 2) {
    return text.toLowerCase().split(/[^a-z0-9]+/).filter(w => w.length >= 4 && !STOPWORDS.has(w)).slice(0, maxPhrases);
  }

  const wordScores = computeWordScores(candidates);
  const ranked = scorePhrases(candidates, wordScores);
  return ranked.slice(0, maxPhrases).map(r => r.phrase);
}

module.exports = { extractPhrases, buildCandidatePhrases, computeWordScores, scorePhrases };
