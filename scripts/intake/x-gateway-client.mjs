/**
 * X data gateway client (self-hosted async job queue; see docs/INTAKE-GATEWAY.md).
 * Cloak headless browser worker — $0, no Developer API billing.
 * Docs: docs/INTAKE-CHEAP.md (gateway section)
 *
 * Env:
 *   X_GATEWAY_URL   (required; e.g. http://127.0.0.1:8790)
 *   X_GATEWAY_KEY   (project key, e.g. xk_a_...)
 */
import { inferTags, inferTopics, slug } from "./lib.mjs";

export function gatewayUrl() {
  return (process.env.X_GATEWAY_URL || "http://127.0.0.1:8790").replace(/\/$/, "");
}

export function gatewayKey() {
  return process.env.X_GATEWAY_KEY || "";
}

export function gatewayEnabled() {
  return gatewayKey().length > 0;
}

async function call(path, opts = {}) {
  const res = await fetch(`${gatewayUrl()}${path}`, {
    signal: AbortSignal.timeout(opts.timeoutMs ?? 30000),
    headers: {
      "X-API-Key": gatewayKey(),
      ...(opts.body ? { "Content-Type": "application/json" } : {}),
    },
    ...(opts.body ? { method: "POST", body: JSON.stringify(opts.body) } : {}),
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json };
}

/**
 * Submit a job and poll until done. Returns result object or null on failure.
 * type: "user_posts" | "post" | "search" | "user_profile"
 */
export async function gatewayFetch(type, params, { timeoutMs = 600000, pollMs = 20000 } = {}) {
  if (!gatewayEnabled()) return null;
  const sub = await call("/v1/jobs", { method: "POST", body: { type, params } });
  if (sub.status === 429 || sub.status === 503) {
    console.warn(`[x-gateway] ${sub.status} ${sub.json?.error ?? ""} — skip this round`);
    return null;
  }
  const jobId = sub.json?.job_id;
  if (!jobId) {
    console.warn(`[x-gateway] submit failed: ${sub.status} ${JSON.stringify(sub.json).slice(0, 200)}`);
    return null;
  }
  if (sub.json?.cached && sub.json?.status === "done") {
    const done = await call(`/v1/jobs/${jobId}`);
    return done.json?.result ?? null;
  }
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    await new Promise((r) => setTimeout(r, pollMs));
    const r = await call(`/v1/jobs/${jobId}`);
    if (r.json?.status === "done") return r.json.result;
    if (r.json?.status === "error") {
      console.warn(`[x-gateway] job ${jobId} error: ${r.json.error}`);
      return null;
    }
  }
  console.warn(`[x-gateway] job ${jobId} timeout`);
  return null;
}

function postToSignal(p, meta = {}) {
  const text = p.text ?? "";
  const author = p.author ?? meta.author ?? "unknown";
  const id = p.id ? `x-${p.id}` : `gw-${slug(text)}`;
  const publishedAt = p.created_at
    ? new Date(p.created_at).toISOString()
    : new Date().toISOString();
  return {
    id,
    type: "signal",
    title: text.slice(0, 200),
    body: text.slice(0, 4000),
    url: p.url ?? `https://x.com/${author}/status/${p.id}`,
    publishedAt,
    author,
    source: meta.source ?? "x-gateway",
    locales: ["en"],
    tags: inferTags(text),
    topics: inferTopics(text),
  };
}

export async function fetchGatewayUserTweets(handle, limit = 10) {
  const result = await gatewayFetch("user_posts", { username: handle, limit });
  if (!result?.posts?.length) return [];
  return result.posts.map((p) =>
    postToSignal(p, { author: handle, source: `x-gateway:user:${handle}` }),
  );
}

export async function fetchGatewaySearch(query, limit = 10, mode = "latest") {
  const result = await gatewayFetch("search", { q: query, limit, mode });
  if (!result?.posts?.length && !Array.isArray(result)) return [];
  const posts = result?.posts ?? result ?? [];
  return posts.map((p) => postToSignal(p, { source: `x-gateway:search:${slug(query)}` }));
}

export async function fetchGatewayProfile(handle) {
  return gatewayFetch("user_profile", { username: handle });
}

/** Quota check for logging */
export async function gatewayQuota() {
  const { json } = await call("/v1/quota");
  return json;
}
