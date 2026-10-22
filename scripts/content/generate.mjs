#!/usr/bin/env node
/**
 * Generate one article per plan item, resumably.
 *
 *   node scripts/content/generate.mjs --locale en --kind hardware --limit 3
 *   node scripts/content/generate.mjs                 # every pending item
 *
 * Resume is by output file: an item whose JSON already exists is skipped, so a killed run
 * continues where it stopped. Each article is written to a temp file and renamed, so a crash
 * never leaves a half-written article that a later run would treat as done.
 */
import { existsSync, mkdirSync, readFileSync, renameSync, appendFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const PLAN = join(ROOT, "scripts/content/plan.json");
const OUT = join(ROOT, "scripts/content/out");
const STATE = join(ROOT, "scripts/content/.state.jsonl");

// Secrets come from the environment only; this file is committed.
const BASE = (process.env.CONTENT_LLM_BASE_URL ?? "https://ttqq.inping.com/v1").replace(/\/$/, "");
const KEY = process.env.CONTENT_LLM_API_KEY;
const MODEL = process.env.CONTENT_LLM_MODEL ?? "qwen3.6:35b-a3b";
const CONCURRENCY = Math.max(1, Number(process.env.CONTENT_CONCURRENCY ?? 3));
const MAX_ATTEMPTS = Number(process.env.CONTENT_MAX_ATTEMPTS ?? 3);
const TIMEOUT_MS = Number(process.env.CONTENT_TIMEOUT_MS ?? 180_000);

const args = process.argv.slice(2);
const arg = (name) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const onlyLocale = arg("locale");
const onlyKind = arg("kind");
const limit = arg("limit") ? Number(arg("limit")) : Infinity;


/** Each language gets its own angle and vocabulary. Nothing is translated from another row. */
const LANG = {
  en: { name: "English", market: "the United States", unit: "$", power: "kWh", price: "$0.17/kWh" },
  zh: { name: "Simplified Chinese", market: "中国大陆", unit: "¥", power: "度", price: "¥0.55/度" },
  ja: { name: "Japanese", market: "日本", unit: "¥", power: "kWh", price: "31円/kWh" },
  de: { name: "German", market: "Deutschland", unit: "€", power: "kWh", price: "0,32 €/kWh" },
  fr: { name: "French", market: "France", unit: "€", power: "kWh", price: "0,25 €/kWh" },
  es: { name: "Spanish", market: "España", unit: "€", power: "kWh", price: "0,18 €/kWh" },
  pt: { name: "Brazilian Portuguese", market: "Brasil", unit: "R$", power: "kWh", price: "R$ 0,75/kWh" },
};

const KIND_BRIEF = {
  hardware: "a page about running one specific quantization of a local model on one specific GPU",
  task: "a how-to guide for one concrete task a person wants to do with a local model",
  compare: "a comparison of two GPUs for local inference",
  troubleshoot: "a troubleshooting page for one concrete failure people hit",
  local: "a page about a local-market concern (electricity cost, buying channels, regulation, connectivity)",
  concept: "an explainer for one concept in local LLM deployment",
};

function factsBlock(item) {
  const f = item.facts ?? {};
  const rows = Object.entries(f)
    .filter(([, v]) => v !== null && v !== undefined && v !== "")
    .map(([k, v]) => `- ${k}: ${v}`)
    .join("\n");
  return rows || "- (no measured facts for this item; do not invent numbers)";
}

function buildPrompt(item) {
  const lang = LANG[item.locale];
  return [
    `You are writing original editorial content for Stratat, a desktop app that runs large AI models locally (the Strata engine with a Stratat client). All of it ships as static pages.`,
    `Write in ${lang.name} only. Do not translate from another language, and do not mention that this is a translation. The audience is in ${lang.market}; use local currency (${lang.unit}), local electricity unit (${lang.power}) and a realistic local price of ${lang.price} when you talk about cost.`,
    "",
    `This page is ${KIND_BRIEF[item.kind]}. Subject: "${item.slug}".`,
    item.rigName ? `Hardware: ${item.rigName}.` : "",
    item.quant ? `Quantization: ${item.quant}.` : "",
    "",
    "Measured facts you may use. These are the only numbers allowed — never invent a benchmark, a price or a spec:",
    factsBlock(item),
    "",
    "Return ONE JSON object with exactly these keys:",
    `  title: string, 50-62 characters, contains the subject, no clickbait, no site name`,
    `  description: string, 120-155 characters, a real summary for a search result`,
    `  body: string, markdown, at least 900 characters, using these sections:`,
    `        1. a 2-3 sentence answer-first opening (the conclusion, before any preamble)`,
    `        2. "## " heading sections that explain the why and the how`,
    `        3. one markdown table with at least 3 rows built from the measured facts`,
    `        4. one sentence that defines the core term, phrased so it can be quoted on its own`,
    `  faq: array of 3-5 objects { q, a } where q is a question people actually type into a search box, and a is 1-3 sentences`,
    `  imagePrompt: string, an English prompt for an abstract editorial illustration: dark navy background, teal accent, geometric, absolutely no text or letters, 16:9`,
    "",
    "Rules: describe how the reader measures or checks things on their own machine; base every claim on the facts above; do not promise speed you cannot derive from them; no markdown headings above level 3; do not link to any URL.",
    "Output raw JSON only, no prose around it, no code fence.",
  ]
    .filter(Boolean)
    .join("\n");
}

async function chat(prompt) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${BASE}/chat/completions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: MODEL,
        messages: [{ role: "user", content: prompt }],
        temperature: 0.7,
        max_tokens: 3000,
      }),
      signal: ctrl.signal,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const json = await res.json();
    return json?.choices?.[0]?.message?.content ?? "";
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Repair literal control characters inside JSON string literals.
 *
 * The model emits markdown bodies as JSON strings but sometimes presses enter for real, so a
 * `body` value carries a raw newline. That is invalid JSON and `JSON.parse` rejects the whole
 * article — observed once in three attempts, which is enough to fail a 900-item queue. Escaping
 * them inside strings only is safe: whitespace between tokens is untouched.
 */
