#!/usr/bin/env node
/**
 * New-term radar: find names people are about to search for, before keyword tools list them.
 *
 *   node scripts/content/radar.mjs              # fetch, filter, write scripts/content/radar.json
 *   node scripts/content/radar.mjs --dry-run    # print what it found, write nothing
 *
 * Idea borrowed from zhuyansen/new-term-radar: it watches the *first* steps of a name becoming
 * popular (a repo taking off, a model surging) rather than the last one (a keyword tool listing
 * it days or weeks later). We read two free, public signals that fit a local-LLM site:
 *
 *   1. Hugging Face trending models — a model name that starts appearing in downloads is what
 *      people will search within days.
 *   2. GitHub repositories created recently that gain stars fast — new runtimes, quantizers and
 *      servers. A repo at 800 stars/day is the whole signal, and it is public.
 *
 * No key, no paid API. Every fetch is best-effort: a signal that is down contributes nothing
 * rather than failing the run, because a day of radar with one source is still useful.
 *
 * The scoring below is deliberately pure and exported, so the ranking can be tested without a
 * network call.
 */
import { readFileSync, readdirSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { collectSitemaps } from "../radar/sources.mjs";
import { SOURCES, STATE_FILE } from "../radar/config.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, "radar.json");
const ROOT = join(HERE, "..", "..");

/**
 * A candidate has to be about running models locally. Without this the radar returns general AI
 * news ("sora", "veo") that we cannot write about honestly: there are no measurements behind it
 * and the article would be speculation dressed as a benchmark.
 */
const TOPIC_TERMS = [
  "gguf", "quant", "llama", "mistral", "qwen", "gemma", "phi", "deepseek", "granite",
  "ollama", "llama.cpp", "vllm", "sglang", "exllama", "mlx", "rocm", "cuda", "tensorrt",
  "inference", "serving", "local", "on-device", "edge", "vram", "gpu", "cpu", "speculative",
  "moe", "lora", "fine-tun", "embedding", "rerank", "vision", "multimodal", "context",
];

/**
 * Names we must not turn into pages: model cards, datasets and papers are not a search term a
 * person types, and a republished name with no measurements is filler.
 */
/**
 * Words that mean the thing is not a product we can write about. Matched as whole hyphenated
 * segments, not substrings: `test` as a substring rejected `latest`, `greatest` and `contest`,
 * which are ordinary words in real names (observed in review 2026-10-23).
 */
const STOP_TERMS = ["dataset", "paper", "benchmark-suite", "test", "demo", "tutorial", "template"];

/** True when `term` appears as a whole `-`/`.`/`_`/space separated segment of `text`. */
function hasTerm(text, term) {
  return text.split(/[^a-z0-9.]+/).includes(term);
}

/**
 * Names whose *shape* proves they are not a query about running models. Observed failures from
 * the first live run on 2026-10-23: `awesome-opus5-5-videos` (a link list), `dsh-our-free-model`
 * (a marketing name), `vectorcraft` / `effectcraft` (web tools that merely mention "local").
 * A page for any of these ranks for nothing and teaches the reader nothing.
 */
const NAME_STOP_PATTERNS = [
  /^awesome-/, /-awesome$/, /^cool-/, /-list$/, /^best-/, /-cheatsheet$/,
  /free-model/, /^our-/, /-videos?$/,
];

/**
 * The topic signal has to be in the name or a topic tag, not anywhere in a long description.
 * Matching the whole description let a web-design tool through because it said "run locally".
 *
 * For sitemap terms this list is the *only* relevance gate, and it is deliberately the strict
 * half of TOPIC_TERMS: a directory's new URLs are full of product names that have nothing to do
 * with running models, and the term itself carries no pipeline tag to fall back on.
 */
const STRONG_TERMS = [
  "gguf", "quant", "llama", "ollama", "vllm", "sglang", "exllama", "mlx", "rocm",
  "inference", "vram", "llm", "moe", "speculative", "tensorrt", "llama.cpp",
];

/**
 * Hugging Face pipeline tags whose pages are about running a model on your own hardware. A
 * text-to-image or speech model is a different subject from what this site measures.
 */
const TEXT_PIPELINES = new Set([
  "text-generation",
  "text2text-generation",
  "image-text-to-text",
  "feature-extraction",
  "text-classification",
]);

/** Normalise a raw name into a slug that matches the existing guide slots. */
export function slugify(name) {
  return String(name)
    .toLowerCase()
    .replace(/^[^a-z0-9]+/, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60)
    .replace(/-$/, "");
}

/**
 * Score one candidate 0..1.
 *
 * `momentum` is what the source already knows (HF trending score, or stars per day), normalised
 * by the caller. `ageDays` matters because the whole point is catching a name early: the same
 * momentum on a two-day-old repo is a stronger signal than on a two-year-old one.
 */
export function scoreCandidate({
  momentum = 0,
  ageDays = null,
  name = "",
  summary = "",
  pipeline = "",
  source = "",
}) {
  const text = `${name} ${summary}`.toLowerCase();
  if (!name || STOP_TERMS.some((t) => hasTerm(text, t))) return 0;

  const slugish = slugify(name.split("/").pop() ?? name);
  if (NAME_STOP_PATTERNS.some((re) => re.test(slugish))) return 0;

  // Relevance is decided by where the signal sits, not by whether a word appears anywhere.
  // Matching the whole summary let `answer-me-with-html` (4,253 stars) through because one of its
  // GitHub topics said "llm"; a page about a web toy would have gone live.
  //
  //   - a topic word in the *name* is enough: "flint-gguf", "qwen3-8b-local", "llama.cpp"
  //   - otherwise a Hugging Face model only qualifies through its pipeline tag, which is the real
  //     classifier: text-generation is a model we can measure, text-to-image is another subject
  const inName = String(name).toLowerCase();
  const nameTerm = TOPIC_TERMS.some((t) => inName.includes(t));
  const pipelineOk = source === "huggingface" && TEXT_PIPELINES.has(pipeline);
  // A sitemap term is a slug fragment lifted out of a tool directory's URL. It carries no pipeline
  // tag and no description, so the only evidence that it is about running models is the word
  // itself — hence the strict list rather than TOPIC_TERMS, whose "local"/"edge"/"gpu" would let
  // most of a directory's new products through.
  if (source === "sitemaps") {
    // Whole-segment, not substring: `quantum` contains `quant` and live-selected on 2026-10-23.
    if (!STRONG_TERMS.some((t) => hasTerm(inName, t))) return 0;
  } else if (!nameTerm && !pipelineOk) {
    return 0;
  }

  const momentumScore = Math.max(0, Math.min(1, Number(momentum) || 0));
  // Fresh names are the ones worth writing first; after ~90 days a name is no longer "new" and
  // the big sites have covered it. Treating a missing timestamp as merely average (0.5) pushed
  // every such candidate below the score floor, which is most of a GitHub response and some HF
  // models — an absent date is not evidence the thing is old.
  const freshness = ageDays === null ? 0.8 : Math.max(0, Math.min(1, 1 - Number(ageDays) / 90));

  // Momentum dominates: a stale name with no pull is not worth a page even if it is on topic.
  return Number((0.65 * momentumScore + 0.35 * freshness).toFixed(4));
}

/** Reject names that would collide with what the site already has, or that are too generic. */
export function isPublishable(slug, takenSlugs) {
  if (!slug || slug.length < 4) return false;
  if (/^\d+$/.test(slug)) return false;
  // A hyphen-free slug used to need 10 characters, which rejected real product names — `deepinfer`
  // (DeepSeek's inference framework, 0.96) and `vllm` were dropped on every run, so the GitHub
  // source contributed nothing at all. The 4-character floor below already removes names too short
  // to carry a query ("moe", "rag"); relevance is scoreCandidate's job, not this function's.
  return !takenSlugs.has(slug);
}

async function getJson(url, timeoutMs = 20000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      headers: { accept: "application/json", "user-agent": "stratat-radar/1" },
      signal: ctrl.signal,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

/** Hugging Face trending models. Public, no key. */
async function fromHuggingFace(limit) {
  const rows = await getJson(
    `https://huggingface.co/api/models?sort=trendingScore&direction=-1&limit=${limit}`,
  );
  if (!Array.isArray(rows)) return [];
  // Normalise by rank, not by the maximum. trendingScore is heavily skewed — on 2026-10-23 the
  // top row scored 2040 while the median of the same 40 rows was 221 — so dividing by the max
  // put the median at 0.11 and, with momentum weighted 0.65, every on-topic name below the 0.55
  // floor. The radar then selected 1 article out of 40. Rank keeps the ordering the source
  // reports and gives the tail a usable spread.
  const n = rows.length;
  return rows.map((r, i) => ({
    source: "huggingface",
    name: r.id ?? r.modelId ?? "",
    url: `https://huggingface.co/${r.id ?? ""}`,
    summary: `${r.pipeline_tag ?? ""} ${(r.tags ?? []).slice(0, 12).join(" ")}`,
    pipeline: r.pipeline_tag ?? "",
    // 1 for the top row, 0 for the last, linear in rank.
    momentum: n > 1 ? 1 - i / (n - 1) : 1,
    ageDays: r.createdAt ? (Date.now() - Date.parse(r.createdAt)) / 86400000 : null,
    downloads: r.downloads ?? null,
    likes: r.likes ?? null,
  }));
}

/** Recently created repositories gaining stars fast. Public, unauthenticated, 10 req/min. */
async function fromGitHub(limit) {
  const since = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
  const json = await getJson(
    `https://api.github.com/search/repositories?q=created:>${since}+stars:>200&sort=stars&order=desc&per_page=${limit}`,
  );
  const rows = json?.items;
  if (!Array.isArray(rows)) return [];
  return rows.map((r) => {
    const ageDays = (Date.now() - Date.parse(r.created_at)) / 86400000;
    return {
      source: "github",
      name: r.full_name ?? r.name ?? "",
      url: r.html_url ?? "",
      summary: `${r.description ?? ""} ${(r.topics ?? []).join(" ")}`,
      // Stars per day, capped: 1000/day is already extraordinary, more adds no information.
      momentum: Math.min(1, (r.stargazers_count ?? 0) / Math.max(1, ageDays) / 1000),
      ageDays,
      stars: r.stargazers_count ?? null,
    };
  });
}

/**
 * Words that several *new* URLs on a watched directory started carrying — upstream signal ③.
 *
 * This is the only signal that sees the naming come from the tool side rather than the model side:
 * a directory adds `niko-strata` and `flux-2-dev` pages before either appears on Hugging Face, and
 * a directory URL is literally the slug a person will type.
 *
 * It needs a previous run to compare against, so the first run contributes nothing and only
 * records the baseline. That is upstream's behaviour too, and it is why the state file is written
 * even when no candidate comes back.
 */
async function fromSitemaps(limit, { writeState = true } = {}) {
  const cfg = { ...SOURCES.sitemaps, maxUrls: Math.max(SOURCES.sitemaps.maxUrls, limit * 100) };
  const statePath = join(ROOT, STATE_FILE);
  let previous = {};
  if (existsSync(statePath)) {
    try {
      previous = JSON.parse(readFileSync(statePath, "utf8"));
    } catch {
      // A truncated state file means "no baseline", not "no radar": rebuilding it costs a run.
      previous = {};
    }
  }

  const result = await collectSitemaps(cfg, previous);
  // Written here rather than by main: the snapshot belongs to this source, and a crash in another
  // source must not cost the baseline this run just established. Skipped on --dry-run, which
  // promises to write nothing — writing there would move tomorrow's baseline for free.
  if (writeState) {
    writeFileSync(
      statePath,
      `${JSON.stringify({ ...previous, sitemaps: result.snapshot ?? previous.sitemaps ?? [] }, null, 2)}\n`,
    );
  }

  if (result.error) console.log(`  sitemaps: ${result.error}`);
  return result.terms.map((t) => ({
    source: "sitemaps",
    name: t.term,
    url: "",
    summary: t.detail ?? "",
    // The surplus over the directory's own vocabulary *is* the signal, so it is the momentum.
    momentum: Math.min(1, (Number(t.lift) || 1) / 5),
    // A directory page is new by definition; the age of the underlying product is unknown.
    ageDays: null,
    lift: t.lift ?? null,
  }));
}

/** Existing slugs, so the radar never proposes a page the site already has. */
function existingSlugs() {
  const taken = new Set();
  const planPath = join(HERE, "plan.json");
  if (existsSync(planPath)) {
    for (const item of JSON.parse(readFileSync(planPath, "utf8")).items ?? []) taken.add(item.slug);
  }
  const outDir = join(HERE, "out");
  if (existsSync(outDir)) {
    for (const entry of readdirSync(outDir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      for (const file of readdirSync(join(outDir, entry.name))) {
        if (file.endsWith(".json")) taken.add(file.slice(0, -5));
      }
    }
  }
  return taken;
}

/** Read a numeric setting, falling back to `fallback` for anything that is not a usable number. */
function numSetting(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");

  // Configuration, all optional, all with defaults that keep the radar harmless when unset.
  //   RADAR_ENABLED=0     switch the radar off entirely; the job then runs exactly as before it
  //                       existed, which is the fallback when a signal source misbehaves and
  //                       nobody is around to fix it.
  //   RADAR_SOURCES       comma-separated subset of huggingface,github,sitemaps
  //   RADAR_SOURCE_LIMIT  how many rows each source returns
  //   RADAR_MAX_ITEMS     how many names become articles per run
  //   RADAR_MIN_SCORE     score floor; below it a name is not worth a page
  if (process.env.RADAR_ENABLED === "0" || process.argv.includes("--off")) {
    console.log("radar disabled (RADAR_ENABLED=0) — nothing fetched, nothing merged");
    return;
  }
  const limit = numSetting(process.env.RADAR_SOURCE_LIMIT, 40);
  const minScore = numSetting(process.env.RADAR_MIN_SCORE, 0.55);
  const maxNew = numSetting(process.env.RADAR_MAX_ITEMS, 7);
  const wanted = (process.env.RADAR_SOURCES ?? "huggingface,github,sitemaps")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  const taken = existingSlugs();
  const results = [];
  const sourceErrors = [];

  const sources = [
    ["huggingface", fromHuggingFace],
    ["github", fromGitHub],
    ["sitemaps", fromSitemaps],
  ].filter(([label]) => wanted.includes(label));
  for (const [label, fn] of sources) {
    try {
      // --dry-run must not move the sitemap baseline: the next real run would then compare against
      // URLs it never reports, and the first day's surges would disappear.
      results.push(...(await fn(limit, { writeState: !dryRun })));
    } catch (err) {
      // One dead source must not cost the run: the other still contributes.
      sourceErrors.push(`${label}: ${String(err.message).slice(0, 120)}`);
    }
  }

  const scored = results
    .map((c) => ({ ...c, slug: slugify(c.name.split("/").pop() ?? c.name), score: scoreCandidate(c) }))
    // minScore was read from the environment and then never applied, so a first live run selected
    // 0.39-score names — below the configured floor. Filter before sorting, not after slicing.
    .filter((c) => c.score >= minScore && isPublishable(c.slug, taken))
    .sort((a, b) => b.score - a.score);

  // One entry per slug even when both sources name it: keep the higher score.
  const bySlug = new Map();
  for (const c of scored) if (!bySlug.has(c.slug)) bySlug.set(c.slug, c);

  // Collapse model families: `foo-7b`, `foo-7b-uncensored-fp8` and `foo-7b-gguf` are one subject,
  // and three pages that differ by a suffix are the exact duplicate-page shape verify.mjs rejects.
  const byFamily = new Map();
  for (const c of bySlug.values()) {
    const family = c.slug.split("-").slice(0, 3).join("-");
    if (!byFamily.has(family)) byFamily.set(family, c);
  }
  const picked = [...byFamily.values()].slice(0, maxNew);

  console.log(
    `radar: ${results.length} raw → ${scored.length} on-topic and new → ${picked.length} selected` +
      (sourceErrors.length ? ` (sources failed: ${sourceErrors.join("; ")})` : ""),
  );
  for (const c of picked) {
    console.log(`  ${c.score.toFixed(2)} ${c.slug} (${c.source}${c.stars ? `, ${c.stars}★` : ""})`);
  }

  if (dryRun) {
    console.log("(dry run — nothing written)");
    return;
  }

  writeFileSync(
    OUT,
    `${JSON.stringify(
      { generatedAt: new Date().toISOString(), minScore, sourceErrors, candidates: picked },
      null,
      2,
    )}\n`,
  );
  console.log(`wrote ${OUT}`);

  // `--merge` is what turns the radar into traffic: the daily job runs it before generate.mjs, so
  // a name caught today becomes an article through the existing pipeline instead of sitting in a
  // file nobody reads. Items are appended with kind "radar" and dated today, which is exactly what
  // generate.mjs and publish.mjs already understand.
  if (process.argv.includes("--merge")) {
    const planPath = join(HERE, "plan.json");
    const plan = JSON.parse(readFileSync(planPath, "utf8"));
    const today = new Date().toISOString().slice(0, 10);
    // Keyed on locale+slug against the plan as read. Verified idempotent: a second run finds each
    // name already present per locale and adds nothing, so it picks new candidates instead.
    const known = new Set(plan.items.map((i) => `${i.locale}/${i.slug}`));
    let added = 0;
    for (const c of picked) {
      for (const locale of plan.locales ?? ["en"]) {
        if (known.has(`${locale}/${c.slug}`)) continue;
        plan.items.push({
          id: `${locale}-radar-${c.slug}`,
          locale,
          kind: "radar",
          slug: c.slug,
          path: `/${locale}/guides/${c.slug}`,
          workingTitle: c.name,
          radar: { source: c.source, url: c.url, score: c.score, momentum: c.momentum },
          // Today, not a slot: the point is to publish while the name is still rising.
          publishAt: today,
          status: "scheduled",
          order: plan.items.length,
        });
        added++;
      }
    }
    plan.total = plan.items.length;
    if (added > 0) {
      writeFileSync(planPath, `${JSON.stringify(plan, null, 2)}\n`);
      console.log(`merged ${added} radar item(s) into plan.json for ${today}`);
    } else {
      console.log("nothing new to merge");
    }

    // Tell a person what the radar decided. Without this the only record is a line in a log on a
    // host nobody has open, and "found nothing new" looks the same as "found something useless".
    // Only merged names are reported: a notification per run listing rejects would train the
    // reader to ignore it.
    if (added > 0 && process.env.RADAR_NOTIFY !== "0") {
      try {
        const { notifyFeishu } = await import("../notify.mjs");
        await notifyFeishu({
          stage: "content/radar",
          reason: `热词雷达新增 ${picked.length} 个选题（共 ${added} 篇待生成）`,
          raw: picked.map((c) => `  ${c.score.toFixed(2)} ${c.name} (${c.source})`).join("\n"),
        });
      } catch (err) {
        // The merge already happened; a failed notification must not undo it or fail the run.
        console.error(`radar notify failed: ${String(err.message).slice(0, 120)}`);
      }
    }
  }

  // A radar that finds nothing because it is blocked looks exactly like a quiet day. Say which.
  if (picked.length === 0 && sourceErrors.length > 0) {
    console.error(`RADAR_BLIND ${sourceErrors.join("; ")}`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
