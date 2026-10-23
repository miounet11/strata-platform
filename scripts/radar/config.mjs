// What the radar watches. Copy nothing — this file is the config for this site.
//
// The upstream project (zhuyansen/new-term-radar) watches six signals. Only three of them are
// free and keyless; the paid ones need an AIsa key and are off until one exists. What remains is
// still enough for this site: hardware and model names appear on Hugging Face and GitHub before
// any keyword tool lists them, and tool directories name products before they rank.
//
// Every threshold here is a judgement about *this* site's niche, so they live in one place rather
// than being scattered as literals in the collectors.

/** Signals to run. Each maps to a collector in ./sources/. */
export const SOURCES = {
  // Repos averaging >=200 stars/day while under two weeks old. Catches the "niko strata" case:
  // a project people are already searching for by name.
  github: {
    enabled: true,
    /** Only repos created within this window are "new". */
    windowDays: 14,
    /** A new repo must average this many stars/day to count. */
    minStarsPerDay: 200,
    /** Or gain this many stars since the previous run. */
    minStarDelta: 400,
    /** GitHub's unauthenticated rate limit is 60/h; a token raises it to 5000/h. */
    perPage: 60,
  },

  // Models and Spaces new to the trending top 50. Free, no key.
  huggingface: {
    enabled: true,
    /** Trending entries to inspect. */
    limit: 50,
    /** Only models created within this window count as "new". */
    windowDays: 30,
  },

  // Words that several new URLs on a watched site share and its older URLs rarely carried.
  sitemaps: {
    enabled: true,
    /** Directory sitemaps for the AI-tool and MCP space. */
    urls: [
      "https://www.toolify.ai/sitemap.xml",
      "https://aitoptools.com/sitemap_index.xml",
      "https://futurepedia.io/sitemap.xml",
      "https://opentools.ai/sitemap.xml",
    ],
    /** A URL counts as "new" if it appeared within this window. */
    windowDays: 30,
    /** A term must appear in this many new URLs to be a signal, not one page's phrasing. */
    minNewUrls: 3,
    /** Cap per sitemap so one huge directory cannot dominate a run. */
    maxUrls: 3000,
  },
};

/**
 * Words that are everywhere in this niche. A "surge" in them is never a new term, so they are
 * dropped before scoring. `SKIP_WORDS` is added to a base list shared with the upstream project.
 */
export const STOP_WORDS = new Set(
  `
a an and are as at be by can for from has have in into is it its of on or that the this to with your you
using use used via based built make makes made new open source opensource simple fast free first best
ai agent agents agentic llm llms mcp server servers skill skills tool tools toolkit plugin plugins claude code
codex cursor gpt openai anthropic model models app apps api cli sdk framework library project repo repository
github python typescript javascript node rust go web local self hosted powered support supports
your all any more most one two three get set run runs build builder generate generator help helper helps
assistant assistants chat bot bots automation automate automated workflow workflows system systems data
md readme docs example examples demo test tests template templates collection awesome list curated
gguf awq gptq safetensors transformers pytorch llama cpp ollama vllm sglang exl2 exl3 quant quantization
gpu gpus vram cuda rocm nvidia amd intel apple metal cpu ram ssd memory tokens token context benchmark
release releases update updates version versions install guide guides tutorial tutorials how what why when
`.split(/\s+/).filter(Boolean),
);

/** Extra stop words from the site's own vocabulary. */
export const SKIP_WORDS = new Set(
  `strata stratat desktop cleanyourtv windows linux macos mac iphone android download freeware`.split(/\s+/),
);

/** Term length bounds, in characters after normalisation. */
export const MIN_TERM_LEN = 3;
export const MAX_TERM_LEN = 48;

/**
 * Scoring. Each component is 0..1 and they are weighted into a single 0..100 value.
 *
 * The weights say what this site wants: a name that several independent places have just started
 * using (breadth) and is accelerating (trend) is worth a page; a term that only one source keeps
 * repeating is not, however often it repeats.
 */
export const SCORING = {
  weights: { breadth: 0.35, trend: 0.3, relevance: 0.2, competition: 0.15 },
  /** A lead needs at least this score to enter the content plan. */
  queueThreshold: 60,
  /** Sources that make a term relevant to a local-AI-hardware site. */
  relevantSources: ["huggingface", "github"],
};

/**
 * Relevance keywords. A term that mentions one of these is about this site's subject; a term
 * with none of them scores low on relevance but is not rejected outright, because a new tool can
 * be worth a page before it is obviously about VRAM.
 */
export const RELEVANCE_KEYWORDS = [
  "model", "llm", "quant", "gguf", "vram", "gpu", "inference", "local", "run", "offline",
  "context", "token", "moe", "vision", "audio", "image", "video", "embed", "rerank",
  "coder", "code", "chat", "agent", "reasoning", "cache", "serving", "engine",
];

/** Cooldown: a term already turned into a page is not queued again for this many days. */
export const PUBLISHED_COOLDOWN_DAYS = 180;

/** How many leads one run may add to the content plan. Keeps a burst from flooding the queue. */
export const MAX_NEW_PER_RUN = 10;

/** Where state lives, relative to the repo root. */
export const STATE_FILE = "scripts/content/radar-state.json";
