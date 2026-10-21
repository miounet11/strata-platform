import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

export type Faq = { q: string; a: string };

export type Article = {
  id: string;
  locale: string;
  kind: string;
  slug: string;
  path: string;
  order: number;
  publishAt: string;
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
};

/**
 * Articles live outside the app so the generator can write them without touching src.
 * `CONTENT_OUT` lets a release build read a curated directory instead of the working tree.
 */
const CONTENT_DIR = process.env.CONTENT_OUT
  ? join(process.cwd(), process.env.CONTENT_OUT)
  : join(process.cwd(), "../../scripts/content/out");

let cache: Article[] | null = null;

function readAll(): Article[] {
  if (cache) return cache;
  const all: Article[] = [];
  if (!existsSync(CONTENT_DIR)) {
    cache = [];
    return cache;
  }
  for (const locale of readdirSync(CONTENT_DIR, { withFileTypes: true })) {
    if (!locale.isDirectory()) continue;
    const dir = join(CONTENT_DIR, locale.name);
    for (const file of readdirSync(dir)) {
      if (!file.endsWith(".json")) continue;
      try {
        const parsed = JSON.parse(readFileSync(join(dir, file), "utf8")) as Article;
        if (parsed?.article?.body) all.push(parsed);
      } catch {
        // A half-written file must not break the build; the generator writes atomically, so
        // this can only be a stale file from an interrupted manual run.
      }
    }
  }
  cache = all;
  return all;
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
 * The language switcher runs in the browser and cannot read the content directory, so the
 * build bakes the slug → locales map into a small JSON module. Without it the switcher offers
 * every language for every guide, and six of the seven links 404.
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
