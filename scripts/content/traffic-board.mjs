/**
 * Compact traffic snapshot for the internal board.
 *
 * The board must not read nginx logs. This module streams the same rotated
 * `strata-access.log` set the daily report already reads, folds the last few
 * Shanghai days into counts, and writes one small JSON file. Unique IPs stay
 * in memory only while folding and are never serialized.
 *
 * Other vhosts are ignored on purpose: their logs record Cloudflare edges, so
 * an "IP" there is not a visitor.
 */
import { mkdirSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  botName,
  isBot,
  isPageView,
  localDateOf,
  readLogLines,
  utcRangeForLocalDay,
} from "../daily-report.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..");

export const SITES = ["zh", "en", "ja", "de", "fr", "es", "pt", "other"];
const SITE_SET = new Set(SITES);
export const IP_CAP = 50_000;
export const PAGE_CAP = 500;
export const TOP_PAGES = 8;
export const TOP_BOTS = 4;
export const DEFAULT_TRAFFIC_FILE = join(ROOT, "scripts/content/traffic-board.json");

const DAY_MS = 86_400_000;

/** First path segment, so `/zh/gpus` and `/zh` are the Chinese site. */
export function siteOf(uri) {
  if (!uri || uri[0] !== "/") return "other";
  const slash = uri.indexOf("/", 1);
  const head = uri.slice(1, slash === -1 ? uri.length : slash);
  return SITE_SET.has(head) ? head : "other";
}

/**
 * `dayCount` Shanghai dates ending on the local date of `nowMs`, oldest first.
 * Shanghai has no daylight-saving shift, so stepping by 24h stays on midnight.
 */
export function windowBounds(nowMs, dayCount, timeZone) {
  const today = localDateOf(nowMs, timeZone);
  const [todayStartIso, todayEndIso] = utcRangeForLocalDay(today, timeZone);
  const todayStart = Date.parse(todayStartIso);
  const dates = [];
  for (let i = dayCount - 1; i >= 0; i--) dates.push(localDateOf(todayStart - i * DAY_MS, timeZone));
  const [fromIso] = utcRangeForLocalDay(dates[0], timeZone);
  return { dates, today, fromMs: Date.parse(fromIso), todayEndMs: Date.parse(todayEndIso) };
}

function freshCounts() {
  return {
    humanPv: 0,
    botPv: 0,
    humanIps: new Set(),
    botIps: new Set(),
    humanIpsCapped: false,
    botIpsCapped: false,
  };
}

function addIp(bucket, kind, ip, cap) {
  const human = kind === "human";
  const set = human ? bucket.humanIps : bucket.botIps;
  if (set.has(ip)) return;
  if (set.size >= cap) {
    if (human) bucket.humanIpsCapped = true;
    else bucket.botIpsCapped = true;
    return;
  }
  set.add(ip);
}

function countsOf(bucket) {
  return {
    humanPv: bucket.humanPv,
    humanIps: bucket.humanIps.size,
    humanIpsCapped: bucket.humanIpsCapped,
    botPv: bucket.botPv,
    botIps: bucket.botIps.size,
    botIpsCapped: bucket.botIpsCapped,
  };
}

function topEntries(map, limit) {
  return [...map.entries()].sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0]))).slice(0, limit);
}

/**
 * Fold page-view lines into per-site and per-day counts.
 * `toMs` is exclusive, matching the daily report's range.
 */
