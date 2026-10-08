/**
 * Shared X/RSS intake helpers (RSSHub mirrors, X API v2, merge, GPU quote extraction).
 */

export function slug(s) {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fff]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
}

export function extractTag(block, tag) {
  const m = block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "i"));
  return m?.[1]?.trim();
}

export function parseRssItems(xml, meta = {}) {
  const items = [];
  const chunks = xml.split("<item>").slice(1);
  for (const chunk of chunks) {
    const title = extractTag(chunk, "title");
    const link = extractTag(chunk, "link");
    const pubDate = extractTag(chunk, "pubDate");
    const description = extractTag(chunk, "description")?.replace(/<[^>]+>/g, " ").trim();
    const text = `${title ?? ""} ${description ?? ""}`.trim();
    if (!link && !text) continue;
    const statusId = link?.match(/status\/(\d+)/)?.[1];
    const id = statusId ? `x-${statusId}` : `rss-${slug(text || link)}`;
    items.push({
      id,
      type: "signal",
      title: (title ?? description ?? text).slice(0, 200),
      body: (description ?? title ?? text).slice(0, 4000),
      url: link ?? meta.fallbackUrl ?? "https://x.com",
      publishedAt: pubDate ? new Date(pubDate).toISOString() : new Date().toISOString(),
      author: meta.author ?? "x",
      source: meta.source ?? "rsshub",
      locales: ["en"],
      tags: inferTags(text),
      topics: inferTopics(text),
    });
  }
  return items;
}

export function inferTags(text) {
  const t = text.toLowerCase();
  const tags = [];
  if (/strix|halo|gfx1151|780m|igpu|apu/.test(t)) tags.push("hardware");
  if (/bench|tok\/s|toks|tokens\/s|performance|faster|t\/s/.test(t)) tags.push("benchmark");
  if (/qwen|flash|27b|llama|gguf|moe|deepseek/.test(t)) tags.push("models");
  if (/strata/.test(t)) tags.push("strata");
  if (/release|v0\.1|github|ship/.test(t)) tags.push("release");
  if (/amd|nvidia|rtx|rx |radeon|hip|cuda/.test(t)) tags.push("gpu");
  if (/\$|usd|msrp|price|报价|价格|元|万/.test(t)) tags.push("pricing");
  if (/install|setup|deploy|本地|部署/.test(t)) tags.push("deploy");
  if (/vs\.?|versus|compared|comparison|faster than|slower than|beat |beats |against other|wins by|margin against/.test(t))
    tags.push("comparison");
  if (/llama\.cpp|vllm|ollama|exllama|kobold|jan\.ai|lm studio/.test(t)) tags.push("comparison");
  if (/upgraded|upgrade|update\.sh|migrated|switched to|moved to|after (using|installing)|coming from|used to run|from v0\./.test(t)) tags.push("upgrade");
  if (/release|v0\.1\.|changelog|ship(ped)?/.test(t) && /strata/.test(t)) tags.push("upgrade");
  return tags.length ? tags : ["signal"];
}

export function inferTopics(text) {
  const t = text.toLowerCase();
  const topics = [];
  if (/strata/.test(t)) topics.push("strata");
  if (/local|本地|self-host|on-prem/.test(t)) topics.push("local-deploy");
  if (/price|msrp|\$|报价|价格/.test(t)) topics.push("gpu-pricing");
  if (/qwen|flash|model|gguf/.test(t)) topics.push("models");
  if (/vs\.?|versus|compared|comparison|llama\.cpp|vllm|ollama/.test(t)) topics.push("comparison");
  if (/upgraded|upgrade|migrated|switched|after (using|installing)|update\.sh/.test(t)) topics.push("upgrade");
  return topics;
}

export function isXSource(signal) {
  if (signal.id?.startsWith("x-") || signal.id?.startsWith("gw-")) return true;
  const src = signal.source ?? "";
  return (
    src.startsWith("x-api") ||
    src.startsWith("x-gateway") ||
    src.startsWith("cheap-x") ||
    src.startsWith("rsshub") ||
    src === "creator-x"
  );
}

