#!/usr/bin/env node
/**
 * Daily traffic + publishing report for stratat.com.
 *
 *   node scripts/daily-report.mjs                 # yesterday (Asia/Shanghai), print only
 *   node scripts/daily-report.mjs --date 2026-10-22
 *   node scripts/daily-report.mjs --send          # also push to the Feishu webhook
 *   node scripts/daily-report.mjs --json          # machine-readable, skips the push
 *
 * Run by cron twice a day at 10:00 and 14:00 Asia/Shanghai (02:00 / 06:00 UTC). Both runs report
 * the previous local day, so the two messages carry the same window — the second is a repeat, not
 * a second half-day.
 *
 * ── What the numbers can and cannot say ──────────────────────────────────────────────────────
 *
 * "独立访客" here is *distinct client IPs that made at least one HTML request*, not people. One
 * office or one mobile carrier NAT puts many people behind one address, and one person switching
 * between Wi-Fi and cellular counts twice. It is the best signal available without JavaScript
 * analytics, and it is labelled as IPs in the output so nobody reads it as a headcount.
 *
 * Bot/human is decided by User-Agent, which is trivially spoofable in both directions: a scraper
 * can claim to be Chrome, and a privacy extension can make a person look like a bot. The split is
 * a classification of *requests*, and the report says so.
 *
 * Requests for `/_next/static/*`, `_rsc` prefetches and favicon are excluded from "page views":
 * a single page load fires several of them, and counting them inflates traffic by an amount that
 * varies with how much JS the visitor ran.
 */
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { gunzipSync } from "node:zlib";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const LOG_DIR = process.env.STRATA_LOG_DIR || "/var/log/nginx";
const LOG_BASE = join(LOG_DIR, "strata-access.log");
const REPORT_TZ = process.env.REPORT_TZ || "Asia/Shanghai";

const argv = process.argv.slice(2);
const has = (flag) => argv.includes(flag);
const valueOf = (flag, fallback = null) => {
  const i = argv.indexOf(flag);
  return i !== -1 && argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[i + 1] : fallback;
};

/**
 * The report day is a calendar date in REPORT_TZ, but log timestamps are UTC. Return the UTC
 * range covering that local day, as [from, to) ISO strings comparable with the log's `t` field.
 */
export function utcRangeForLocalDay(dateStr, timeZone) {
  const [y, m, d] = dateStr.split("-").map(Number);
  // Local midnight as UTC: build the instant, then subtract the zone offset at that instant.
  const guess = Date.UTC(y, m - 1, d, 0, 0, 0);
  const offsetAt = (ms) => {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hour12: false,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    }).formatToParts(new Date(ms));
    const get = (t) => Number(parts.find((p) => p.type === t).value);
    const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour") % 24, get("minute"), get("second"));
    return asUtc - ms;
  };
  const start = guess - offsetAt(guess);
  const end = guess + 86_400_000 - offsetAt(guess + 86_400_000);
  return [new Date(start).toISOString(), new Date(end).toISOString()];
}

/** Local calendar date (YYYY-MM-DD) of an instant, in REPORT_TZ. */
export function localDateOf(ms, timeZone) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(ms));
}

const BOT_PATTERNS = [
  /bot\b/i, /crawler/i, /spider/i, /slurp/i, /bingpreview/i, /googleother/i, /google-inspectiontool/i,
  /adsbot/i, /mediapartners/i, /yandex/i, /baiduspider/i, /duckduckbot/i, /applebot/i, /petalbot/i,
  /semrush/i, /ahrefs/i, /mj12bot/i, /dotbot/i, /rogerbot/i, /screaming frog/i, /gptbot/i,
  /chatgpt-user/i, /claude-web/i, /anthropic/i, /perplexity/i, /exa(?:search)?bot/i, /cohere/i,
  /bytespider/i, /amazonbot/i, /facebookexternalhit/i, /twitterbot/i, /linkedinbot/i,
  /embedly/i, /pinterest/i, /slackbot/i, /telegrambot/i, /whatsapp/i, /discordbot/i,
  /headlesschrome/i, /phantomjs/i, /puppeteer/i, /playwright/i, /selenium/i, /curl\//i,
  /wget\//i, /python-requests/i, /go-http-client/i, /java\//i, /okhttp/i, /axios\//i,
  /scrapy/i, /httpclient/i, /libwww-perl/i, /apache-httpclient/i, /node-fetch/i, /undici/i,
  /lighthouse/i, /gtmetrix/i, /pingdom/i, /uptime/i, /statuscake/i, /site24x7/i,
];

/** True when the User-Agent looks automated. Empty UA counts as automated: browsers always send one. */
export function isBot(userAgent) {
  if (!userAgent || userAgent === "-") return true;
  return BOT_PATTERNS.some((re) => re.test(userAgent));
}

/**
 * A request that represents a page someone (or something) deliberately opened.
 * Excluded: build assets, RSC prefetch payloads, favicon probes — one page load emits several.
 */
