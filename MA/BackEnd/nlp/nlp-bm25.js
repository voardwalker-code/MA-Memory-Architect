// ── NLP · BM25 Relevance Scoring ─────────────────────────────────────────────
//
// HOW SEARCH RANKING WORKS:
// Imagine you're looking for a book in a library.  You know the topics
// you care about ("dragons", "magic"), and each book has its own topics.
// BM25 scores how well a book matches your search — higher score means
// better match.
//
// This is the Okapi BM25 algorithm, a proven formula used by real search
// engines.  It accounts for:
//   - How often your search words appear in the document (term frequency)
//   - How long the document is (longer docs get a slight penalty)
//   - A smoothing factor so rare words matter more
//
// TUNING KNOBS:
//   k1 = 1.5   — controls how much extra occurrences of a word matter
//   b  = 0.75  — controls how much document length affects the score
//   avgDL = 8  — assumed average document length (in topics)
//   IDF = ln(2) — simplified inverse-document-frequency (fast, good enough)
//
// WHAT USES THIS:
//   svc-memory.js — ranks memories by relevance when the AI searches
//
// EXPORTS:
//   bm25Score(queryTopics, docTopics, opts?)               → number
//   bm25ScoreWithImportance(queryTopics, docTopics, i, d)  → number
//   K1, B, AVG_DL — the tuning constants (exported for tests)
// ─────────────────────────────────────────────────────────────────────────────
'use strict';

const K1        = 1.5;
const B         = 0.75;
const AVG_DL    = 8;
const IDF_CONST = Math.log(2);

/**
 * BM25 relevance score for topic arrays.
 * @param {string[]} queryTopics
 * @param {string[]} docTopics
 * @param {object}  [opts] - { k1, b, avgDL }
 * @returns {number}
 */
function bm25Score(queryTopics, docTopics, opts = {}) {
  if (!queryTopics?.length || !docTopics?.length) return 0;

  const k1    = opts.k1    ?? K1;
  const b     = opts.b     ?? B;
  const avgDL = opts.avgDL ?? AVG_DL;

  const docFreq = {};
  for (const t of docTopics) docFreq[t] = (docFreq[t] || 0) + 1;

  const docLen     = docTopics.length;
  const normFactor = 1 - b + b * (docLen / avgDL);

  let score = 0;
  for (const qt of queryTopics) {
    const tf = docFreq[qt] || 0;
    if (tf === 0) continue;
    const tfNorm = (tf * (k1 + 1)) / (tf + k1 * normFactor);
    score += IDF_CONST * tfNorm;
  }
  return score;
}

/**
 * BM25 + importance/decay blend.
 * Score = bm25Base × (0.40 + importance×0.35 + decay×0.25)
 */
function bm25ScoreWithImportance(queryTopics, docTopics, importance, decay, opts = {}) {
  const base = bm25Score(queryTopics, docTopics, opts);
  if (base === 0) return 0;
  return base * (0.40 + (importance * 0.35) + (decay * 0.25));
}

module.exports = { bm25Score, bm25ScoreWithImportance, K1, B, AVG_DL };
