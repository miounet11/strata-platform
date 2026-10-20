#!/usr/bin/env node
/**
 * Adds page-level hero/detail imagery for routes that had none: benchmarks, community,
 * releases, topics, changelog, links, install, models, download, pulse, creator.
 *
 * Idempotent: items already present in briefs.json (matched by id) are left alone, so this can
 * be re-run after the brief list grows without duplicating entries.
 *
 *   node scripts/enrichment/page-briefs.mjs        # merge into briefs.json
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..");
const BRIEFS = join(ROOT, "scripts/enrichment/briefs.json");

/** House style: dark navy/teal, cinematic product shots, no text baked into the pixels. */
const STYLE =
  "dark navy and teal palette, cinematic lighting, ultra clean product photography, " +
  "shallow depth of field, professional, no text, no logos, no watermarks";

const items = [
  // ── benchmarks: hardware, cost, payback ────────────────────────────────────
  {
    id: "bench-hero",
    page: "/benchmarks",
    slot: "hero",
    prompt: `Wide shot of four consumer graphics cards mounted in a test rig on a dark bench, power meters and thermal probes attached, blue LED glow, ${STYLE}`,
    alt: { en: "GPUs on a benchmark bench with power and thermal probes", zh: "基准测试台架上的显卡，接有功耗与温度探头" },
  },
  {
    id: "bench-tokens",
    page: "/benchmarks",
    slot: "detail",
    prompt: `Close-up of a GPU running inference at full load, fans spinning, faint holographic token stream rising from the heatsink, ${STYLE}`,
    alt: { en: "A GPU at full load with a holographic token stream", zh: "满载运行的显卡与悬浮的 token 流" },
  },
  {
    id: "bench-power",
    page: "/benchmarks",
    slot: "detail",
    prompt: `Wall power meter and electricity bill beside a running gaming PC, warm room light, cost-of-ownership mood, ${STYLE}`,
    alt: { en: "Power meter next to a running gaming PC", zh: "运行中的游戏电脑旁的功耗表" },
  },
  {
    id: "bench-payback",
    page: "/benchmarks",
    slot: "detail",
    prompt: `Abstract rising curve of stacked coins merging into a GPU silhouette, financial payback concept, ${STYLE}`,
    alt: { en: "Concept image of GPU cost payback", zh: "显卡成本回收概念图" },
  },

  // ── community / issues / pulls: collaboration ──────────────────────────────
  {
    id: "community-hero",
    page: "/community",
    slot: "hero",
    prompt: `Overhead view of a developer desk: laptop showing a code review thread, mechanical keyboard, coffee, warm rim light, collaborative mood, ${STYLE}`,
    alt: { en: "Developer desk with a code review on screen", zh: "正在进行代码评审的开发者桌面" },
  },
  {
    id: "community-labels",
    page: "/community",
    slot: "detail",
    prompt: `Abstract network of glowing nodes connected by thin lines, each cluster a different hue, topic-label metaphor, ${STYLE}`,
    alt: { en: "Glowing node network representing topic labels", zh: "代表话题标签的发光节点网络" },
  },
  {
    id: "issues-hero",
    page: "/issues",
    slot: "hero",
    prompt: `Support engineer's monitor showing a long triage queue in a dark room, focused blue light, problem-solving mood, ${STYLE}`,
    alt: { en: "Monitor showing an issue triage queue", zh: "显示问题分类队列的显示器" },
  },
  {
    id: "pulls-hero",
    page: "/pulls",
    slot: "hero",
    prompt: `Two developers pairing over a diff view on a large display, dark studio, collaborative warm accents, ${STYLE}`,
    alt: { en: "Two developers reviewing a diff together", zh: "两位开发者共同审阅代码差异" },
  },

  // ── releases / changelog: shipping ─────────────────────────────────────────
  {
    id: "releases-hero",
    page: "/releases",
    slot: "hero",
    prompt: `Stack of glowing release artifacts floating above a desk like cards in a timeline, version ribbon motif, ${STYLE}`,
    alt: { en: "Release timeline concept with floating version cards", zh: "悬浮版本卡片的发布时间线概念图" },
  },
  {
    id: "changelog-hero",
    page: "/changelog",
    slot: "hero",
    prompt: `Long horizontal timeline etched in light across a dark wall, milestone markers, update history mood, ${STYLE}`,
    alt: { en: "Light timeline on a dark wall marking milestones", zh: "暗色墙面上标记里程碑的光带时间线" },
  },

  // ── topics / guides: how-to ────────────────────────────────────────────────
  {
    id: "topics-hero",
    page: "/topics",
    slot: "hero",
    prompt: `Open notebook and laptop on a wooden desk, handwritten architecture sketch beside a terminal window, guide mood, ${STYLE}`,
    alt: { en: "Notebook and laptop with a handwritten architecture sketch", zh: "笔记本与手绘架构草图" },
  },
  {
    id: "topics-rigs",
    page: "/topics",
    slot: "detail",
    prompt: `Three gaming PCs of different sizes lined up on a bench, each with a small spec card, buying-guide mood, ${STYLE}`,
    alt: { en: "Three gaming PCs lined up for a buying guide", zh: "选购指南中的三台不同规格电脑" },
  },

  // ── download / install: getting started ────────────────────────────────────
  {
    id: "download-hero",
    page: "/download",
    slot: "hero",
    prompt: `Laptop with a download progress ring glowing on screen, installer window motif, dark desk, ${STYLE}`,
    alt: { en: "Laptop showing a download in progress", zh: "显示下载进度的笔记本电脑" },
  },
  {
    id: "install-hero",
    page: "/install",
    slot: "detail",
    prompt: `First-run setup screen on a monitor with a clean progress indicator, friendly blue light, onboarding mood, ${STYLE}`,
    alt: { en: "First-run setup screen on a monitor", zh: "显示器上的首次安装引导界面" },
  },

  // ── models: the library ────────────────────────────────────────────────────
  {
    id: "models-hero",
    page: "/models",
    slot: "detail",
    prompt: `Grid of glowing model cards floating in dark space like a data library, quantization badges as light dots, ${STYLE}`,
    alt: { en: "Grid of model cards floating like a library", zh: "如数据图书馆般悬浮的模型卡片" },
  },

  // ── pulse / creator: social proof ──────────────────────────────────────────
  {
    id: "pulse-hero",
    page: "/pulse",
    slot: "detail",
    prompt: `Abstract wave of social conversation rendered as glowing particles over a dark city skyline, signal mood, ${STYLE}`,
    alt: { en: "Particles of conversation over a dark skyline", zh: "暗色城市天际线上的对话粒子流" },
  },
  {
    id: "creator-hero",
    page: "/creator",
    slot: "hero",
    prompt: `Writer's desk at night with a glowing screen and microphone, personal broadcasting mood, ${STYLE}`,
    alt: { en: "Writer's desk with screen and microphone at night", zh: "夜间带屏幕与麦克风的作者工作台" },
  },

  // ── friendly links ─────────────────────────────────────────────────────────
  {
    id: "links-hero",
    page: "/links",
    slot: "hero",
    prompt: `Constellation of small glowing website windows connected by light threads, friendly network mood, ${STYLE}`,
    alt: { en: "Constellation of linked sites connected by light", zh: "以光线相连的友链星座图" },
  },
];

const briefs = JSON.parse(readFileSync(BRIEFS, "utf8"));
const have = new Set(briefs.items.map((i) => i.id));
const added = items.filter((i) => !have.has(i.id));

if (added.length === 0) {
  console.log(`[page-briefs] nothing to add (${briefs.items.length} items already present)`);
  process.exit(0);
}

briefs.items.push(...added);
writeFileSync(BRIEFS, `${JSON.stringify(briefs, null, 2)}\n`);
console.log(`[page-briefs] added ${added.length} items → ${briefs.items.length} total`);
for (const item of added) console.log(`  + ${item.id} (${item.page} / ${item.slot})`);