export function isPageView(uri) {
  if (!uri || uri === "-") return false;
  if (uri.startsWith("/_next/")) return false;
  if (uri.startsWith("/media/")) return false;
  if (uri === "/favicon.ico" || uri === "/robots.txt" || uri === "/sitemap.xml") return false;
  if (/\.(?:css|js|map|png|jpe?g|svg|webp|avif|ico|woff2?|ttf|txt|xml|json)$/i.test(uri)) return false;
  return true;
}

/** `2026-10-22T…Z` / `2026-10-22T…+00:00` both compare correctly against ISO range bounds. */
function within(t, from, to) {
  const ms = Date.parse(t);
  if (Number.isNaN(ms)) return false;
  return ms >= Date.parse(from) && ms < Date.parse(to);
}

function readLogFiles() {
  if (!existsSync(LOG_DIR)) return [];
  const names = readdirSync(LOG_DIR)
    .filter((n) => n === "strata-access.log" || /^strata-access\.log\.\d+(?:\.gz)?$/.test(n))
    .sort((a, b) => {
      const rank = (n) => (n.endsWith("strata-access.log") ? 0 : Number(n.match(/\.(\d+)/)[1]));
      return rank(a) - rank(b);
    });
  const out = [];
  for (const name of names) {
    const full = join(LOG_DIR, name);
    try {
      const raw = name.endsWith(".gz") ? gunzipSync(readFileSync(full)) : readFileSync(full);
      out.push({ name, text: raw.toString("utf8") });
    } catch (error) {
      // A half-written gz from a rotation in flight is not a reason to lose the report.
      console.error(`[report] skipped ${name}: ${error.message}`);
    }
  }
  return out;
}

export function summarize(lines, { from, to }) {
  const bots = { requests: 0, ips: new Set(), byName: new Map() };
  const humans = { requests: 0, ips: new Set() };
  const pages = new Map();
  const statuses = new Map();
  let malformed = 0;
  let total = 0;

  for (const line of lines) {
    if (!line.trim()) continue;
    let row;
    try {
      row = JSON.parse(line);
    } catch {
      malformed++;
      continue;
    }
    if (!within(row.t, from, to)) continue;
    total++;

    if (!isPageView(row.uri)) continue;

    const ip = row.ip || "-";
    const ua = row.ua || "";
    const status = Number(row.status) || 0;
    statuses.set(status, (statuses.get(status) || 0) + 1);
    pages.set(row.uri, (pages.get(row.uri) || 0) + 1);

    if (isBot(ua)) {
      bots.requests++;
      bots.ips.add(ip);
      // Coarse family name so the report can say *which* crawler, without a wall of full UAs.
      const name = botName(ua);
      bots.byName.set(name, (bots.byName.get(name) || 0) + 1);
    } else {
      humans.requests++;
      humans.ips.add(ip);
    }
  }

  return {
    total,
    malformed,
    bots: { requests: bots.requests, ips: bots.ips.size, byName: bots.byName },
    humans: { requests: humans.requests, ips: humans.ips.size },
    pages,
    statuses,
  };
}

const BOT_NAMES = [
  [/googleother|google-inspectiontool/i, "Google"],
  [/googlebot/i, "Googlebot"],
  [/oai-searchbot|gptbot|chatgpt-user|openai/i, "OpenAI"],
  [/claude|anthropic/i, "Anthropic"],
  [/perplexity/i, "Perplexity"],
  [/exa(?:search)?bot/i, "Exa"],
  [/bingpreview|bingbot/i, "Bing"],
  [/yandex/i, "Yandex"],
  [/baiduspider/i, "Baidu"],
  [/duckduckbot/i, "DuckDuckGo"],
  [/applebot/i, "Apple"],
  [/bytespider/i, "ByteDance"],
  [/amazonbot/i, "Amazon"],
  [/semrush|ahrefs|mj12bot|dotbot/i, "SEO tools"],
  [/curl|wget|python-requests|go-http-client|okhttp|axios|node-fetch|undici|httpclient/i, "脚本"],
  [/headlesschrome|puppeteer|playwright|selenium|phantomjs/i, "无头浏览器"],
  [/facebookexternalhit|twitterbot|linkedinbot|slackbot|telegrambot|discordbot/i, "社交预览"],
];

export function botName(userAgent) {
  for (const [re, name] of BOT_NAMES) if (re.test(userAgent)) return name;
  return "其他爬虫";
}

/** Articles that went live on `date` (their publishAt is that day and status is live). */
export function publishedOn(date) {
  const outDir = join(ROOT, "scripts", "content", "out");
  if (!existsSync(outDir)) return { total: 0, byLocale: {}, titles: [] };
  const byLocale = {};
  const titles = [];
  for (const locale of readdirSync(outDir, { withFileTypes: true })) {
    if (!locale.isDirectory()) continue;
    for (const file of readdirSync(join(outDir, locale.name))) {
      if (!file.endsWith(".json")) continue;
      let item;
      try {
        item = JSON.parse(readFileSync(join(outDir, locale.name, file), "utf8"));
      } catch {
        continue;
      }
      if (item.status !== "live" || item.publishAt !== date) continue;
      byLocale[locale.name] = (byLocale[locale.name] || 0) + 1;
      titles.push({ locale: locale.name, slug: item.slug, title: item.article?.title || item.slug });
    }
  }
  const total = Object.values(byLocale).reduce((a, b) => a + b, 0);
  return { total, byLocale, titles };
}

