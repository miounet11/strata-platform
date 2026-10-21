#!/usr/bin/env node
// Builds the 1001-article production plan. Deterministic: same inputs, same output, so a
// half-finished batch can always be recomputed and diffed.
//
//   node scripts/content/plan.mjs            # write scripts/content/plan.json
//   node scripts/content/plan.mjs --stats    # print the breakdown only
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..", "..");
const DATA = join(ROOT, "apps", "www", "src", "data");

const LOCALES = ["en", "zh", "ja", "de", "fr", "es", "pt"];

const rigs = JSON.parse(readFileSync(join(DATA, "benchmarks.json"), "utf8")).rigs;
const variants = JSON.parse(readFileSync(join(DATA, "models.json"), "utf8")).variants;

// The twelve cards people actually search for. A card only earns its own page once we have
// measured numbers for it, which is what makes these pages different from a spec sheet.
// ids as they appear in benchmarks.json — no hyphens, so they must not be guessed.
const HERO_RIGS = [
  "rtx4090", "rtx5090", "rtx5080", "rtx3090", "rtx5070", "rtx4070ti_super",
  "rx7900xtx", "rx9070xt_16gb", "rtx4070", "rtx3090ti", "rtxpro6000", "macstudio_m5ultra_96",
];

const slugifyRig = (rig) =>
  rig.name
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "");

const rigBySlug = new Map();
for (const rig of rigs) {
  rigBySlug.set(rig.id ?? slugifyRig(rig), rig);
  rigBySlug.set(slugifyRig(rig), rig);
}

const quants = variants.map((v) => v.id.replace(/_/g, "-"));

// B — task guides. Written per locale rather than translated, so each entry carries the angle
// that market actually asks about.
const TASKS = [
  { slug: "local-coding-assistant", en: "Run a coding assistant on your own machine", zh: "在自己电脑上跑代码助手" },
  { slug: "offline-deployment", en: "Deploy a model with no internet access", zh: "断网环境下部署大模型" },
  { slug: "dual-gpu-setup", en: "Split a model across two GPUs", zh: "双卡分配：把模型拆到两张显卡" },
  { slug: "long-context-local", en: "Run 128k context locally", zh: "本地跑 128k 上下文" },
  { slug: "laptop-igpu", en: "What a laptop iGPU can actually run", zh: "笔记本核显能跑多大的模型" },
  { slug: "amd-rocm", en: "Run models on AMD with ROCm", zh: "用 ROCm 在 A 卡上跑模型" },
  { slug: "privacy-audit", en: "Prove your prompts never leave the box", zh: "验证提示词没有离开本机" },
  { slug: "api-compatibility", en: "Point existing tools at a local endpoint", zh: "把现有工具接到本地接口" },
  { slug: "windows-vs-linux", en: "Choose between Windows and Linux", zh: "Windows 还是 Linux：怎么选" },
  { slug: "serving-multiple-users", en: "Serve several people from one machine", zh: "一台机器给多人用" },
  { slug: "context-caching", en: "Keep long documents in context", zh: "长文档如何留在上下文里" },
  { slug: "batch-processing", en: "Process thousands of documents overnight", zh: "一夜跑完几千份文档" },
  { slug: "embedding-search", en: "Build a local document search", zh: "搭一个本地文档检索" },
  { slug: "fine-tune-vs-prompt", en: "When fine-tuning beats prompting", zh: "什么时候该微调而不是提示词" },
  { slug: "model-upgrades", en: "Swap in a new model without breaking prompts", zh: "换模型但不弄坏现有提示词" },
  { slug: "cost-comparison", en: "Compare the bill against a hosted API", zh: "和云端 API 比账单" },
  { slug: "noise-and-heat", en: "Keep the machine quiet under load", zh: "满载时怎么让它不吵" },
  { slug: "remote-access", en: "Reach your model from another device", zh: "从另一台设备访问本机模型" },
  { slug: "backup-models", en: "Move models between machines", zh: "把模型搬到另一台机器" },
  { slug: "first-week", en: "What the first week actually looks like", zh: "第一周的真实体验" },
];