export function createTrafficAccumulator({ dates, today, timeZone, fromMs, toMs, ipCap = IP_CAP, pageCap = PAGE_CAP }) {
  const allowed = new Set(dates);
  const byDate = new Map(dates.map((date) => [date, {
    trend: freshCounts(),
    sites: new Map(SITES.map((site) => [site, freshCounts()])),
  }]));
  const weekSites = new Map(SITES.map((site) => [site, {
    ...freshCounts(),
    bots: new Map(),
    pages: new Map(),
    pageOverflow: 0,
  }]));

  const add = (line) => {
    if (!line || !line.trim()) return;
    let row;
    try {
      row = JSON.parse(line);
    } catch {
      return;
    }
    const t = Date.parse(row.t);
    if (Number.isNaN(t) || t < fromMs || t >= toMs) return;
    if (!isPageView(row.uri)) return;
    const date = localDateOf(t, timeZone);
    if (!allowed.has(date)) return;

    const site = siteOf(row.uri);
    const bot = isBot(row.ua || "");
    const ip = row.ip || "-";
    const day = byDate.get(date);
    const siteDay = day.sites.get(site);
    const week = weekSites.get(site);

    if (bot) {
      siteDay.botPv++;
      day.trend.botPv++;
      week.botPv++;
      addIp(siteDay, "bot", ip, ipCap);
      addIp(day.trend, "bot", ip, ipCap);
      addIp(week, "bot", ip, ipCap);
      const name = botName(row.ua || "");
      week.bots.set(name, (week.bots.get(name) || 0) + 1);
    } else {
      siteDay.humanPv++;
      day.trend.humanPv++;
      week.humanPv++;
      addIp(siteDay, "human", ip, ipCap);
      addIp(day.trend, "human", ip, ipCap);
      addIp(week, "human", ip, ipCap);
      if (date === today) {
        if (week.pages.has(row.uri)) week.pages.set(row.uri, week.pages.get(row.uri) + 1);
        else if (week.pages.size < pageCap) week.pages.set(row.uri, 1);
        else week.pageOverflow++;
      }
    }
  };

  const result = ({ generatedAt, failures = [] } = {}) => ({
    generatedAt,
    timeZone,
    today,
    from: dates[0],
    to: dates[dates.length - 1],
    through: new Date(toMs).toISOString(),
    partial: toMs < Date.parse(utcRangeForLocalDay(today, timeZone)[1]),
    sites: SITES.map((site) => {
      const week = weekSites.get(site);
      return {
        site,
        today: countsOf(byDate.get(today).sites.get(site)),
        days7: countsOf(week),
        bots: topEntries(week.bots, TOP_BOTS),
        pages: topEntries(week.pages, TOP_PAGES),
        pageOverflow: week.pageOverflow,
      };
    }),
    trend: dates.map((date) => ({ date, ...countsOf(byDate.get(date).trend) })),
    failures,
  });

  return { add, result };
}

/** Pure fold used by tests. `lines` may be JSON strings or objects. Does not write a file. */
export function snapshotFromLines(lines, {
  now,
  dayCount = 7,
  timeZone = "Asia/Shanghai",
  toMs,
  ipCap,
  pageCap,
  generatedAt,
} = {}) {
  const bounds = windowBounds(now, dayCount, timeZone);
  const acc = createTrafficAccumulator({
    dates: bounds.dates,
    today: bounds.today,
    timeZone,
    fromMs: bounds.fromMs,
    toMs: toMs ?? now,
    ipCap,
    pageCap,
  });
  for (const line of lines) acc.add(typeof line === "string" ? line : JSON.stringify(line));
  return acc.result({ generatedAt: generatedAt ?? new Date(now).toISOString() });
}

function writeAtomic(file, text) {
  mkdirSync(dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  writeFileSync(tmp, text);
  renameSync(tmp, file);
}

/**
 * One streaming pass over the rotated logs. The destination is replaced only
 * after the JSON is complete, so a reader never sees a half-written file.
 */
export async function writeTrafficSnapshot({
  dir,
  file = process.env.STRATAT_TRAFFIC_FILE || DEFAULT_TRAFFIC_FILE,
  now = Date.now(),
  timeZone = "Asia/Shanghai",
  dayCount = 7,
} = {}) {
  const bounds = windowBounds(now, dayCount, timeZone);
  const acc = createTrafficAccumulator({
    dates: bounds.dates,
    today: bounds.today,
    timeZone,
    fromMs: bounds.fromMs,
    toMs: now,
  });
  const failures = [];
  for await (const line of readLogLines({ dir, failures })) acc.add(line);
  const snapshot = acc.result({ generatedAt: new Date(now).toISOString(), failures });
  writeAtomic(file, `${JSON.stringify(snapshot)}\n`);
  return snapshot;
}
