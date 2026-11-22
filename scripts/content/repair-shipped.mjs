#!/usr/bin/env node
/**
 * Repair the two defects that reached the live corpus before the generator gated them.
 *
 *   node scripts/content/repair-shipped.mjs            # dry run, prints every proposed change
 *   node scripts/content/repair-shipped.mjs --apply    # writes, keeping a .bak beside each file
 *
 * Only `live` articles are touched: the scheduled ones will be regenerated, and rewriting them now
 * would just be overwritten.
 *
 * The transforms are deliberately mechanical, and every result is re-validated with the same
 * `parseArticle` the generator uses. A title that the validator still rejects is reported and left
 * alone rather than force-fitted — a script that invents prose is not a repair tool.
 *
 * `scripts/content/out` is untracked, so there is no git copy to fall back on. `--apply` writes
 * `<file>.bak` first; that file is the rollback.
 */
import { readFileSync, writeFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArticle } from "./generate.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, "out");
const APPLY = process.argv.includes("--apply");

/** Domains are correct as-is; only the bare product name is a misspelling. */
const DOMAIN = /\bstratat\.(?:com|top|dev|io|net)\b/gi;
const BRAND = /\bStratat\b/gi;

function fixBrand(text) {
  if (!text) return text;
  // Split on the domain so it survives, then fix the remainder. A plain global replace would
  // rewrite "stratat.com" into "Strata.com".
  const parts = String(text).split(DOMAIN);
  return parts.map((part) => part.replace(BRAND, "Strata")).join("stratat.com");
}

const titleCase = (words) =>
  words
    .split(" ")
    .map((word) => (word ? word[0].toUpperCase() + word.slice(1) : word))
    .join(" ");

/**
 * Turn the slug back into prose wherever it appears as an identifier in the title.
 *
 * `context-truncated` -> "context truncated", `Dorm-room-limits` -> "Dorm Room Limits". The
 * hyphenated lowercase run is the planner's identifier; a person writes the words with spaces.
 * Only slugs without digits are handled, matching the generator's rule — a hardware slug such as
 * `rtx4090-coder` is a model designation and the existing test asserts it may appear verbatim.
 */
function deSlug(title, slug) {
  if (/\d/.test(slug)) return title;
  const escaped = slug.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`(?:^|[^\\p{L}\\p{N}-])(${escaped})(?=$|[^\\p{L}\\p{N}-])`, "giu");
  return title.replace(pattern, (match, token, offset) => {
    // A token that starts with a capital is the title's own first word ("Dorm-room-limits:"),
    // so title-case the expansion; a lowercase one mid-sentence stays sentence-cased.
    const expanded = /^[A-Z]/.test(token) ? titleCase(token.replace(/-/g, " ")) : token.replace(/-/g, " ");
    const lead = match.slice(0, match.length - token.length);
    return lead + expanded;
  });
}

/** Drop a leading `slug:` / `slug —` label and capitalise what is left. */
function stripLabel(title, slug) {
  const variants = [slug.replace(/-/g, "[- ]")];
  const pattern = new RegExp(`^\\s*(?:${variants.join("|")})\\s*[:：|—–]\\s*`, "i");
  if (!pattern.test(title)) return title;
  const rest = title.replace(pattern, "").trim();
  return rest ? rest[0].toUpperCase() + rest.slice(1) : title;
}

function repairArticle(article, slug) {
  const changes = [];
  const next = { ...article };

  const titleBefore = article.title;
  let title = stripLabel(article.title, slug);
  if (title !== titleBefore) changes.push(`label stripped`);
  const afterSlug = deSlug(title, slug);
  if (afterSlug !== title) changes.push(`slug de-hyphenated`);
  title = afterSlug;
  const afterBrand = fixBrand(title);
  if (afterBrand !== title) changes.push(`brand fixed in title`);
  title = afterBrand.trim();
  if (title !== titleBefore) {
    next.title = title;
    changes.push(`title: "${titleBefore}" -> "${title}"`);
  }

  if (fixBrand(article.description) !== article.description) {
    next.description = fixBrand(article.description);
    changes.push(`brand fixed in description`);
  }
  if (fixBrand(article.body) !== article.body) {
    next.body = fixBrand(article.body);
    changes.push(`brand fixed in body (${(article.body.match(BRAND) ?? []).length}x)`);
  }
  const faqJson = JSON.stringify(article.faq);
  if (fixBrand(faqJson) !== faqJson) {
    next.faq = JSON.parse(fixBrand(faqJson));
    changes.push(`brand fixed in faq`);
  }

  return { next, changes };
}

let scanned = 0;
let touched = 0;
let rejected = 0;

for (const locale of readdirSync(OUT)) {
  const dir = join(OUT, locale);
  if (!statSync(dir).isDirectory()) continue;
  for (const file of readdirSync(dir)) {
    if (!file.endsWith(".json")) continue;
    const path = join(dir, file);
    const record = JSON.parse(readFileSync(path, "utf8"));
    if (record.status !== "live" || !record.article) continue;
    scanned++;

    const { next, changes } = repairArticle(record.article, record.slug);
    if (!changes.length) continue;

    let valid = true;
    try {
      parseArticle(JSON.stringify(next), record.slug);
    } catch (error) {
      valid = false;
      rejected++;
      console.log(`\n[${locale}] ${record.slug} — REPAIR REJECTED, file left alone`);
      console.log(`  ${error.message}`);
      for (const line of changes) console.log(`  proposed: ${line}`);
      continue;
    }

    touched++;
    console.log(`\n[${locale}] ${record.slug}${valid ? "" : " (invalid)"}`);
    for (const line of changes) console.log(`  ${line}`);

    if (APPLY) {
      const backup = `${path}.bak`;
      if (!existsSync(backup)) writeFileSync(backup, readFileSync(path));
      writeFileSync(path, JSON.stringify({ ...record, article: next }, null, 2) + "\n");
    }
  }
}

console.log(
  `\n${APPLY ? "applied" : "dry run"}: scanned=${scanned} changed=${touched} rejected=${rejected}`,
);
if (!APPLY) console.log("re-run with --apply to write (a .bak is kept beside each file)");
