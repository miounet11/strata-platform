// Collectors. One function per signal, each returning the same shape:
//
//   { source, terms: [{ term, count, detail }], error?: string }
//
// A collector never throws. A signal that is down must not stop the others: the upstream project
// behaves the same way (its README lists per-signal degradation), and without it a GitHub rate
// limit would mean no radar output at all. The caller records `error` and carries on.
//
// `count` is per distinct place the term appeared (repo, model, URL), not raw occurrences, so one
// prolific account cannot fake a wave.

import { SKIP_WORDS, STOP_WORDS } from "./config.mjs";

const UA = "stratat-term-radar/1.0 (+https://www.stratat.com)";

/**
 * A directory's own vocabulary is not a new term. Live run on 2026-10-23 over four AI-tool
 * sitemaps produced `quantum`, `llms`, `llama`, `quant` — every one of them a section word the
 * directories have carried for years, lifted only because `lift` is computed against a baseline
 * that the first run does not have. Dropping stop words before the lift test removes that class
 * entirely; the words that survive are product names.
 */
function isSiteVocabulary(word) {
  return STOP_WORDS.has(word) || SKIP_WORDS.has(word);
}

// First path segments that are Hugging Face's own pages, never an owner of a model. Observed
// leaking into the trending list as `join/discord`, `inference/models`, `settings/hardware`,
// `tasks/...`, `papers/...`, `pricing/...`, `datasets/...` — all of which read as model ids.
const HF_SITE_SEGMENTS = new Set([
  "join", "inference", "settings", "tasks", "papers", "pricing", "datasets", "spaces",
  "models", "docs", "blog", "learn", "login", "logout", "oauth", "organizations", "new",
  "search", "trending", "collections", "posts", "audio", "image", "video", "text",
]);

