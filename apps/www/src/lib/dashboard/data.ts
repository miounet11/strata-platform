import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { readDataJson } from "@/lib/data-file";

/**
 * Everything the board reports, resolved from the files the content pipeline already writes.
 * Nothing here is imported by a public page, so the ~1 MB plan is never pulled into a route
 * that search engines can reach.
 *
 * Two of the sources live outside `apps/www`: `scripts/content/plan.json` and `out/` are written
 * by the generator on the VPS. They are found through `STRATAT_CONTENT_DIR`, then the production
 * path, then the repository layout used in development.
 */
export type KindRow = {
  kind: string;
  planned: number;
  produced: number;
  live: number;
  ready: number;
  waitingImage: number;
};

export type LocaleRow = {
  locale: string;
  planned: number;
  produced: number;
  live: number;
  scheduled: number;
  ready: number;
  waitingImage: number;
};

export type DayRow = {
  date: string;
  total: number;
  produced: number;
  live: number;
  ready: number;
  waitingImage: number;
  byLocale: Record<string, number>;
};

export type BoardData = {
  checkedAt: string;
  today: string;
  sources: { label: string; status: string }[];
  plan: {
    generatedAt: string | null;
    total: number;
    locales: string[];
    days: number;
    firstDay: string | null;
    lastDay: string | null;
    rigs: string[];
  };
  pipeline: {
    produced: number;
    live: number;
    scheduled: number;
    ready: number;
    waitingImage: number;
    missingArticle: number;
  };
  kinds: KindRow[];
  locales: LocaleRow[];
  schedule: DayRow[];
  media: { assets: number; guideAssets: number; covers: number };
  logs: { file: string; lines: string[] }[];
  problems: string[];
  traffic: { snapshot: TrafficSnapshot | null; error: string | null };
};

export type TrafficCounts = {
  humanPv: number;
  humanIps: number;
  humanIpsCapped: boolean;
  botPv: number;
  botIps: number;
  botIpsCapped: boolean;
};

export type TrafficSite = {
  site: string;
  today: TrafficCounts;
  days7: TrafficCounts;
  bots: [string, number][];
  pages: [string, number][];
  pageOverflow: number;
};

export type TrafficSnapshot = {
  generatedAt: string;
  timeZone: string;
  today: string;
  from: string;
  to: string;
  partial?: boolean;
  sites: TrafficSite[];
  trend: (TrafficCounts & { date: string })[];
  failures: { file?: string; message?: string }[];
};

type PlanItem = {
  id: string;
  locale: string;
  kind: string;
  slug: string;
  path?: string;
  rig?: string;
  rigName?: string;
  publishAt?: string;
  status?: string;
};

type Plan = {
  generatedAt?: string;
  total?: number;
  locales?: string[];
  items?: PlanItem[];
};

type Manifest = { assets?: Record<string, { path?: string }> };

const CONTENT_ROOTS = [
  process.env.STRATAT_CONTENT_DIR,
  "/opt/stratat/scripts/content",
  join(process.cwd(), "../../scripts/content"),
  join(process.cwd(), "../../../scripts/content"),
].filter((root): root is string => Boolean(root));

function contentDir(): string | null {
  for (const root of CONTENT_ROOTS) if (existsSync(join(root, "plan.json"))) return root;
  return null;
}

function readJson<T>(file: string): T | null {
  try {
    return JSON.parse(readFileSync(file, "utf8")) as T;
  } catch {
    return null;
  }
}

function tally(map: Record<string, number>, key: string) {
  map[key] = (map[key] ?? 0) + 1;
}

