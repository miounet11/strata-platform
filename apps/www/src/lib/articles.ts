import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { isAbsolute, join } from "node:path";
import { isLinkableName } from "./internal-links";

export type Faq = { q: string; a: string };

export type Article = {
  id: string;
  locale: string;
  kind: string;
  slug: string;
  path: string;
  order: number;
  publishAt: string;
  publishedAt?: string;
  status: string;
  article: {
    title: string;
    description: string;
    body: string;
    faq: Faq[];
    imagePrompt?: string;
  };
  generatedAt?: string;
  model?: string;
  imagePath?: string;
};

/**
 * Resolve the generated guides corpus directory across dev, build, and standalone runtime.
 *
 * In production, pm2 runs `.next/standalone/apps/www/server.js`, where `../../scripts/content/out`
 * points inside `.next/standalone` rather than `/opt/stratat/scripts/content/out`. Deriving from
 * `STRATAT_DATA_DIR` (`/opt/stratat/apps/www/src/data`) lets the live server see newly published
 * articles immediately without changing pm2 config or running a full site rebuild.
 */
function resolveContentDir(): string {
  const explicit = process.env.STRATAT_CONTENT_DIR?.trim();
  if (explicit) return isAbsolute(explicit) ? explicit : join(process.cwd(), explicit);

  const outEnv = process.env.CONTENT_OUT?.trim();
  if (outEnv) return isAbsolute(outEnv) ? outEnv : join(process.cwd(), outEnv);

  const candidates = [
    process.env.STRATAT_DATA_DIR
      ? join(process.env.STRATAT_DATA_DIR, "../../../../scripts/content/out")
      : null,
    join(process.cwd(), "../../scripts/content/out"),
    join(process.cwd(), "../../../../../scripts/content/out"),
    join(process.cwd(), "scripts/content/out"),
  ].filter((candidate): candidate is string => Boolean(candidate));

  for (const dir of candidates) {
    if (existsSync(dir)) return dir;
  }
  return candidates[0] ?? join(process.cwd(), "../../scripts/content/out");
}

const IS_BUILD = process.env.NEXT_PHASE === "phase-production-build";
const REFRESH_CHECK_MS = 5_000;

let cache: {
  dir: string;
  fingerprint: string;
  checkedAt: number;
  items: Article[];
} | null = null;

/** Cheap directory signature: locale dir mtimes + file counts. Detects publish/add/remove in O(locales). */
function dirFingerprint(dir: string): string {
  if (!existsSync(dir)) return "missing";
  try {
    const rootStat = statSync(dir);
    const parts = [`root:${rootStat.mtimeMs}`];
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const sub = join(dir, entry.name);
      const st = statSync(sub);
      let latestFileMtime = 0;
      let count = 0;
      for (const file of readdirSync(sub)) {
        if (!file.endsWith(".json")) continue;
        count++;
        try {
          const fm = statSync(join(sub, file)).mtimeMs;
          if (fm > latestFileMtime) latestFileMtime = fm;
        } catch {
          // ignore transient atomic rename
        }
      }
      parts.push(`${entry.name}:${st.mtimeMs}:${count}:${latestFileMtime}`);
    }
    return parts.sort().join("|");
  } catch {
    return "error";
  }
}

function readAll(): Article[] {
  const dir = resolveContentDir();
  const now = Date.now();
  if (cache && cache.dir === dir) {
    // During `next build`, the corpus is frozen for the duration of the build.
    if (IS_BUILD) return cache.items;
    if (now - cache.checkedAt < REFRESH_CHECK_MS) return cache.items;
    const fp = dirFingerprint(dir);
    cache.checkedAt = now;
    if (fp === cache.fingerprint) return cache.items;
  }

  const all: Article[] = [];
  if (!existsSync(dir)) {
    cache = { dir, fingerprint: "missing", checkedAt: now, items: all };
    return all;
  }

  for (const locale of readdirSync(dir, { withFileTypes: true })) {
    if (!locale.isDirectory()) continue;
    const sub = join(dir, locale.name);
    for (const file of readdirSync(sub)) {
      if (!file.endsWith(".json")) continue;
      try {
        const parsed = JSON.parse(readFileSync(join(sub, file), "utf8")) as Article;
        if (parsed?.article?.body) all.push(parsed);
      } catch {
        // A half-written file must not break rendering; generator writes atomically.
      }
    }
  }

  cache = { dir, fingerprint: dirFingerprint(dir), checkedAt: now, items: all };
  return all;
}