function topEntries(map, n) {
  return [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, n);
}

export function formatReport({ date, range, summary, published, logFrom }) {
  const lines = [];
  lines.push(`功能实测数据（${date} 当天，服务器真实日志）`);
  lines.push("");

  if (!summary.total) {
    lines.push(logFrom
      ? `无访问记录。可用日志始于 ${logFrom}。`
      : "无访问记录（日志目录为空或当天无请求）。");
  } else {
    lines.push(`页面请求 ${summary.humans.requests + summary.bots.requests}`);
    lines.push(`  真人侧：${summary.humans.requests} 次，独立 IP ${summary.humans.ips}`);
    lines.push(`  爬虫侧：${summary.bots.requests} 次，独立 IP ${summary.bots.ips}`);
    const botShare = Math.round(
      (summary.bots.requests / (summary.humans.requests + summary.bots.requests)) * 100,
    );
    lines.push(`  爬虫占比 ${botShare}%`);

    const topBots = topEntries(summary.bots.byName, 6);
    if (topBots.length) {
      lines.push(`  主要爬虫：${topBots.map(([n, c]) => `${n} ${c}`).join("，")}`);
    }

    const topPages = topEntries(summary.pages, 8);
    if (topPages.length) {
      lines.push("");
      lines.push("热门页面：");
      for (const [uri, count] of topPages) lines.push(`  ${count}  ${uri}`);
    }

    const bad = [...summary.statuses.entries()].filter(([s]) => s >= 400).sort((a, b) => b[1] - a[1]);
    if (bad.length) {
      lines.push("");
      lines.push(`异常状态：${bad.map(([s, c]) => `${s}×${c}`).join("，")}`);
    }
  }

  lines.push("");
  if (published.total) {
    const parts = Object.entries(published.byLocale).map(([l, c]) => `${l} ${c}`);
    lines.push(`当天发帖 ${published.total} 篇（${parts.join("，")}）`);
    for (const t of published.titles.slice(0, 8)) lines.push(`  [${t.locale}] ${t.title}`);
    if (published.titles.length > 8) lines.push(`  …另有 ${published.titles.length - 8} 篇`);
  } else {
    lines.push("当天发帖 0 篇");
  }

  lines.push("");
  lines.push("口径：独立 IP ≠ 人数（NAT/移动网络会让多人共用同一 IP，同一人切换网络会重复计数）；");
  lines.push("爬虫按 User-Agent 判定，可被伪造；页面请求已排除静态资源与 RSC 预取。");
  if (range) lines.push(`时间范围 UTC：${range[0]} → ${range[1]}`);
  return lines.join("\n");
}

function earliestLogDay() {
  const files = readLogFiles();
  let earliest = null;
  for (const { text } of files) {
    for (const line of text.split("\n")) {
      if (!line.trim()) continue;
      try {
        const t = JSON.parse(line).t;
        if (t && (!earliest || t < earliest)) earliest = t;
      } catch {
        /* ignore */
      }
    }
  }
  return earliest ? localDateOf(Date.parse(earliest), REPORT_TZ) : null;
}

async function main() {
  const date = valueOf("--date") || localDateOf(Date.now() - 86_400_000, REPORT_TZ);
  const range = utcRangeForLocalDay(date, REPORT_TZ);

  const files = readLogFiles();
  const allLines = files.flatMap((f) => f.text.split("\n"));
  const summary = summarize(allLines, { from: range[0], to: range[1] });
  const published = publishedOn(date);
  const logFrom = earliestLogDay();

  const text = formatReport({ date, range, summary, published, logFrom });

  if (has("--json")) {
    console.log(JSON.stringify({
      date,
      range,
      humans: { requests: summary.humans.requests, ips: summary.humans.ips },
      bots: { requests: summary.bots.requests, ips: summary.bots.ips, byName: Object.fromEntries(summary.bots.byName) },
      published: { total: published.total, byLocale: published.byLocale },
      logFrom,
    }, null, 2));
  } else {
    console.log(text);
  }

  if (has("--send")) {
    const { notifyFeishu } = await import("./notify.mjs");
    // Reports have their own bot so that moving the daily summary to another group cannot also
    // move the deploy-failure alerts. Falls back to the shared hook when unset.
    const result = await notifyFeishu({
      stage: "daily-report",
      reason: text,
      bare: true,
      webhook: process.env.REPORT_WEBHOOK,
    });
    if (!result.ok) process.exitCode = 1;
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await main();
}
