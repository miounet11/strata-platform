/**
 * Free X intake via self-hosted twscrape bridge (e.g. github.com/w95/x-api).
 * Uses your browser session cookies — no pay-per-post Developer API.
 *
 *   INTAKE_CHEAP_X_URL=http://127.0.0.1:8080
 */
import { inferTags, inferTopics, slug } from "./lib.mjs";

export function cheapXBaseUrl() {
  const raw = process.env.INTAKE_CHEAP_X_URL || process.env.CHEAP_X_URL || "";
  return raw.replace(/\/$/, "");
}

export function cheapXEnabled() {
  return cheapXBaseUrl().length > 0;
}

function tweetToSignal(tw, meta = {}) {
  const text = tw.text ?? "";
  const author = tw.user?.username ?? meta.author ?? "unknown";
  const id = tw.id ? `x-${tw.id}` : `cheap-${slug(text)}`;
  const publishedAt = tw.date ? new Date(tw.date).toISOString() : new Date().toISOString();
  return {
    id,
    type: "signal",
    title: text.slice(0, 200),
    body: text.slice(0, 4000),
    url: tw.url ?? `https://x.com/${author}/status/${tw.id}`,
    publishedAt,
    author,
    source: meta.source ?? "cheap-x",
    locales: ["en"],
    tags: inferTags(text),
    topics: inferTopics(text),
  };
}

async function getJson(path, timeoutMs = 60000) {
  const base = cheapXBaseUrl();
  const res = await fetch(`${base}${path}`, {
    signal: AbortSignal.timeout(timeoutMs),
    headers: { Accept: "application/json", "User-Agent": "stratat-intake/1.0" },
  });
  if (!res.ok) return null;
  return res.json();
}

export async function probeCheapX() {
  const base = cheapXBaseUrl();
  if (!base) return { ok: false, reason: "INTAKE_CHEAP_X_URL not set" };
  try {
    const h = await getJson("/healthz", 15000);
    return { ok: Boolean(h?.ok), base };
  } catch (e) {
    return { ok: false, reason: e.message, base };
  }
}

export async function fetchCheapXUserTweets(handle, limit = 10) {
  if (!cheapXEnabled()) return [];
  const json = await getJson(
    `/api/user/${encodeURIComponent(handle)}/tweets?limit=${limit}&include_replies=false`,
  );
  if (!json?.tweets?.length) return [];
  return json.tweets.map((tw) =>
    tweetToSignal(tw, { author: handle, source: `cheap-x:user:${handle}` }),
  );
}

export async function fetchCheapXSearch(query, limit = 10) {
  if (!cheapXEnabled()) return [];
  const q = encodeURIComponent(`${query} -is:retweet lang:en`);
  const json = await getJson(`/api/search?q=${q}&limit=${limit}`);
  if (!json?.tweets?.length) return [];
  return json.tweets.map((tw) =>
    tweetToSignal(tw, { source: `cheap-x:search:${slug(query)}` }),
  );
}
