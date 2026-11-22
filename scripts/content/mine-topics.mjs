#!/usr/bin/env node
/**
 * Closed-loop content topic miner.
 *
 * Connects the site's own live data signals directly into `scripts/content/plan.json` so new
 * user problems and product updates turn into high-intent guides automatically — zero paid APIs:
 *
 *   1. Releases (`apps/www/src/data/releases.json`) → "What's new in Strata vX.Y.Z" release guides
 *      with real asset counts and release notes facts.
 *   2. Community issues (`apps/www/src/data/community.json`) → clusters recurring real user
 *      problems (Blackwell/CUDA 13, AMD ROCm/HIP, Apple Metal, Cursor/Claude Code/MCP, multi-GPU,
 *      GGUF loading, KV cache OOM) into fresh `troubleshoot` and `task` items.
 *   3. Traffic board (`scripts/content/traffic-board.json`) → ranks locale priority by observed
 *      crawler + human demand (en → zh → ja → ...).
 *
 *   node scripts/content/mine-topics.mjs --dry-run
 *   node scripts/content/mine-topics.mjs --merge
 */
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..", "..");
const DATA = join(ROOT, "apps/www/src/data");

/** Problem clusters mapped against real GitHub issues in `community.json`. */
export const ISSUE_CLUSTERS = [
  {
    slug: "blackwell-rtx50-cuda13-setup",
    kind: "troubleshoot",
    re: /\b(?:rtx\s*50[6789]0|blackwell|cuda\s*13|sm_120)\b/i,
    titles: {
      en: "Fix RTX 50-series Blackwell and CUDA 13 errors in Strata",
      zh: "RTX 50 系 Blackwell 显卡与 CUDA 13 常见报错排查",
      ja: "RTX 50シリーズ（Blackwell）とCUDA 13のエラー解決ガイド",
    },
  },
  {
    slug: "amd-rocm-hip-troubleshooting",
    kind: "troubleshoot",
    re: /\b(?:rocm|hip|gfx11\d*|rx\s*9070|strix\s*halo|radeon)\b/i,
    titles: {
      en: "Fix AMD ROCm and HIP GPU errors for local LLMs",
      zh: "AMD 显卡 ROCm / HIP 本地推理报错与回退排查",
      ja: "AMD ROCm / HIP 環境でのローカルLLMエラー解決法",
    },
  },
  {
    slug: "connect-cursor-claude-code-mcp",
    kind: "task",
    re: /\b(?:cursor|claude\s*code|mcp|anthropic|\/v1\/messages|openai\s*compat)\b/i,
    titles: {
      en: "Connect Cursor, Claude Code and MCP tools to local Strata",
      zh: "把 Cursor、Claude Code 与 MCP 接入本地 Strata 接口",
      ja: "Cursor・Claude Code・MCPをローカルStrataに接続する手順",
    },
  },
  {
    slug: "multi-gpu-layer-split-tuning",
    kind: "task",
    re: /\b(?:multi-?gpu|layer-?split|2x\s*rtx|dual\s*gpu|tensor\s*split)\b/i,
    titles: {
      en: "Tune multi-GPU layer split for maximum local tok/s",
      zh: "多卡分层切分（Layer Split）调优与显存平衡指南",
      ja: "マルチGPUのレイヤー分割（Layer Split）最適化ガイド",
    },
  },
  {
    slug: "gguf-quant-loading-errors",
    kind: "troubleshoot",
    re: /\b(?:gguf|iq2|iq3|q2_0|unsloth|checksum|corrupt|mmap|o_direct)\b/i,
    titles: {
      en: "Fix GGUF model loading, checksum and mmap failures",
      zh: "GGUF 模型加载失败、校验错误与 mmap 内存映射排障",
      ja: "GGUFモデル読み込み・チェックサム・mmapエラー対処法",
    },
  },
  {
    slug: "apple-silicon-metal-memory-limit",
    kind: "troubleshoot",
    re: /\b(?:macos|metal|apple\s*silicon|m3\s*ultra|m4\s*max|m5|unified\s*memory|wired\s*limit)\b/i,
    titles: {
      en: "Fix macOS Metal unified memory limits on Apple Silicon",
      zh: "macOS Apple Silicon 统一内存上限与 Metal 降速排查",
      ja: "Apple Silicon（macOS Metal）のユニファイドメモリ上限対策",
    },
  },
  {
    slug: "windows-firewall-defender-fix",
    kind: "troubleshoot",
    re: /\b(?:smartscreen|defender|start-here\.bat|antivirus|blocked|port\s*8080|wsl)\b/i,
    titles: {
      en: "Fix Windows SmartScreen, Defender and port 8080 conflicts",
      zh: "Windows 安装拦截、Defender 误报与 8080 端口冲突解决",
      ja: "Windows SmartScreen・Defender警告とポート8080競合の解決",
    },
  },
];