async function getJson(url, { headers = {}, timeoutMs = 30000 } = {}) {
  const res = await fetch(url, {
    headers: { "User-Agent": UA, Accept: "application/json", ...headers },
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.json();
}

async function getText(url, { timeoutMs = 30000 } = {}) {
  const res = await fetch(url, {
    headers: { "User-Agent": UA },
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.text();
}

/**
 * Repos that are new and accelerating.
 *
 * GitHub's search API cannot sort by star velocity, so the query asks for recently created repos
 * with a star floor and the velocity test happens here. The upstream project uses the same
 * two-part rule (average stars/day while young, or a large jump since yesterday); the delta half
 * needs a stored snapshot, which the state file provides.
 */
export async function collectGithub(cfg, previous) {
  const since = new Date(Date.now() - cfg.windowDays * 86400_000).toISOString().slice(0, 10);
  const url =
    `https://api.github.com/search/repositories?q=created:>${since}+stars:>100` +
    `&sort=stars&order=desc&per_page=${cfg.perPage}`;

  const headers = {};
  // Optional: a token raises the limit from 60 to 5000 requests an hour. Absence is not an error.
  if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;

  const json = await getJson(url, { headers });
  const items = json.items ?? [];
  const now = Date.now();
  const terms = [];

  for (const repo of items) {
    const created = Date.parse(repo.created_at);
    if (!Number.isFinite(created)) continue;
    const ageDays = Math.max(1, (now - created) / 86400_000);
    const stars = repo.stargazers_count ?? 0;
    const perDay = stars / ageDays;
    const priorStars = previous?.github?.[repo.full_name];
    const delta = typeof priorStars === "number" ? stars - priorStars : 0;

    if (perDay < cfg.minStarsPerDay && delta < cfg.minStarDelta) continue;

    // The repo name is the term people will search for; the description contributes name-like
    // phrases (a project often names the model or technique it implements).
    terms.push({
      term: repo.name,
      count: 1,
      detail: `${repo.full_name} · ${stars}★ · ${perDay.toFixed(0)}/day`,
    });
  }

  // Persist today's star counts for the delta rule on the next run.
  const snapshot = {};
  for (const repo of items) snapshot[repo.full_name] = repo.stargazers_count ?? 0;

  return { source: "github", terms, snapshot };
}

/**
 * Models and Spaces that are new to the trending list.
 *
 * Hugging Face has no trending API, but its website renders the trending list server-side, so the
 * model ids are read from the HTML. A model id is already the thing people search for
 * (`Qwen/Qwen3-8B` → `qwen3 8b`), which is why this signal is worth the parsing.
 */
export async function collectHuggingFace(cfg) {
  const html = await getText("https://huggingface.co/models?sort=trending");
  const ids = new Set();
  for (const m of html.matchAll(/href="\/([\w.\-]+\/[\w.\-]+)"/g)) {
    const id = m[1];
    // Skip nav and asset paths: a real model id has an owner and no file extension.
    if (/\.(png|jpg|svg|css|js|json|xml)$/i.test(id)) continue;
    if (id.startsWith("api/") || id.startsWith("docs/")) continue;
    // The page's own chrome also matches the owner/name shape. These rendered as real "terms" in
    // a live run (`join/discord`, `inference/models`, `settings/hardware`), so they are excluded
    // by their first segment rather than by a growing list of exact pairs.
    if (HF_SITE_SEGMENTS.has(id.split("/")[0])) continue;
    ids.add(id);
    if (ids.size >= cfg.limit) break;
  }

  const terms = [];
  for (const id of ids) {
    const name = id.split("/")[1];
    if (!name) continue;
    terms.push({
      term: name.replace(/[-_]/g, " "),
      count: 1,
      detail: `huggingface.co/${id}`,
    });
  }

  return { source: "huggingface", terms };
}

/**
 * Words shared by several new URLs on a directory, that its older URLs rarely carried.
 *
 * Sitemaps are the cheapest way to see what an industry is *naming things* this month: a
 * directory's new pages are named after products that just launched. The upstream project does
 * exactly this and calls it signal ③.
 *
 * `lastmod` is optional in sitemaps and often absent, so "new" means "in the URL set now but not
 * in the snapshot from the previous run" — that needs no dates and is correct for a daily radar.
 */
export async function collectSitemaps(cfg, previous) {
  const seenBefore = new Set(previous?.sitemaps ?? []);
  const fresh = new Map(); // term -> Set(url), from URLs this site did not have before
  const baseline = new Map(); // term -> Set(url), from URLs it already had
  const failures = []; // directory -> why it contributed nothing this run
  const hostsOk = new Set(); // directories that answered, so their URL set is authoritative
  let urlsRead = 0;

  // A directory that never answered before has no baseline, so every one of its URLs would read
  // as "new" and its entire vocabulary would arrive as a surge. That is exactly what adding
  // aitoptools' working sitemap URL did on 2026-10-23: 19,829 URLs, all fresh, `blog` at lift 39.
  // A host's first successful read is baseline only — the same rule the first run applies to
  // every host, applied per host so one recovered directory cannot flood the radar.
  const hostsSeenBefore = new Set();
  for (const u of seenBefore) {
    try {
      hostsSeenBefore.add(new URL(u).host);
    } catch {
      // Ignore malformed leftovers; they cannot anchor a baseline anyway.
    }
  }

  for (const sitemapUrl of cfg.urls) {
    let xml;
    try {
      xml = await getText(sitemapUrl);
    } catch (err) {
      // One unreachable directory must not lose the others — but it has to be *visible*. On
      // 2026-10-23 three of the four configured directories were dead (toolify unreachable,
      // aitoptools' index URL a 404, futurepedia a 308 to www) and this loop reported nothing,
      // so a radar with no working source looked exactly like a quiet week with no new names.
      failures.push(`${new URL(sitemapUrl).host}: ${String(err?.message ?? err).slice(0, 80)}`);
      continue;
    }

    const locs = [...xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)].map((m) => m[1]).slice(0, cfg.maxUrls);

    // A sitemap index points at child sitemaps; one level is enough for these directories.
    const pages =
      locs.length && locs.every((l) => /\.xml(\.gz)?$/i.test(l))
        ? (
            await Promise.all(
              locs.slice(0, 5).map(async (child) => {
                try {
                  const childXml = await getText(child);
                  return [...childXml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)].map((m) => m[1]);
                } catch {
                  return [];
                }
              }),
            )
          ).flat()
        : locs;

    const host = new URL(sitemapUrl).host;
    if (pages.length === 0) failures.push(`${host}: sitemap had no <loc> entries`);
    else hostsOk.add(host);
    urlsRead += pages.length;
    // Everything from a first-time host goes to the baseline, not to the fresh set.
    const isNewHost = !hostsSeenBefore.has(host);
    if (isNewHost && pages.length) {
      failures.push(`${host}: first read, recorded as baseline (surges start next run)`);
    }
    for (const u of pages) {
      addUrlTerms(isNewHost || seenBefore.has(u) ? baseline : fresh, u);
    }
  }

  // A term has to be *newer* than the directory's own vocabulary, not merely frequent. Without
  // this, a directory's section names (`courses`, `tools`, `leaderboard`) arrive as "new terms"
  // on the first run: they appear in every new URL simply because the paths contain them.
  //
  // `ratio` scales the baseline to the size of the recent window. The first run has no baseline
  // at all, so it reports nothing — the snapshot it returns becomes the baseline for the next
  // run, which is the same choice the upstream project makes.
  const hasBaseline = baseline.size > 0;
  const ratio = fresh.size / Math.max(baseline.size, 1);
  const rows = [];

  for (const [term, urls] of fresh) {
    if (urls.size < cfg.minNewUrls) continue;
    const old = baseline.get(term)?.size ?? 0;
    const lift = urls.size / (old * ratio + 1);
    // A term the old URLs already carried as often as the new ones is not a surge.
    if (hasBaseline && lift < 1.5) continue;
    rows.push({ term, count: urls.size, lift, detail: `${urls.size} new URLs, ${old} old` });
  }

  rows.sort((a, b) => b.lift - a.lift || b.count - a.count);


  // Keep "flux 2 dev" and drop "flux" when both surge on the same pages.
  const terms = [];
  for (const row of rows) {
    const nested = terms.some((k) => row.term.split(" ").includes(k.term) && row.count <= k.count);
    if (!nested) terms.push(row);
  }

  // A directory that is gone and a directory that is quiet both yield zero terms, so the failure
  // has to be carried out of here. When every configured directory failed the error says so;
  // a partial failure is still reported, because a radar quietly running on one source is a
  // different thing from one running on all of them.
  const error = [
    urlsRead === 0 ? "no directory answered" : null,
    failures.length ? failures.join("; ") : null,
    hasBaseline ? null : "first run: baseline recorded, surges start next run",
  ]
    .filter(Boolean)
    .join(" — ");

  // The snapshot never shrinks. "New" is decided by set difference against it, so any URL that
  // leaves it comes back as a fake surge on the next run — and URLs leave for reasons that have
  // nothing to do with the product being new: a directory that did not answer, a sitemap index
  // whose child list was truncated by `maxUrls`, a gzip response that failed mid-read. Measured
  // on 2026-10-23: a single run read 19,829 URLs against a 83,245-URL baseline, and a shrinking
  // snapshot would have re-announced 63,416 of them as new the next morning. Union, not replace.
  const snapshot = [...new Set([...seenBefore, ...[...fresh.values(), ...baseline.values()].flatMap((s) => [...s])])];

  return {
    source: "sitemaps",
    terms,
    // Monotonic by construction: today's reads plus everything already known, so the next run
    // can only ever see genuinely new URLs as new.
    snapshot,
    error: error || undefined,
  };
}

/** Words from a URL path, which is where a directory puts the product name. */
function addUrlTerms(map, url) {
  let path;
  try {
    path = new URL(url).pathname;
  } catch {
    return;
  }
  const parts = path.split("/").filter(Boolean);
  for (const part of parts) {
    for (const word of part.toLowerCase().split(/[-_]+/)) {
      if (word.length < 4) continue;
      if (isSiteVocabulary(word)) continue;
      if (!map.has(word)) map.set(word, new Set());
      map.get(word).add(url);
    }
  }
  // The last path segment is usually the product slug; its full form is a better term than its
  // words when it is multi-word ("flux-2-dev").
  const last = parts[parts.length - 1];
  if (last) {
    const phrase = last.toLowerCase().replace(/[-_]+/g, " ").trim();
    if (phrase.split(" ").length >= 2) {
      if (!map.has(phrase)) map.set(phrase, new Set());
      map.get(phrase).add(url);
    }
  }
}

/**
 * Run every enabled collector.
 *
 * Each result carries `error` instead of throwing, and a failing signal contributes an empty
 * term list so the run still produces a report. The reasons are what the caller logs; a radar
 * that silently returns nothing is indistinguishable from a quiet week.
 */
export async function collectAll(config, previous) {
  const jobs = [];
  const { SOURCES } = config;

  if (SOURCES.github.enabled) jobs.push(["github", () => collectGithub(SOURCES.github, previous)]);
  if (SOURCES.huggingface.enabled) jobs.push(["huggingface", () => collectHuggingFace(SOURCES.huggingface)]);
  if (SOURCES.sitemaps.enabled) jobs.push(["sitemaps", () => collectSitemaps(SOURCES.sitemaps, previous)]);

  const results = await Promise.all(
    jobs.map(async ([name, run]) => {
      try {
        return await run();
      } catch (err) {
        return { source: name, terms: [], error: String(err?.message ?? err).slice(0, 200) };
      }
    }),
  );

  return results;
}