// D — troubleshooting, grouped from the issues people actually file.
const TROUBLES = [
  { slug: "cuda-out-of-memory", en: "CUDA out of memory", zh: "CUDA 显存不足" },
  { slug: "model-too-slow", en: "Generation is far slower than reported", zh: "生成速度远低于标称" },
  { slug: "gpu-not-detected", en: "The GPU is not detected", zh: "检测不到显卡" },
  { slug: "installer-blocked", en: "The installer is blocked", zh: "安装包被系统拦截" },
  { slug: "port-in-use", en: "The port is already in use", zh: "端口被占用" },
  { slug: "output-gibberish", en: "Output turns into gibberish", zh: "输出变成乱码" },
  { slug: "context-truncated", en: "Long inputs get truncated", zh: "长输入被截断" },
  { slug: "first-token-slow", en: "The first token takes forever", zh: "首个 token 特别慢" },
  { slug: "amd-fallback", en: "It silently falls back to CPU", zh: "悄悄退回 CPU 运行" },
  { slug: "disk-full", en: "Model download fills the disk", zh: "模型下载把磁盘塞满" },
  { slug: "update-failed", en: "Updating fails halfway", zh: "更新到一半失败" },
  { slug: "wrong-answer", en: "Answers are confidently wrong", zh: "答案自信但错误" },
  { slug: "multi-user-queue", en: "Requests queue behind each other", zh: "请求互相排队" },
  { slug: "fan-noise", en: "Fans run at full speed constantly", zh: "风扇一直满转" },
  { slug: "uninstall-clean", en: "Uninstall without leftovers", zh: "卸载后不留残余" },
];

// E — market-localised: the topic only makes sense in that market, which is the whole point.
const LOCAL = {
  en: [
    "us-electricity-cost", "which-gpu-to-buy-us", "comcast-bandwidth", "sales-tax-on-gpus",
    "warranty-returns", "micro-center-pickup", "best-buy-returns", "newegg-bundles",
    "state-power-rates", "renters-setup", "dorm-room-limits", "apartment-power-budget",
    "usb4-egpu", "wfh-stipend", "average-american-bill",
  ],
  zh: [
    "guonei-wangluo", "guochan-xianka", "dianfei-jisuan", "gongzuoshi-bushu", "lixian-neiwang",
    "taobao-xianka", "jiedian-jiaofei", "qiye-neiwang", "xianka-baoxiu", "xiaozhan-peizhi",
    "sushe-gongdian", "wangguan-xianzhi", "jingdong-fahuo", "ershou-xianka", "jiating-bushu",
  ],
  ja: [
    "denki-dai", "nihongo-model", "kaku-nashi", "chuuko-gpu", "kosuto-shoukan",
    "denki-jika", "nihon-koukoku", "chuuko-shouten", "apato-kaihen", "shouji-kosuto",
    "nihongo-token", "keisan-memori", "teikei-denryoku", "hinshitsu-hosho", "jikka-setup",
  ],
  de: [
    "stromkosten", "dsgvo-lokal", "gebraucht-gpu", "netzteil-empfehlung", "kfw-foerderung",
    "strompreis-vergleich", "betriebsrat-ki", "mindestlohn-nicht", "rechnung-finanzamt",
    "gebrauchtgarantie", "mieter-strom", "homeoffice-pauschale", "server-im-keller",
    "waermepumpe-konflikt", "datenschutzbeauftragter",
  ],
  fr: [
    "cout-electricite", "souverainete-donnees", "gpu-occasion", "tarif-bleu", "rgpd-local",
    "prix-kwh", "facture-edf", "achat-reconditionne", "garantie-legale", "auto-entrepreneur",
    "donnees-sante", "hebergement-local", "bruit-appartement", "prime-renovation", "ecologie-numerique",
  ],
  es: [
    "precio-luz", "gpu-segunda-mano", "sin-internet", "factura-mensual", "garantia",
    "tarifa-valle", "pyme-local", "wallapop-gpu", "aire-acondicionado", "autonomo-deduccion",
    "datos-personales", "corte-de-luz", "ruido-vecinos", "compra-verano", "soporte-tecnico",
  ],
  pt: [
    "custo-energia", "dolar-gpu", "internet-lenta", "nota-fiscal", "assistencia",
    "banda-larga", "importacao-taxas", "mercado-livre", "energia-solar", "pequena-empresa",
    "lgpd-local", "queda-de-energia", "ruido-apartamento", "garantia-loja", "suporte-remoto",
  ],
};

// F — concepts, one per locale, phrased the way that language searches for it.
const CONCEPTS = [
  { slug: "what-is-quantization", en: "What quantization is", zh: "什么是量化" },
  { slug: "vram-vs-ram", en: "VRAM versus system RAM", zh: "显存和内存的区别" },
  { slug: "tokens-per-second", en: "What tokens per second measures", zh: "token/s 到底衡量什么" },
  { slug: "context-window", en: "What a context window is", zh: "什么是上下文窗口" },
  { slug: "moe-explained", en: "Mixture of experts, explained", zh: "混合专家模型是什么" },
  { slug: "kv-cache", en: "Why the KV cache eats memory", zh: "KV 缓存为什么吃显存" },
  { slug: "open-weights", en: "Open weights versus open source", zh: "开放权重和开源的区别" },
  { slug: "temperature", en: "Temperature and why answers vary", zh: "温度参数与答案差异" },
  { slug: "gpu-bandwidth", en: "Why memory bandwidth matters more than cores", zh: "为什么带宽比核心数更重要" },
  { slug: "local-vs-cloud", en: "Local versus cloud: the real trade", zh: "本地与云端：真实取舍" },
];

