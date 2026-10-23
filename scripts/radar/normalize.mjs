// Normalise and score candidate terms.
//
// Pure functions only: no network, no filesystem. The collectors produce raw names; everything
// that decides whether a name is a usable keyword lives here, so the rules can be tested without
// hitting GitHub or Hugging Face.
//
// The upstream project splits text into unigrams and bigrams, drops stop words, and keeps
// camelCase names whole (`hyperframes`) while also adding their parts. That behaviour is kept,
// because the failure it prevents is the same one here: "HyperFrames" and "hyper frames" are the
// same new thing and must not become two pages.
import {
  MAX_TERM_LEN,
  MIN_TERM_LEN,
  RELEVANCE_KEYWORDS,
  SCORING,
  SKIP_WORDS,
  STOP_WORDS,
} from "./config.mjs";

const SPLIT = /[^a-z0-9.+#]+/g;
const CAMEL = /(?<=[a-z])(?=[A-Z])/g;

/**
 * Lowercase word tokens. Dots, pluses and hashes survive because they are part of real names
 * (`llama.cpp`, `c#`); digits survive because version suffixes matter (`qwen3`).
 */
function words(text) {
  return String(text ?? "")
    .toLowerCase()
    .split(SPLIT)
    .filter(Boolean);
}

function isStop(word) {
  return STOP_WORDS.has(word) || SKIP_WORDS.has(word);
}

/**
 * A stable key for a term: lowercase, punctuation that does not distinguish names collapsed to a
 * single space, trimmed. Used for deduplication across sources, so it must be deterministic.
 */
export function termKey(term) {
  return words(term).join(" ");
}

/**
 * Split a phrase into unigrams and bigrams, dropping stop words and pure numbers.
 *
 * Bigrams come from the words *as written* rather than from the filtered set, so "qwen3 flash"
 * survives as one term while "the qwen3" does not become a bigram.
 */
export function extractTerms(text) {
  const flat = words(text);
  const camelParts = words(String(text ?? "").replace(CAMEL, " "));

  const singles = new Set(
    [...flat, ...camelParts].filter((w) => !isStop(w) && !/^\d+$/.test(w) && w.length >= MIN_TERM_LEN),
  );

  for (let i = 0; i + 1 < flat.length; i++) {
    const a = flat[i];
    const b = flat[i + 1];
    if (a === b || isStop(a) || isStop(b) || /^\d+$/.test(a) || /^\d+$/.test(b)) continue;
    singles.add(`${a} ${b}`);
  }

  return singles;
}

/**
 * Name-like phrases in a model card or a repo description: capitalised words, words carrying a
 * digit (`Qwen3.8`, `27B`), or inner capitals (`HyperFrames`). Adjacent name words join up to
 * three, which is what turns "Qwen3.8 Flash Next" into one candidate instead of three.
 *
 * `strong` keeps only phrases with an unmistakable name marker. Sentence-initial capitalisation
 * ("Trained on…") is not a name, and without this filter the top of every GitHub run is ordinary
 * prose. The caller still applies novelty filtering.
 */
export function extractNames(text, { strong = false } = {}) {
  const tokens = String(text ?? "").match(/[A-Za-z0-9][\w.+\-]*[\w+]?|[A-Za-z0-9]/g) ?? [];
  const out = new Set();
  let phrase = [];

  const isNameish = (word) =>
    /[0-9]/.test(word) || /[a-z][A-Z]/.test(word) || /^[A-Z][A-Za-z0-9.+\-]*$/.test(word);

  const flush = () => {
    if (!phrase.length) return;
    const joined = phrase.join(" ").toLowerCase();
    const parts = phrase.map((w) => w.toLowerCase());
    const allStop = parts.every((w) => isStop(w));
    const hasMarker = phrase.some((w) => /[0-9]/.test(w) || /[a-z][A-Z]/.test(w) || (w.match(/[A-Z]/g) ?? []).length >= 2);
    if (!allStop && (!strong || hasMarker) && joined.length >= MIN_TERM_LEN && joined.length <= MAX_TERM_LEN) {
      out.add(joined);
    }
    phrase = [];
  };

  for (const token of tokens) {
    if (isNameish(token)) {
      phrase.push(token);
      if (phrase.length >= 3) flush();
    } else {
      flush();
    }
  }
  flush();

  return out;
}

/**
 * Reject candidates that cannot become a page.
 *
 * Returns a reason string when the term is unusable, or null when it is fine. Separating this
 * from scoring keeps "is this a term at all" distinct from "is this term worth writing about".
 */
export function rejectReason(term) {
  const t = termKey(term);
  if (!t) return "empty";
  if (t.length < MIN_TERM_LEN) return "too short";
  if (t.length > MAX_TERM_LEN) return "too long";
  if (/^\d+$/.test(t)) return "number only";
  // A term made entirely of stop words is a phrase about nothing ("the model").
  if (t.split(" ").every((w) => isStop(w))) return "stop words only";
  // A single very common word is not a keyword; it is the site's own vocabulary.
  if (t.split(" ").length === 1 && t.length < 5) return "too generic";
  return null;
}

/** 0..1: how many independent sources reported this term, saturating at three. */
export function breadthScore(sourceCount) {
  return Math.min(1, sourceCount / 3);
}

/**
 * 0..1: how fast the term is accelerating, from its first and last sighting counts.
 *
 * A term seen 2 → 9 times in a week is a wave; one seen 9 → 9 is steady. Growth is measured
 * against the later count so a single noisy run cannot produce a perfect score.
 */
export function trendScore(firstCount, lastCount) {
  const a = Math.max(0, Number(firstCount) || 0);
  const b = Math.max(0, Number(lastCount) || 0);
  if (b <= 0) return 0;
  if (a <= 0) return 1;
  const growth = (b - a) / Math.max(b, 1);
  return Math.max(0, Math.min(1, growth));
}

/**
 * 0..1: how close the term is to this site's subject.
 *
 * Two independent signals: whether a source that produces *technical* names reported it (HF and
 * GitHub are where models and inference tooling appear), and whether the term itself mentions
 * something the site writes about. Either alone is enough for a mid score; both together is a
 * strong match. A term from a tool directory with no technical vocabulary is not irrelevant — it
 * is just less certain, which is what 0.35 expresses.
 */
export function relevanceScore(term, sources) {
  const t = termKey(term);
  const keywordHit = RELEVANCE_KEYWORDS.some((k) => t.includes(k));
  const technicalSource = (sources ?? []).some((s) => SCORING.relevantSources.includes(s));
  if (keywordHit && technicalSource) return 1;
  if (keywordHit) return 0.7;
  if (technicalSource) return 0.35;
  return 0.2;
}

/**
 * 0..1: how little competition the term seems to have, judging only by its shape.
 *
 * Without a keyword-tool API there is no difficulty number, so this is a proxy: a long, specific
 * multi-word term is nearly always easier to rank for than a short, obvious one. The proxy is
 * deliberately crude and its weight is the lowest of the four, so it nudges rather than decides.
 */
export function competitionScore(term) {
  const t = termKey(term);
  const tokens = t.split(" ").filter(Boolean);
  if (tokens.length >= 3) return 0.9;
  if (tokens.length === 2) return 0.65;
  if (t.length >= 12) return 0.5;
  if (t.length >= 8) return 0.35;
  return 0.2;
}

/**
 * Combine the four components into 0..100.
 *
 * Weights come from config so tuning does not require touching the formula.
 */
export function scoreTerm({ term, sources, firstCount, lastCount }, scoring) {
  const { weights } = scoring;
  const parts = {
    breadth: breadthScore(new Set(sources ?? []).size),
    trend: trendScore(firstCount, lastCount),
    relevance: relevanceScore(term, sources),
    competition: competitionScore(term),
  };
  const total =
    parts.breadth * weights.breadth +
    parts.trend * weights.trend +
    parts.relevance * weights.relevance +
    parts.competition * weights.competition;
  return { score: Math.round(total * 100), parts };
}