function hasLane(signal, name) {
  return signal.tags?.includes(name) || signal.topics?.includes(name);
}

/**
 * Each X post lands in one lane: upgrade, then comparison/benchmark, otherwise latest.
 * Pages read these arrays and do not show the same post twice.
 */
export function bucketXFeeds(signals) {
  const upgradeNotes = [];
  const comparisons = [];
  const xLatest = [];
  for (const signal of signals) {
    if (!isXSource(signal) || signal.source === "seed") continue;
    if (hasLane(signal, "upgrade")) upgradeNotes.push(signal);
    else if (hasLane(signal, "comparison") || hasLane(signal, "benchmark")) comparisons.push(signal);
    else xLatest.push(signal);
  }
  return {
    xLatest: xLatest.slice(0, 40),
    comparisons: comparisons.slice(0, 24),
    upgradeNotes: upgradeNotes.slice(0, 24),
  };
}

export function isRelevant(text, keywords) {
  const t = text.toLowerCase();
  return keywords.some((k) => t.includes(k.toLowerCase()));
}

export function mergeById(existing, incoming) {
  const map = new Map();
  for (const p of [...existing, ...incoming]) map.set(p.id, p);
  return [...map.values()].sort(
    (a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime(),
  );
}

export async function fetchUrlWithMirrors(path, bases, opts = {}) {
  for (const base of bases) {
    const url = `${base.replace(/\/$/, "")}${path}`;
    try {
      const res = await fetch(url, {
        headers: { "User-Agent": opts.userAgent ?? "stratat-intake/1.0" },
        signal: AbortSignal.timeout(opts.timeoutMs ?? 8000),
      });
      if (!res.ok) continue;
      return { url, body: await res.text() };
    } catch {
      /* next mirror */
    }
  }
  return null;
}

export async function fetchRssHubUser(handle, bases) {
  const got = await fetchUrlWithMirrors(`/twitter/user/${handle}`, bases);
  if (!got?.body?.includes("<item>")) return [];
  return parseRssItems(got.body, {
    author: handle,
    source: `rsshub:user:${handle}`,
    fallbackUrl: `https://x.com/${handle}`,
  });
}

export async function fetchRssHubSearch(query, bases) {
  const encoded = encodeURIComponent(query);
  const paths = [`/twitter/search/${encoded}`, `/twitter/keyword/${encoded}`];
  for (const path of paths) {
    const got = await fetchUrlWithMirrors(path, bases);
    if (got?.body?.includes("<item>")) {
      return parseRssItems(got.body, {
        author: "search",
        source: `rsshub:search:${slug(query)}`,
        fallbackUrl: `https://x.com/search?q=${encoded}`,
      });
    }
  }
  return [];
}

export async function fetchXUserTweets(token, username, opts = {}) {
  const maxResults = opts.maxResults ?? 20;
  const counter = opts.counter;
  const cachedId = opts.cachedUserId;
  let userId = cachedId;
  if (!userId) {
    const userRes = await fetch(
      `https://api.twitter.com/2/users/by/username/${username}?user.fields=username`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    counter?.bump(1);
    if (!userRes.ok) return { rows: [], userId: null };
    const { data: user } = await userRes.json();
    userId = user?.id;
  }
  if (!userId) return { rows: [], userId: null };
  const tl = await fetch(
    `https://api.twitter.com/2/users/${userId}/tweets?max_results=${maxResults}&tweet.fields=created_at,public_metrics&exclude=retweets,replies`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  counter?.bump(1);
  if (!tl.ok) return { rows: [], userId };
  const { data } = await tl.json();
  const rows = (data ?? []).map((tw) => ({
    id: `x-${tw.id}`,
    type: "signal",
    title: tw.text.slice(0, 200),
    body: tw.text.slice(0, 4000),
    url: `https://x.com/${username}/status/${tw.id}`,
    publishedAt: tw.created_at,
    author: username,
    source: "x-api:user",
    locales: ["en"],
    tags: inferTags(tw.text),
    topics: inferTopics(tw.text),
    metrics: tw.public_metrics,
  }));
  if (counter) counter.tweets += rows.length;
  return { rows, userId };
}

export async function fetchXSearchRecent(token, query, opts = {}) {
  const maxResults = opts.maxResults ?? 20;
  const counter = opts.counter;
  const q = encodeURIComponent(`${query} -is:retweet lang:en`);
  const res = await fetch(
    `https://api.twitter.com/2/tweets/search/recent?max_results=${maxResults}&query=${q}&tweet.fields=created_at,author_id&expansions=author_id&user.fields=username`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  counter?.bump(1);
  if (!res.ok) return [];
  const json = await res.json();
  const users = new Map((json.includes?.users ?? []).map((u) => [u.id, u.username]));
  const rows = (json.data ?? []).map((tw) => {
    const author = users.get(tw.author_id) ?? "unknown";
    const text = tw.text ?? "";
    return {
      id: `x-${tw.id}`,
      type: "signal",
      title: text.slice(0, 200),
      body: text.slice(0, 4000),
      url: `https://x.com/${author}/status/${tw.id}`,
      publishedAt: tw.created_at,
      author,
      source: `x-api:search:${slug(query)}`,
      locales: ["en"],
      tags: inferTags(text),
      topics: inferTopics(text),
    };
  });
  if (counter) counter.tweets += rows.length;
  return rows;
}

/** Pull $/USD/CNY-ish GPU price mentions from post text */
export function extractGpuQuotesFromSignals(signals) {
  const quotes = [];
  const seen = new Set();
  const gpuRe =
    /(?:RTX|GTX|RX)\s*[\d]{3,4}(?:\s*(?:Ti|Super|XT|XTX))?(?:\s*(?:\d+\s*GB))?/gi;
  const moneyRe =
    /(?:\$|USD\s*|US\$)\s*([\d,]+(?:\.\d{2})?)|([\d,]+(?:\.\d{2})?)\s*(?:USD|usd)|(?:¥|￥|CNY|RMB)\s*([\d,]+(?:\.\d{2})?)|([\d.]+)\s*万(?:元)?/g;

  for (const s of signals) {
    const text = `${s.title} ${s.body}`;
    if (!/price|msrp|\$|usd|报价|价格|元|万|deal|discount/i.test(text)) continue;
    const gpus = [...text.matchAll(gpuRe)].map((m) => m[0].replace(/\s+/g, " ").trim());
    if (!gpus.length && !/rtx|rx \d|显卡/i.test(text)) continue;

    let currency = "USD";
    let amount = null;
    for (const m of text.matchAll(moneyRe)) {
      if (m[1]) {
        amount = parseFloat(m[1].replace(/,/g, ""));
        currency = "USD";
        break;
      }
      if (m[2]) {
        amount = parseFloat(m[2].replace(/,/g, ""));
        currency = "USD";
        break;
      }
      if (m[3]) {
        amount = parseFloat(m[3].replace(/,/g, ""));
        currency = "CNY";
        break;
      }
      if (m[4]) {
        amount = parseFloat(m[4]) * 10000;
        currency = "CNY";
        break;
      }
    }
    if (amount == null || amount <= 0) continue;

    const model = gpus[0] ?? "GPU (mentioned)";
    const key = `${model}-${amount}-${currency}-${s.id}`;
    if (seen.has(key)) continue;
    seen.add(key);

    quotes.push({
      id: `gpu-${slug(key)}`,
      model,
      amount,
      currency,
      asOf: s.publishedAt,
      sourceUrl: s.url,
      sourceAuthor: s.author,
      snippet: text.slice(0, 280),
      confidence: gpus.length ? "medium" : "low",
    });
  }

  return quotes.sort((a, b) => new Date(b.asOf).getTime() - new Date(a.asOf).getTime());
}