function repairControlChars(text) {
  let out = "";
  let inString = false;
  let escaped = false;
  for (const ch of text) {
    if (escaped) {
      out += ch;
      escaped = false;
      continue;
    }
    if (ch === "\\") {
      out += ch;
      escaped = true;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      out += ch;
      continue;
    }
    if (inString) {
      if (ch === "\n") out += "\\n";
      else if (ch === "\r") out += "\\r";
      else if (ch === "\t") out += "\\t";
      else if (ch < " ") out += `\\u${ch.charCodeAt(0).toString(16).padStart(4, "0")}`;
      else out += ch;
      continue;
    }
    out += ch;
  }
  return out;
}

function parseArticle(raw, slug) {
  const text = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "");
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("no JSON object in response");
  const obj = JSON.parse(repairControlChars(text.slice(start, end + 1)));
  for (const key of ["title", "description", "body", "faq", "imagePrompt"]) {
    if (!obj[key]) throw new Error(`missing ${key}`);
  }
  if (!Array.isArray(obj.faq) || obj.faq.length < 3) throw new Error("need at least 3 FAQ entries");

  // 900 characters is a length floor for Latin prose. A Han character carries roughly a word,
  // not a letter, so a zh article at 811 characters is longer-form than an en one at 900 —
  // measured against the same number it was rejected for being too short. Count Han characters
  // twice so the floor means "enough substance" in every locale.
  const bodyText = String(obj.body);
  const han = (bodyText.match(/[\u3400-\u9fff]/g) ?? []).length;
  const substance = bodyText.length + han;
  if (substance < 900) throw new Error(`body too short (${bodyText.length}, weighted ${substance})`);

  // The model occasionally echoes the slug back as the title ("what-is-quantization").
  // A title is a sentence a person reads, so reject anything that reads like an identifier.
  const title = String(obj.title).trim();
  if (/^[a-z0-9]+(?:-[a-z0-9]+){2,}$/i.test(title)) {
    throw new Error(`title looks like a slug, not a sentence: ${title}`);
  }
  if (title.length < 20) throw new Error(`title too short (${title.length}): ${title}`);

  // A title must not be *labelled* with the slug ("rx7900xtx iq2 xs: … Review"). The subject is
  // supposed to appear in the title — the prompt asks for it — so any substring test rejects
  // legitimate titles and is not a defect. Hardware slugs are model designations ("rtx5090-iq2-xs")
  // that the model writes verbatim mid-sentence, which reads fine. Only the prefix-label form is
  // a filename. The whole-title-is-the-slug case is already caught above.
  if (slug) {
    const s = String(slug).toLowerCase();
    // The model writes the slug either verbatim or with its hyphens read as spaces, and labels
    // with a half-width colon in en but a full-width one (：) in zh/ja. Both spellings and both
    // colons have to be checked or the rule only fires in English.
    const variants = [s, s.replace(/-/g, " ")].map((v) => v.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
    const label = new RegExp(`^\\s*(?:${variants.join("|")})\\s*[:：|—–]`, "i");
    if (label.test(title)) throw new Error(`title uses the slug as a label: ${title}`);
  }

  // Structure is what makes the page extractable by answer engines: headings split it into
  // quotable sections and a table carries the facts. Both are required, not nice to have.
  const headings = (String(obj.body).match(/^#{2,3} /gm) ?? []).length;
  if (headings < 2) throw new Error(`body needs at least 2 headings, got ${headings}`);
  const rows = (String(obj.body).match(/^\|/gm) ?? []).length;
  if (rows < 3) throw new Error(`body needs a fact table, got ${rows} table rows`);
  return obj;
}

/** Temp file in the destination directory, then rename: readers never see a partial article. */
function writeAtomic(path, data) {
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.${process.pid}.tmp`;
  writeFileSync(tmp, data);
  renameSync(tmp, path);
}

function note(entry) {
  appendFileSync(STATE, `${JSON.stringify(entry)}\n`);
}

async function generateOne(item) {
  const path = join(OUT, item.locale, `${item.slug}.json`);
  if (existsSync(path)) return { skipped: true };

  let lastError;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const started = Date.now();
    try {
      const article = parseArticle(await chat(buildPrompt(item)), item.slug);
      writeAtomic(
        path,
        `${JSON.stringify(
          {
            ...item,
            status: "scheduled",
            article: {
              title: article.title.trim(),
              description: article.description.trim(),
              body: article.body.trim(),
              faq: article.faq.slice(0, 5),
              imagePrompt: article.imagePrompt.trim(),
            },
            generatedAt: new Date().toISOString(),
            model: MODEL,
          },
          null,
          2,
        )}\n`,
      );
      note({ id: item.id, ok: true, attempt, ms: Date.now() - started });
      return { ok: true };
    } catch (err) {
      lastError = err;
      note({ id: item.id, ok: false, attempt, ms: Date.now() - started, error: String(err.message).slice(0, 200) });
      // Back off so a rate limit or a cold model does not burn every attempt at once.
      await new Promise((r) => setTimeout(r, 1500 * attempt));
    }
  }
  return { failed: String(lastError?.message ?? lastError) };
}

async function main() {
  if (!KEY) {
    console.error("error: CONTENT_LLM_API_KEY is not set");
    process.exit(2);
  }
  const plan = JSON.parse(readFileSync(PLAN, "utf8"));
  let queue = plan.items;
  if (onlyLocale) queue = queue.filter((i) => i.locale === onlyLocale);
  if (onlyKind) queue = queue.filter((i) => i.kind === onlyKind);
  queue = queue.slice(0, Number.isFinite(limit) ? limit : queue.length);

  console.log(`→ ${queue.length} item(s), concurrency ${CONCURRENCY}, model ${MODEL}`);
  const stats = { ok: 0, skipped: 0, failed: 0 };
  const failures = [];
  let cursor = 0;

  async function worker(n) {
    for (;;) {
      const index = cursor++;
      if (index >= queue.length) return;
      const item = queue[index];
      const result = await generateOne(item);
      if (result.ok) stats.ok++;
      else if (result.skipped) stats.skipped++;
      else {
        stats.failed++;
        failures.push([item.id, result.failed]);
      }
      const done = stats.ok + stats.skipped + stats.failed;
      if (done % 10 === 0 || done === queue.length) {
        console.log(`  ${done}/${queue.length} ok=${stats.ok} skipped=${stats.skipped} failed=${stats.failed}`);
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, queue.length) }, (_, i) => worker(i)));

  console.log(`✓ ok=${stats.ok} skipped=${stats.skipped} failed=${stats.failed}`);
  for (const [id, err] of failures.slice(0, 10)) console.log(`  ✗ ${id}: ${err}`);
  if (stats.failed > 0) process.exitCode = 1;
}

// Importable so the validators can be tested without a network call: running the script is the
// only thing that needs a key.
export { parseArticle, repairControlChars };

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