export function collectBoard(): BoardData {
  const problems: string[] = [];
  const sources: { label: string; status: string }[] = [];
  const now = new Date();
  const today = now.toISOString().slice(0, 10);

  const dir = contentDir();
  const plan = dir ? readJson<Plan>(join(dir, "plan.json")) : null;
  if (!dir) problems.push("plan.json not found — set STRATAT_CONTENT_DIR on the server");
  else if (!plan) problems.push(`plan.json unreadable at ${dir}`);
  else sources.push({ label: "plan.json", status: `ok · ${plan.items?.length ?? 0} items` });

  const items = plan?.items ?? [];

  // The manifest is what publish.mjs consults before flipping an article live, so it is the
  // authoritative answer to "why is this one still scheduled".
  const manifest = readDataJson<Manifest>("media-manifest.json", {});
  const assets = manifest.assets ?? {};
  const guideAssets = Object.keys(assets).filter((key) => key.startsWith("guide-")).length;
  const covers = Object.values(assets).filter((asset) => Boolean(asset?.path)).length;

  const outDir = dir ? join(dir, "out") : null;
  const produced = new Map<string, { status: string; publishAt?: string }>();
  if (outDir && existsSync(outDir)) {
    for (const locale of readdirSync(outDir, { withFileTypes: true })) {
      if (!locale.isDirectory()) continue;
      const localeDir = join(outDir, locale.name);
      for (const file of readdirSync(localeDir)) {
        if (!file.endsWith(".json")) continue;
        const parsed = readJson<{ status?: string; publishAt?: string }>(join(localeDir, file));
        if (parsed) produced.set(`${locale.name}/${file.replace(/\.json$/, "")}`, { status: parsed.status ?? "?", publishAt: parsed.publishAt });
      }
    }
    sources.push({ label: "scripts/content/out", status: `ok · ${produced.size} files` });
  } else {
    problems.push("scripts/content/out is missing on this host — articles are generated per day");
  }

  const kindMap = new Map<string, KindRow>();
  const localeMap = new Map<string, LocaleRow>();
  const dayMap = new Map<string, DayRow>();
  const rigs = new Set<string>();

  let live = 0;
  let scheduled = 0;
  let ready = 0;
  let waitingImage = 0;
  let missingArticle = 0;

  const kindRow = (kind: string) => {
    let row = kindMap.get(kind);
    if (!row) {
      row = { kind, planned: 0, produced: 0, live: 0, ready: 0, waitingImage: 0 };
      kindMap.set(kind, row);
    }
    return row;
  };
  const localeRow = (locale: string) => {
    let row = localeMap.get(locale);
    if (!row) {
      row = { locale, planned: 0, produced: 0, live: 0, scheduled: 0, ready: 0, waitingImage: 0 };
      localeMap.set(locale, row);
    }
    return row;
  };
  const dayRow = (date: string) => {
    let row = dayMap.get(date);
    if (!row) {
      row = { date, total: 0, produced: 0, live: 0, ready: 0, waitingImage: 0, byLocale: {} };
      dayMap.set(date, row);
    }
    return row;
  };

  for (const item of items) {
    if (item.rig) rigs.add(item.rig);
    const date = item.publishAt ?? "unscheduled";
    const out = produced.get(`${item.locale}/${item.slug}`);
    const hasImage = Boolean(assets[`guide-${item.slug}`]?.path);
    const isLive = out?.status === "live";
    const isProduced = Boolean(out);

    kindRow(item.kind).planned++;
    const loc = localeRow(item.locale);
    loc.planned++;
    const day = dayRow(date);
    day.total++;
    tally(day.byLocale, item.locale);

    if (isProduced) {
      kindRow(item.kind).produced++;
      loc.produced++;
      day.produced++;
      if (isLive) {
        live++;
        loc.live++;
        day.live++;
        if (hasImage) {
          ready++;
          kindRow(item.kind).ready++;
          loc.ready++;
          day.ready++;
        }
      } else {
        scheduled++;
        loc.scheduled++;
        if (hasImage) {
          ready++;
          kindRow(item.kind).ready++;
          loc.ready++;
          day.ready++;
        } else {
          waitingImage++;
          kindRow(item.kind).waitingImage++;
          loc.waitingImage++;
          day.waitingImage++;
        }
      }
    } else {
      missingArticle++;
    }
  }

  if (produced.size && !items.length) problems.push("articles exist but the plan is empty");

  const days = [...new Set(items.map((item) => item.publishAt).filter((date): date is string => Boolean(date)))].sort();

  return {
    checkedAt: now.toISOString(),
    today,
    sources,
    plan: {
      generatedAt: plan?.generatedAt ?? null,
      total: plan?.total ?? items.length,
      locales: plan?.locales ?? [...localeMap.keys()].sort(),
      days: days.length,
      firstDay: days[0] ?? null,
      lastDay: days[days.length - 1] ?? null,
      rigs: [...rigs].sort(),
    },
    pipeline: {
      produced: produced.size,
      live,
      scheduled,
      ready,
      waitingImage,
      missingArticle,
    },
    kinds: [...kindMap.values()].sort((a, b) => b.planned - a.planned),
    locales: [...localeMap.values()].sort((a, b) => a.locale.localeCompare(b.locale)),
    schedule: [...dayMap.values()].sort((a, b) => a.date.localeCompare(b.date)),
    media: { assets: Object.keys(assets).length, guideAssets, covers },
    logs: readLogs(),
    problems,
    traffic: readTraffic(problems),
  };
}

