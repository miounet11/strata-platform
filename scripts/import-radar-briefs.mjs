#!/usr/bin/env node
/**
 * Turn a new-term-radar report.json into unpublished page briefs.
 *
 * Radar stays a sidecar. Point it at scripts/radar/strata.config.json and
 * pass --skip newsites (the new-domain feed is empty here on purpose):
 *
 *   python -m radar daily --config scripts/radar/strata.config.json --skip newsites --out report.md
 *   node scripts/import-radar-briefs.mjs --report report.json
 *
 * Only keyword rows with decision "prioritize" that match local-inference
 * wording are kept. Rows that already name Strata or Qwen3.8-Flash-Next are
 * dropped. Existing status=live topics are never overwritten. Briefs are not
 * routed on the site until a person sets status to "live" and writes en/zh copy.
 *
 *   node scripts/import-radar-briefs.mjs --selftest
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const TOPICS_PATH = join(ROOT, "apps/www/src/data/topics.json");

const KNOWN = [
  "strata",
  "niko strata",
  "niko1221 strata",
  "qwen3.8-flash-next",
  "qwen3.8 flash next",
  "stratat",
];

const KEEP = [
  /local llm/,
  /local model/,
  /local ai/,
  /qwen\s*3/,
  /flash[- ]next/,
  /\bmoe\b/,
  /ollama/,
  /llama\.?cpp/,
  /\bvllm\b/,
  /\bgguf\b/,
  /\bvram\b/,
  /strix halo/,
  /\bradeon\b/,
  /\brocm\b/,
  /gaming gpu/,
  /consumer gpu/,
];

export function norm(text) {
  return String(text ?? "")
    .toLowerCase()
    .replace(/[_./]+/g, " ")
    .replace(/-/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function slugify(phrase) {
  const slug = norm(phrase)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60)
    .replace(/-$/g, "");
  return slug || null;
}

export function alreadyCovered(phrase, known = KNOWN) {
  const text = norm(phrase);
  if (!text) return false;
  return known.some((entry) => {
    const name = norm(entry);
    return name.length >= 4 && text.includes(name);
  });
}

export function keepPhrase(phrase) {
  const raw = String(phrase ?? "").toLowerCase();
  const text = norm(phrase);
  return KEEP.some((pattern) => pattern.test(raw) || pattern.test(text));
}

export function selectBriefs(report, known = KNOWN, now = new Date().toISOString()) {
  const rows = report?.keywords?.rows;
  if (!Array.isArray(rows)) return [];
  const briefs = [];
  const seen = new Set();
  for (const row of rows) {
    if (row?.decision !== "prioritize") continue;
    const phrase = String(row.phrase ?? row.term ?? "").trim();
    if (!phrase || !keepPhrase(phrase) || alreadyCovered(phrase, known)) continue;
    const slug = slugify(phrase);
    if (!slug || seen.has(slug)) continue;
    seen.add(slug);
    const behind = Array.isArray(row.names) ? row.names.map((name) => String(name)).filter(Boolean) : [];
    briefs.push({
      slug,
      status: "brief",
      filter: null,
      phrase,
      kind: row.kind ?? null,
      decision: "prioritize",
      behind,
      evidence: String(row.evidence ?? "").slice(0, 400),
      importedAt: now,
    });
  }
  return briefs;
}

export function mergeBriefs(doc, incoming) {
  const topics = Array.isArray(doc?.topics) ? doc.topics.map((topic) => ({ ...topic })) : [];
  const index = new Map(topics.map((topic, i) => [topic.slug, i]));
  let added = 0;
  let refreshed = 0;
  let skippedLive = 0;
  for (const brief of incoming) {
    const at = index.get(brief.slug);
    if (at == null) {
      topics.push(brief);
      index.set(brief.slug, topics.length - 1);
      added += 1;
      continue;
    }
    if (topics[at].status === "live") {
      skippedLive += 1;
      continue;
    }
    topics[at] = { ...topics[at], ...brief, status: "brief" };
    refreshed += 1;
  }
  return { doc: { ...doc, topics }, added, refreshed, skippedLive };
}

function loadReport(path) {
  const report = JSON.parse(readFileSync(path, "utf8"));
  if (!report || typeof report !== "object" || Array.isArray(report)) {
    throw new Error("report.json must be an object");
  }
  return report;
}

function runImport(reportPath) {
  const report = loadReport(reportPath);
  const incoming = selectBriefs(report);
  const doc = JSON.parse(readFileSync(TOPICS_PATH, "utf8"));
  const merged = mergeBriefs(doc, incoming);
  writeFileSync(TOPICS_PATH, `${JSON.stringify(merged.doc, null, 2)}\n`);
  console.log(
    `topics.json — added ${merged.added}, refreshed ${merged.refreshed}, left live ${merged.skippedLive}`,
  );
}

function assert(cond, message) {
  if (!cond) throw new Error(message);
}

function selftest() {
  const now = "2026-10-14T00:00:00.000Z";
  const report = {
    keywords: {
      rows: [
        { phrase: "run a local llm on 16gb", decision: "prioritize", kind: "generic", names: ["ExampleRunner"], evidence: "people asked how to run it locally" },
        { phrase: "photoshop alternative", decision: "prioritize", kind: "generic", names: ["PhotoCraft"], evidence: "design tool" },
        { phrase: "niko strata download", decision: "prioritize", kind: "generic", names: [], evidence: "brand query" },
        { phrase: "ollama alternative", decision: "watch", kind: "generic", names: ["ExampleRunner"], evidence: "too early" },
        { phrase: "Qwen3.8-Flash-Next", decision: "prioritize", kind: "name", names: [], evidence: "" },
        { phrase: "vllm vs llama.cpp", decision: "prioritize", kind: "generic", names: ["ExampleRunner"], evidence: "serving comparison" },
        { phrase: "amd", decision: "prioritize", kind: "generic", names: [], evidence: "too broad" },
      ],
    },
  };
  assert(keepPhrase("llama.cpp"), "llama.cpp should match on the raw phrase");
  const selected = selectBriefs(report, KNOWN, now);
  const slugs = selected.map((row) => row.slug);
  assert(slugs.includes("run-a-local-llm-on-16gb"), `missing local llm brief: ${slugs.join(",")}`);
  assert(slugs.includes("vllm-vs-llama-cpp"), `missing vllm brief: ${slugs.join(",")}`);
  assert(!slugs.includes("photoshop-alternative"), "off-topic phrase was kept");
  assert(!slugs.includes("niko-strata-download"), "known name was kept");
  assert(!slugs.includes("ollama-alternative"), "watch row was kept");
  assert(!slugs.includes("qwen3-8-flash-next"), "covered model name was kept");
  assert(!slugs.some((slug) => slug === "amd"), "bare amd should not match the lexicon");
  assert(selected.every((row) => row.status === "brief" && row.decision === "prioritize"), "brief shape");

  const live = {
    topics: [
      { slug: "amd", status: "live", title: { en: "AMD" }, body: { en: "keep" } },
      { slug: "vllm-vs-llama-cpp", status: "brief", evidence: "old" },
    ],
  };
  const once = mergeBriefs(live, selected);
  assert(once.added === 1, `expected 1 add, got ${once.added}`);
  assert(once.refreshed === 1, `expected 1 refresh, got ${once.refreshed}`);
  assert(once.skippedLive === 0, "live collision that should not happen");
  const amd = once.doc.topics.find((topic) => topic.slug === "amd");
  assert(amd.status === "live" && amd.body.en === "keep", "live topic was overwritten");
  const twice = mergeBriefs(once.doc, selected);
  assert(twice.added === 0, "second import added a duplicate");
  assert(twice.refreshed === 2, `second import should refresh briefs, got ${twice.refreshed}`);
  assert(twice.doc.topics.filter((topic) => topic.slug === "run-a-local-llm-on-16gb").length === 1, "duplicate slug");

  const forced = mergeBriefs(
    { topics: [{ slug: "run-a-local-llm-on-16gb", status: "live", body: { en: "published" } }] },
    selected,
  );
  assert(forced.skippedLive === 1, "live slug with the same brief was not protected");
  assert(forced.doc.topics[0].body.en === "published", "live body changed");
  console.log("import-radar-briefs selftest ok");
}

const self = process.argv.includes("--selftest");
if (self) {
  selftest();
} else if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const flag = process.argv.indexOf("--report");
  const reportPath = flag >= 0 ? process.argv[flag + 1] : "";
  if (!reportPath) {
    console.error("usage: node scripts/import-radar-briefs.mjs --report report.json");
    process.exit(1);
  }
  try {
    runImport(reportPath);
  } catch (err) {
    console.error(`import-radar-briefs: ${err.message}`);
    process.exit(1);
  }
}