export function slugifyTag(tag) {
  return `strata-${String(tag).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}-whats-new`;
}

/**
 * Derive locale priority order from `traffic-board.json` (total 7-day bot + human PV),
 * falling back to `["en", "zh", "ja"]`.
 */
export function localeDemandOrder(trafficBoard, allowedLocales = ["en", "zh", "ja"]) {
  const allowed = new Set(allowedLocales);
  const scores = new Map();
  for (const site of trafficBoard?.sites ?? []) {
    if (!site?.site || !allowed.has(site.site)) continue;
    const bot7 = Number(site.days7?.botPv ?? 0);
    const human7 = Number(site.days7?.humanPv ?? 0);
    // Weight crawler demand higher because crawler interest predicts AI/search indexation.
    scores.set(site.site, bot7 * 2 + human7);
  }
  return [...allowedLocales].sort((a, b) => (scores.get(b) ?? 0) - (scores.get(a) ?? 0));
}

/**
 * Turn newest Strata releases into fact-backed `release` guide candidates.
 */
export function mineReleaseTopics(releasesData, { maxReleases = 3, locales = ["en", "zh", "ja"] } = {}) {
  const releases = [...(releasesData?.releases ?? [])]
    .filter((r) => r?.tag && !r.prerelease)
    .sort((a, b) => String(b.publishedAt ?? "").localeCompare(String(a.publishedAt ?? "")))
    .slice(0, maxReleases);

  const items = [];
  for (const rel of releases) {
    const slug = slugifyTag(rel.tag);
    const bodyLead = String(rel.body ?? "")
      .replace(/<[^>]+>/g, " ")
      .replace(/[#>*`]/g, "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 320);
    const facts = {
      releaseTag: rel.tag,
      publishedAt: String(rel.publishedAt ?? "").slice(0, 10),
      assetCount: (rel.assets ?? []).length,
      releaseUrl: rel.url,
      highlights: bodyLead || `${rel.name || rel.tag} upstream release`,
    };
    for (const locale of locales) {
      const workingTitle =
        locale === "zh"
          ? `Strata ${rel.tag} 更新亮点与升级指南`
          : locale === "ja"
            ? `Strata ${rel.tag} の新機能とアップデート手順`
            : `What's new in Strata ${rel.tag}: upgrade guide and changes`;
      items.push({
        locale,
        kind: "release",
        slug,
        workingTitle,
        facts,
        minedFrom: "releases",
      });
    }
  }
  return items;
}

/**
 * Cluster community issues into high-signal troubleshooting/task guides with real evidence counts.
 */
export function mineIssueClusters(
  communityData,
  { minMatches = 3, locales = ["en", "zh", "ja"] } = {},
) {
  const issues = communityData?.issues ?? [];
  const items = [];

  for (const cluster of ISSUE_CLUSTERS) {
    const matched = issues.filter((issue) =>
      cluster.re.test(`${issue.title ?? ""}\n${(issue.body ?? "").slice(0, 1200)}`),
    );
    if (matched.length < minMatches) continue;
    const recent = [...matched]
      .sort((a, b) => String(b.updatedAt ?? "").localeCompare(String(a.updatedAt ?? "")))
      .slice(0, 5);
    const facts = {
      matchedIssueCount: matched.length,
      sampleIssues: recent.map((i) => `#${i.number}`).join(", "),
      latestIssueDate: String(recent[0]?.updatedAt ?? "").slice(0, 10),
      sampleTitles: recent.map((i) => i.title).slice(0, 3).join(" | "),
    };
    for (const locale of locales) {
      items.push({
        locale,
        kind: cluster.kind,
        slug: cluster.slug,
        workingTitle: cluster.titles[locale] ?? cluster.titles.en,
        facts,
        minedFrom: "community-issues",
      });
    }
  }
  return items;
}

/**
 * Idempotently append mined candidates into a plan object without duplicating existing slugs.
 */
export function mergeMinedIntoPlan(plan, candidates, { today, takenByLocale = new Set(), maxAdd = 24 } = {}) {
  const known = new Set([
    ...takenByLocale,
    ...(plan.items ?? []).map((i) => `${i.locale}/${i.slug}`),
  ]);
  const added = [];
  for (const c of candidates) {
    if (added.length >= maxAdd) break;
    const key = `${c.locale}/${c.slug}`;
    if (known.has(key)) continue;
    known.add(key);
    const entry = {
      id: `${c.locale}-${c.kind}-${c.slug}`,
      locale: c.locale,
      kind: c.kind,
      slug: c.slug,
      path: `/${c.locale}/guides/${c.slug}`,
      workingTitle: c.workingTitle,
      facts: c.facts,
      minedFrom: c.minedFrom,
      publishAt: today,
      status: "scheduled",
      order: (plan.items ?? []).length,
    };
    plan.items.push(entry);
    added.push(entry);
  }
  plan.total = plan.items.length;
  plan.byLocale = {};
  plan.byKind = {};
  for (const item of plan.items) {
    plan.byLocale[item.locale] = (plan.byLocale[item.locale] ?? 0) + 1;
    plan.byKind[item.kind] = (plan.byKind[item.kind] ?? 0) + 1;
  }
  return added;
}

function readJsonSafe(path) {
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return null;
  }
}

function existingOutKeys() {
  const taken = new Set();
  const outDir = join(HERE, "out");
  if (!existsSync(outDir)) return taken;
  for (const entry of readdirSync(outDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    for (const file of readdirSync(join(outDir, entry.name))) {
      if (file.endsWith(".json")) taken.add(`${entry.name}/${file.slice(0, -5)}`);
    }
  }
  return taken;
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const merge = process.argv.includes("--merge");
  const today = new Date().toISOString().slice(0, 10);

  const wantedLocales = (process.env.MINE_LOCALES ?? "en,zh,ja")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const maxAdd = Math.max(1, Number(process.env.MINE_MAX_ITEMS ?? 24));

  const traffic = readJsonSafe(join(HERE, "traffic-board.json"));
  const releases = readJsonSafe(join(DATA, "releases.json"));
  const community = readJsonSafe(join(DATA, "community.json"));

  const locales = localeDemandOrder(traffic, wantedLocales);
  const candidates = [
    ...mineReleaseTopics(releases, { maxReleases: 3, locales }),
    ...mineIssueClusters(community, { minMatches: 3, locales }),
  ];

  // Order by demand locale first so caps always prioritize highest-traffic locales.
  const locRank = new Map(locales.map((l, i) => [l, i]));
  candidates.sort((a, b) => (locRank.get(a.locale) ?? 99) - (locRank.get(b.locale) ?? 99));

  console.log(
    `mine-topics: locale priority [${locales.join(" > ")}], ${candidates.length} candidate(s) discovered`,
  );

  const planPath = join(HERE, "plan.json");
  const plan = readJsonSafe(planPath);
  if (!plan || !Array.isArray(plan.items)) {
    console.error(`mine-topics: missing or invalid ${planPath}`);
    process.exit(1);
  }

  const takenByLocale = existingOutKeys();
  const clone = dryRun ? structuredClone(plan) : plan;
  const added = mergeMinedIntoPlan(clone, candidates, { today, takenByLocale, maxAdd });

  for (const item of added) {
    console.log(`  + [${item.minedFrom}] ${item.locale}/${item.kind}/${item.slug}`);
  }

  if (dryRun || !merge) {
    console.log(`(${dryRun ? "dry run" : "preview"} — ${added.length} new item(s) eligible; pass --merge to write plan.json)`);
    return;
  }

  if (added.length > 0) {
    writeFileSync(planPath, `${JSON.stringify(plan, null, 2)}\n`);
    console.log(`merged ${added.length} mined topic(s) into plan.json for ${today}`);
  } else {
    console.log("mine-topics: nothing new to merge");
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