const TRAFFIC_CANDIDATES = [
  process.env.STRATAT_TRAFFIC_FILE,
  "/opt/stratat/scripts/content/traffic-board.json",
  join(process.cwd(), "../../scripts/content/traffic-board.json"),
  join(process.cwd(), "../../../scripts/content/traffic-board.json"),
].filter((file): file is string => Boolean(file));

let trafficCache: { file: string; mtimeMs: number; snapshot: TrafficSnapshot | null; error: string | null } | null = null;

function isCounts(value: unknown): value is TrafficCounts {
  if (!value || typeof value !== "object") return false;
  const row = value as TrafficCounts;
  return [row.humanPv, row.humanIps, row.botPv, row.botIps].every((n) => typeof n === "number" && Number.isFinite(n));
}

function asSnapshot(value: unknown): TrafficSnapshot | null {
  if (!value || typeof value !== "object") return null;
  const row = value as TrafficSnapshot;
  if (typeof row.generatedAt !== "string" || typeof row.today !== "string") return null;
  if (!Array.isArray(row.sites) || !Array.isArray(row.trend)) return null;
  for (const site of row.sites) {
    if (!site || typeof site.site !== "string" || !isCounts(site.today) || !isCounts(site.days7)) return null;
    if (!Array.isArray(site.bots) || !Array.isArray(site.pages)) return null;
  }
  for (const day of row.trend) {
    if (!day || typeof day.date !== "string" || !isCounts(day)) return null;
  }
  return row;
}

/**
 * The snapshot is written by the daily report. Opening the board only stats this
 * file, so a multi-hundred-megabyte access log is never parsed in the request.
 */
function readTraffic(problems: string[]): { snapshot: TrafficSnapshot | null; error: string | null } {
  const file = TRAFFIC_CANDIDATES.find((candidate) => existsSync(candidate));
  if (!file) {
    const error = "流量快照还没有生成。日报任务会写 scripts/content/traffic-board.json";
    problems.push(error);
    return { snapshot: null, error };
  }
  try {
    const mtimeMs = statSync(file).mtimeMs;
    if (trafficCache && trafficCache.file === file && trafficCache.mtimeMs === mtimeMs) {
      if (trafficCache.error) problems.push(trafficCache.error);
      return { snapshot: trafficCache.snapshot, error: trafficCache.error };
    }
    const snapshot = asSnapshot(JSON.parse(readFileSync(file, "utf8")));
    const error = snapshot ? null : `流量快照无法识别：${file}`;
    trafficCache = { file, mtimeMs, snapshot, error };
    if (error) problems.push(error);
    return { snapshot, error };
  } catch {
    const error = `流量快照无法读取：${file}`;
    problems.push(error);
    return { snapshot: null, error };
  }
}

/**
 * The daily job appends to two logs. Only the tail is shown: the board answers "did the last run
 * work", and a full log would be megabytes of LLM chatter.
 */
function readLogs(): { file: string; lines: string[] }[] {
  const files = ["/var/log/stratat-guides.log", "/var/log/stratat-content.log"];
  const result: { file: string; lines: string[] }[] = [];
  for (const file of files) {
    try {
      const text = readFileSync(file, "utf8");
      const lines = text.trimEnd().split("\n").slice(-14);
      const at = statSync(file).mtime.toISOString();
      result.push({ file: `${file} · ${at}`, lines: lines.length ? lines : ["(empty)"] });
    } catch {
      result.push({ file, lines: ["(not readable on this host)"] });
    }
  }
  return result;
}
