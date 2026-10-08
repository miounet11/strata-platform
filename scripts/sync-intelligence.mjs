#!/usr/bin/env node
/**
 * Continuous-intake batch: X (API + RSSHub) → local deploy / Strata / GPU price signals.
 * Output: apps/www/src/data/intelligence-pulse.json
 *
 * Env: X_BEARER_TOKEN (optional), INTAKE_SOURCES_JSON (override path to sources.json)
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  extractGpuQuotesFromSignals,
  fetchRssHubSearch,
  fetchRssHubUser,
  fetchXSearchRecent,
  fetchXUserTweets,
  isRelevant,
  mergeById,
  bucketXFeeds,
  isXSource,
  inferTags,
  inferTopics,
} from "./intake/lib.mjs";
import {
  budgetUserHandles,
  createRequestCounter,
  getCachedUserId,
  cacheUserId,
  markXApiRun,
  pickRotatingQueries,
  loadXApiState,
  shouldSkipXApi,
  shouldSkipGateway,
  xApiMode,
  xMaxResults,
} from "./intake/x-api-budget.mjs";
import {
  cheapXEnabled,
  fetchCheapXSearch,
  fetchCheapXUserTweets,
} from "./intake/cheap-x-client.mjs";
import {
  fetchGatewaySearch,
  fetchGatewayUserTweets,
  gatewayEnabled,
  gatewayQuota,
} from "./intake/x-gateway-client.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const CREATOR_PATH = join(ROOT, "apps/www/src/data/creator-pulse.json");

function signalsFromCreatorPosts() {
  try {
    const { posts } = JSON.parse(readFileSync(CREATOR_PATH, "utf8"));
    return (posts ?? []).map((p) => {
      const text = `${p.title ?? ""} ${p.body ?? ""}`;
      return {
        id: p.id.startsWith("x-") ? p.id : `x-${p.id}`,
        type: "signal",
        title: p.title?.slice(0, 200) ?? "",
        body: (p.body ?? p.title ?? "").slice(0, 4000),
        url: p.url,
        publishedAt: p.publishedAt,
        author: p.author ?? "coldniko",
        source: "creator-x",
        locales: p.locales ?? ["en"],
        tags: [...new Set([...(p.tags ?? []), ...inferTags(text), "strata"])],
        topics: [...new Set(["strata", ...inferTopics(text)])],
      };
    });
  } catch {
    return [];
  }
}

const OUT = join(ROOT, "apps/www/src/data/intelligence-pulse.json");
const SOURCES_PATH =
  process.env.INTAKE_SOURCES_JSON ?? join(ROOT, "scripts/intake/sources.json");

function loadSources() {
  return JSON.parse(readFileSync(SOURCES_PATH, "utf8"));
}

function loadExisting() {
  try {
    return JSON.parse(readFileSync(OUT, "utf8"));
  } catch {
    return { signals: [], gpuQuotes: [], meta: {} };
  }
}

const COMMUNITY_PATH = join(ROOT, "apps/www/src/data/community.json");

function signalsFromCommunity(limit = 40) {
  try {
    const { issues } = JSON.parse(readFileSync(COMMUNITY_PATH, "utf8"));
    return (issues ?? [])
      .slice()
      .sort(
        (a, b) =>
          (b.comments ?? 0) - (a.comments ?? 0) ||
          new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
      )
      .slice(0, limit)
      .map((i) => ({
        id: `gh-issue-${i.number}`,
        type: "signal",
        title: i.title.slice(0, 200),
        body: i.title.slice(0, 4000),
        url: i.htmlUrl,
        publishedAt: i.updatedAt,
        author: i.author ?? "community",
        source: "github-community",
        locales: ["en"],
        tags: ["strata", "community"],
        topics: ["strata", "local-deploy"],
      }));
  } catch {
    return [];
  }
}

const SEED_SIGNALS = [
  {
    id: "seed-strata-local",
    type: "signal",
    title: "Strata — local Qwen3.8-Flash-Next on consumer GPUs",
    body: "Track releases, tok/s benchmarks, and Strix Halo / NVIDIA paths on stratat.com.",
    url: "https://www.stratat.com/en/install",
    publishedAt: "2026-10-06T12:00:00.000Z",
    author: "stratat",
    source: "seed",
    locales: ["en", "zh"],
    tags: ["strata", "deploy"],
    topics: ["strata", "local-deploy"],
  },
];

export async function runIntelligenceSync() {
  const sources = loadSources();
  const existing = loadExisting();
  const token = process.env.X_BEARER_TOKEN;
  const bases = sources.rsshubBaseUrls ?? ["https://rsshub.app"];
  const keywords = sources.relevanceKeywords ?? [];

  const incoming = [];
  const mode = xApiMode();
  const skipXApi =
    !token || shouldSkipXApi() || ((cheapXEnabled() || gatewayEnabled()) && mode !== "full");
  const maxResults = xMaxResults();
  const counter = createRequestCounter();
  const stats = {
    xApiMode: mode,
    xApiSkipped: skipXApi,
    xRequests: 0,
    xTweets: 0,
    cheapX: 0,
    gateway: 0,
    rsshub: 0,
    users: 0,
    searches: 0,
  };
  const skipNet = process.env.INTAKE_SKIP_NETWORK === "1";
  const state = loadXApiState();
  const rotation = state.searchRotation ?? 0;

  const searchLanes = [
    { name: "general", queries: sources.xSearchQueries ?? [] },
    { name: "comparison", queries: sources.xComparisonQueries ?? [] },
    { name: "upgrade", queries: sources.xUpgradeQueries ?? [] },
    { name: "gpu", queries: sources.gpuPriceQueries ?? [] },
  ];
  const userHandles =
    mode === "full" ? (sources.xUsers ?? []) : budgetUserHandles(sources.xUsers ?? []);
  const laneThisRun = searchLanes[rotation % searchLanes.length];
  const jobs = [];
  for (const handle of userHandles) jobs.push({ kind: "user", item: handle, lane: "user" });
  for (const lane of searchLanes) {
    const queries =
      mode === "full"
        ? lane.queries
        : lane.name === laneThisRun.name
          ? pickRotatingQueries(lane.queries, 1, rotation)
          : [];
    for (const query of queries) jobs.push({ kind: "search", item: query, lane: lane.name });
  }
  const versionQuery = currentReleaseQuery();
  if (versionQuery && !jobs.some((job) => job.kind === "search" && job.item === versionQuery)) {
    jobs.push({ kind: "search", item: versionQuery, lane: "upgrade" });
  }

  const xOpts = { maxResults, counter };
  const gatewayOnCooldown = shouldSkipGateway();
  const useGateway = gatewayEnabled() && !skipNet && !gatewayOnCooldown;
  const providers = new Set();
  if (useGateway) {
    const q = await gatewayQuota().catch(() => null);
    console.log(
      `[x-gateway] quota used=${q?.used_today ?? "?"}/${q?.daily_quota ?? "?"} project=${q?.project ?? "?"}`,
    );
  }

  for (const job of jobs) {
    if (skipNet) break;
    if (job.kind === "user") stats.users += 1;
    else stats.searches += 1;
    const rows = await pullXJob(job, {
      useGateway,
      bases,
      token,
      skipXApi,
      maxResults,
      xOpts,
      stats,
      providers,
    });
    incoming.push(...rows);
  }

  if (stats.gateway > 0 || (token && !skipXApi && counter.requests > 0)) {
    markXApiRun(stats.gateway > 0 ? stats.gateway : counter.requests);
  }
  stats.xRequests = counter.requests;
  stats.xTweets = counter.tweets;

  const filtered = incoming.filter((s) => {
    const text = `${s.title} ${s.body}`;
    if (s.tags?.includes("comparison") || s.tags?.includes("upgrade")) return true;
    if (s.tags?.includes("pricing") || s.tags?.includes("strata")) return true;
    return isRelevant(text, keywords);
  });

  const creatorX = signalsFromCreatorPosts();
  const communityLimit = Number(process.env.INTAKE_COMMUNITY_LIMIT ?? 12);
  const community =
    communityLimit > 0 ? signalsFromCommunity(communityLimit) : [];
  const baseSignals = existing.signals?.length ? existing.signals : SEED_SIGNALS;
  let signals = mergeById(
    mergeById(mergeById(baseSignals, filtered), creatorX),
    community,
  ).slice(0, 500);

  signals = signals.sort((a, b) => {
    const ax = isXSource(a) ? 1 : 0;
    const bx = isXSource(b) ? 1 : 0;
    if (bx !== ax) return bx - ax;
    return new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime();
  });

  const buckets = bucketXFeeds(signals);

  const gpuQuotes = mergeGpuQuotes(
    existing.gpuQuotes ?? [],
    extractGpuQuotesFromSignals(signals),
  ).slice(0, 200);

  const payload = {
    syncedAt: new Date().toISOString(),
    meta: {
      sourcesFile: SOURCES_PATH,
      stats: { ...stats, community: community.length },
      intake: {
        plan: mode === "full" ? "full" : `budget:${laneThisRun.name}+users+release`,
        newestAt: signals.find((signal) => isXSource(signal) && signal.source !== "seed")?.publishedAt ?? null,
        provider: providers.size ? [...providers].join("+") : "cache",
        fresh: stats.gateway + stats.cheapX + stats.rsshub + stats.xTweets,
        jobs: jobs.length,
        gatewaySkipped: gatewayOnCooldown && gatewayEnabled(),
      },
      methods: [
        "Cascade per job: X gateway → cheap-x → RSSHub → paid X API. First source with posts wins.",
        "Budget plan: priority users, the current release tag, and one rotating search lane. Default gateway cooldown 240 min stays under 50 jobs/day.",
        "Lanes are exclusive: upgrade, else comparison/benchmark, else latest.",
        "GitHub community fills gaps (INTAKE_COMMUNITY_LIMIT). A quiet round keeps the last JSON.",
      ],
      openSourceAlternatives: [
        "github.com/w95/x-api + vladkens/twscrape",
        "DIYgod/RSSHub (twitter routes + TWITTER_AUTH_TOKEN)",
        "github.com/zedeus/nitter (legacy; mostly dead)",
      ],
    },
    signals,
    gpuQuotes,
    xLatest: buckets.xLatest,
    comparisons: buckets.comparisons,
    upgradeNotes: buckets.upgradeNotes,
  };

  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, JSON.stringify(payload, null, 2));
  const xNote = stats.xApiSkipped
    ? "paidX=skipped"
    : `paidX req=${stats.xRequests} posts=${stats.xTweets}`;
  const cheapNote = stats.cheapX ? ` cheapX=${stats.cheapX}` : "";
  const gwNote = stats.gateway ? ` gateway=${stats.gateway}` : "";
  console.log(
    `intelligence-pulse.json — ${signals.length} signals, x=${buckets.xLatest.length} cmp=${buckets.comparisons.length} upg=${buckets.upgradeNotes.length} gpu=${gpuQuotes.length} (${xNote}${gwNote}${cheapNote} mode=${stats.xApiMode} rss=${stats.rsshub})`,
  );
  return payload;
}

function currentReleaseQuery() {
  try {
    const releases = JSON.parse(readFileSync(join(ROOT, "apps/www/src/data/releases.json"), "utf8"));
    const tag = releases.releases?.[0]?.tag;
    return tag ? `Strata ${tag}` : null;
  } catch {
    return null;
  }
}

function withLaneTag(rows, lane) {
  const tag = lane === "comparison" ? "comparison" : lane === "upgrade" ? "upgrade" : lane === "gpu" ? "pricing" : null;
  if (!tag) return rows;
  return rows.map((row) => ({
    ...row,
    tags: [...new Set([...(row.tags ?? []), tag])],
  }));
}

async function pullXJob(job, ctx) {
  const { useGateway, bases, token, skipXApi, maxResults, xOpts, stats, providers } = ctx;
  if (useGateway) {
    const rows =
      job.kind === "user"
        ? await fetchGatewayUserTweets(job.item, maxResults)
        : await fetchGatewaySearch(job.item, maxResults);
    if (rows.length) {
      stats.gateway += rows.length;
      providers.add("gateway");
      return withLaneTag(rows, job.lane);
    }
  }
  if (cheapXEnabled()) {
    const rows =
      job.kind === "user"
        ? await fetchCheapXUserTweets(job.item, maxResults)
        : await fetchCheapXSearch(job.item, maxResults);
    if (rows.length) {
      stats.cheapX += rows.length;
      providers.add("cheap-x");
      return withLaneTag(rows, job.lane);
    }
  }
  const rss =
    job.kind === "user"
      ? await fetchRssHubUser(job.item, bases)
      : await fetchRssHubSearch(job.item, bases);
  if (rss.length) {
    stats.rsshub += rss.length;
    providers.add("rsshub");
    return withLaneTag(rss, job.lane);
  }
  if (token && !skipXApi) {
    let rows = [];
    if (job.kind === "user") {
      const cachedUserId = getCachedUserId(job.item);
      const got = await fetchXUserTweets(token, job.item, { ...xOpts, cachedUserId });
      if (got.userId) cacheUserId(job.item, got.userId);
      rows = got.rows ?? [];
    } else {
      rows = await fetchXSearchRecent(token, job.item, xOpts);
    }
    if (rows.length) {
      providers.add("x-api");
      return withLaneTag(rows, job.lane);
    }
  }
  return [];
}

function mergeGpuQuotes(existing, incoming) {
  const map = new Map();
  for (const q of [...existing, ...incoming]) map.set(q.id, q);
  return [...map.values()].sort(
    (a, b) => new Date(b.asOf).getTime() - new Date(a.asOf).getTime(),
  );
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  runIntelligenceSync().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