/** Force the next read to reload from disk (used by on-demand revalidation). */
export function resetArticleCache(): void {
  cache = null;
}

/**
 * Only `live` articles are public. The generator writes `scheduled`; `publish.mjs` flips an
 * article to `live` on its publish day, which is what keeps 1000 pages from appearing at once.
 */
export function getLiveArticles(locale?: string): Article[] {
  return readAll().filter(
    (a) => a.status === "live" && (!locale || a.locale === locale),
  );
}

export function getLiveArticlesByKind(locale: string, kind: string): Article[] {
  return getLiveArticles(locale)
    .filter((a) => a.kind === kind)
    .sort((a, b) => (b.publishedAt ?? b.publishAt).localeCompare(a.publishedAt ?? a.publishAt) || a.order - b.order);
}

export function liveGuideKinds(locale: string): string[] {
  return [...new Set(getLiveArticles(locale).map((a) => a.kind))];
}

export function getArticle(locale: string, slug: string): Article | undefined {
  return readAll().find((a) => a.locale === locale && a.slug === slug && a.status === "live");
}

/** Slug → locales that published it, so hreflang and the switcher never point at a 404. */
export function localesForSlug(slug: string): string[] {
  return readAll()
    .filter((a) => a.slug === slug && a.status === "live")
    .map((a) => a.locale);
}

/**
 * Built on demand for tests or tooling. Do NOT pass this whole map into `LocaleLayout`: doing so
 * serialized hundreds of slugs into the RSC flight payload of every page on the site.
 */
export function guideLocaleMap(): Record<string, string[]> {
  const map: Record<string, string[]> = {};
  for (const article of getLiveArticles()) {
    (map[article.slug] ??= []).push(article.locale);
  }
  return map;
}

export function articleLocales(): string[] {
  return [...new Set(readAll().map((a) => a.locale))];
}

/**
 * Guides whose prose names a card, for the "mentioned in" block on its detail page.
 *
 * `linkifyMentions` already sends readers from a guide to the card; without the reverse edge
 * that is a one-way street, and 3,209 pages would have no inbound link except their own series
 * list. Matching is on the exact card name so "RTX 4090" does not answer for "RTX 4090 D".
 */
export function guidesMentioning(locale: string, name: string, limit = 4): Article[] {
  const needle = name.trim().toLowerCase();
  // "300" or "6326" would match every speed and every year in a guide; see `isLinkableName`.
  if (!needle || !isLinkableName(needle)) return [];
  const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`(?<![\\w-])${escaped}(?![\\w-])`, "i");
  return getLiveArticles(locale)
    .filter((article) => pattern.test(article.article.body))
    .sort((a, b) => b.publishAt.localeCompare(a.publishAt) || a.slug.localeCompare(b.slug))
    .slice(0, limit);
}

/** Guides tied directly to a benchmark rig (by rig id/slug or explicit mention), newest first. */
export function guidesForRig(locale: string, rigId: string, rigName: string, limit = 4): Article[] {
  const live = getLiveArticles(locale);
  const direct = live.filter(
    (a) =>
      a.slug.startsWith(`${rigId}-`) ||
      a.slug.includes(`-${rigId}`) ||
      a.slug.includes(rigName.toLowerCase().replace(/[^a-z0-9]+/g, "-")),
  );
  const mentioned = guidesMentioning(locale, rigName, limit * 2);
  const seen = new Set<string>();
  const out: Article[] = [];
  for (const article of [...direct, ...mentioned]) {
    if (seen.has(article.slug)) continue;
    seen.add(article.slug);
    out.push(article);
    if (out.length >= limit) break;
  }
  return out;
}