const pad = (n) => String(n).padStart(2, "0");

// Spread 1001 articles over seven days: day 1 carries the data skeleton, the last days add
// the market-local pieces that need the most editorial care.
function publishSlot(index, total) {
  const day = Math.min(7, Math.floor((index / total) * 7) + 1);
  return `2026-10-${pad(22 + (day - 1))}`;
}

const items = [];
const seen = new Set();

function add(locale, kind, slug, extra = {}) {
  const key = `${locale}/${kind}/${slug}`;
  if (seen.has(key)) return;
  seen.add(key);
  items.push({
    id: `${locale}-${kind}-${slug}`,
    locale,
    kind,
    slug: `${slug}`,
    path: `/${locale}/guides/${slug}`,
    ...extra,
  });
}

for (const locale of LOCALES) {
  // A — card × quantization. The body of the plan: 12 × 6 = 72 per locale.
  for (const rigSlug of HERO_RIGS) {
    const rig = rigBySlug.get(rigSlug);
    if (!rig) continue;
    for (const quant of quants) {
      add(locale, "hardware", `${rigSlug}-${quant}`, {
        rig: rig.id ?? rigSlug,
        rigName: rig.name,
        quant,
        // Real numbers; the writer is told to use these and not invent its own.
        facts: {
          vramGb: rig.memory,
          readingTps: rig.readingToks,
          writingTps: rig.writingToks,
          powerWatts: rig.powerWatts,
          fit: rig.fit,
        },
      });
    }
  }

  for (const task of TASKS) {
    const title = task[locale] ?? task.en;
    add(locale, "task", task.slug, { workingTitle: title });
  }

  // C — comparisons between adjacent cards, ordered so each pair appears once.
  const compare = [
    ["rtx4090", "rtx5090"], ["rtx4090", "rtx5080"], ["rtx4090", "rtx3090"],
    ["rtx5090", "rtx5080"], ["rtx5080", "rtx4070ti_super"], ["rtx3090", "rtx3090ti"],
    ["rx7900xtx", "rx9070xt_16gb"], ["rx7900xtx", "rx6900xt_16gb"], ["rtx4090", "rx7900xtx"],
    ["rtx5090", "rx9070xt_16gb"], ["rtx5070", "rx7900xtx"], ["rtxpro6000", "rtx4090"],
    ["macstudio_m5ultra_96", "rtx4090"], ["rtx3090", "dual_rtx3090_24gb"], ["rtxpro6000", "rtx5090"],
  ];
  for (const [a, b] of compare) {
    const left = rigBySlug.get(a);
    const right = rigBySlug.get(b);
    if (!left || !right) continue;
    const human = (rig, id) => (rig.name || id).replace(/\s+/g, "-").toLowerCase();
    add(locale, "compare", `${human(left, a)}-vs-${human(right, b)}`, {
      left: { id: left.id ?? a, name: left.name, memory: left.memory, writingTps: left.writingToks, price: left.cardPrice },
      right: { id: right.id ?? b, name: right.name, memory: right.memory, writingTps: right.writingToks, price: right.cardPrice },
    });
  }

  for (const trouble of TROUBLES) {
    add(locale, "troubleshoot", trouble.slug, { workingTitle: trouble[locale] ?? trouble.en });
  }

  for (const local of LOCAL[locale]) {
    add(locale, "local", local, { market: locale });
  }

  for (const concept of CONCEPTS) {
    add(locale, "concept", concept.slug, { workingTitle: concept[locale] ?? concept.en });
  }
}

const byLocale = {};
for (const item of items) byLocale[item.locale] = (byLocale[item.locale] ?? 0) + 1;
const byKind = {};
for (const item of items) byKind[item.kind] = (byKind[item.kind] ?? 0) + 1;

// Stable ordering, then spread across the week so publishing is paced.
items.forEach((item, index) => {
  item.order = index;
  item.publishAt = publishSlot(index, items.length);
  item.status = "scheduled";
});

const plan = {
  generatedAt: new Date().toISOString(),
  total: items.length,
  locales: LOCALES,
  byLocale,
  byKind,
  items,
};

if (process.argv.includes("--stats")) {
  console.log(`total ${plan.total}`);
  for (const locale of LOCALES) console.log(`  ${locale}: ${byLocale[locale]}`);
  for (const [kind, count] of Object.entries(byKind)) console.log(`  ${kind}: ${count}`);
} else {
  mkdirSync(HERE, { recursive: true });
  writeFileSync(join(HERE, "plan.json"), `${JSON.stringify(plan, null, 2)}\n`);
  console.log(`wrote scripts/content/plan.json — ${plan.total} articles`);
  for (const locale of LOCALES) console.log(`  ${locale}: ${byLocale[locale]}`);
  for (const [kind, count] of Object.entries(byKind)) console.log(`  ${kind}: ${count}`);
}
