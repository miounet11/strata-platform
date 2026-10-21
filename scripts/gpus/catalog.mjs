// Canonical GPU catalogue for the site.
//
// Two kinds of rows:
//   measured — the model exists in benchmarks.json with real tok/s numbers.
//   derived  — the SKU is real and shippable, but we have not benchmarked it; throughput is
//              estimated from memory bandwidth. The site must label these "estimated", so the
//              `evidence` field is carried all the way into the page, never dropped.
//
// `vram` drives the quant recommendation: models.json states the minimum VRAM per quant, and the
// matcher picks the largest quant whose floor fits. Nothing here guesses compatibility from the
// model name alone.
import { readFileSync } from "node:fs";

const ROOT = new URL("../..", import.meta.url).pathname;
const benchmarks = JSON.parse(readFileSync(`${ROOT}apps/www/src/data/benchmarks.json`, "utf8"));
const models = JSON.parse(readFileSync(`${ROOT}apps/www/src/data/models.json`, "utf8"));
const measuredById = new Map(benchmarks.rigs.map((r) => [r.id, r]));

/** Memory bandwidth in GB/s — the dominant term for token throughput. */
const BANDWIDTH = {
  // Ada / Blackwell consumer
  rtx5090: 1792, rtx5080: 960, rtx5070ti: 896, rtx5070: 672, rtx5060ti: 448,
  rtx4090: 1008, rtx4080super: 736, rtx4080: 717, rtx4070tisuper: 672, rtx4070ti: 504,
  rtx4070super: 504, rtx4070: 504, rtx4060ti: 288, rtx4060: 272,
  // Ampere
  rtx3090ti: 1008, rtx3090: 936, rtx3080ti: 912, rtx3080: 760, rtx3070ti: 608,
  rtx3070: 448, rtx3060ti: 448, rtx3060: 360,
  // Ada workstation
  rtxa6000: 960, rtxpro6000: 1792, rtxa5000: 768, rtxa4000: 448,
  // AMD RDNA3 / RDNA4
  rx7900xtx: 960, rx7900xt: 800, rx7800xt: 624, rx7700xt: 432,
  rx9070xt: 645, rx9070: 645, rx9060xt: 322,
  // AMD RDNA2
  rx6950xt: 576, rx6900xt: 512, rx6800xt: 512, rx6800: 512, rx6700xt: 384,
  // Apple unified memory
  m5ultra: 819, m5max: 546, m5pro: 273, m4max: 546, m4pro: 273, m3ultra: 819, m3max: 546,
  m2ultra: 819, m2max: 546, m1ultra: 819, m1max: 546,
  // Turing / Pascal
  rtx2080ti: 616, rtx2080super: 496, rtx2080: 448, rtx2070super: 448, rtx2070: 448,
  rtx2060super: 448, rtx2060_12: 336, rtx2060: 336, gtx1660ti: 288, gtx1660super: 336, gtx1650super: 192,
  gtx1080ti: 484, gtx1080: 320, gtx1070ti: 256, gtx1070: 256, gtx1060_6: 192,
  // Blackwell workstation / datacenter
  rtxpro5000: 1344, rtxpro4000: 672, h100_80: 3350, a100_80: 2039, a100_40: 1555,
  l40s: 864, l4: 300, rtxa6000_ada: 960,
  // AMD additions
  rx6750xt: 432, rx6650xt: 280, rx6600xt: 256, rx6600: 224, rx5700xt: 448, rxvega64: 484,
  radeonpro_w7900: 864, radeonpro_w7800: 576, mi300x: 5300, mi210: 1638,
  rx7900gre: 576, rx7650gre: 256,
  // Intel Arc
  arc_b580: 456, arc_b570: 380, arc_a770: 560, arc_a750: 512,
};

/**
 * `ratios` maps a measured rig's tok/s to a predicted tok/s for a card without a measurement.
 * Bandwidth scaling is accurate enough to rank cards and to answer "can it run", which is what
 * these pages are for — it is not accurate enough to publish as a benchmark, hence `derived`.
 */
function estimate(bw) {
  // RTX 4090 (1008 GB/s) measures 4000 read / 109.3 write tok/s; scale linearly from there.
  const scale = bw / 1008;
  return { readingTps: Math.round(4000 * scale), writingTps: Math.round(109.3 * scale * 10) / 10 };
}

const INTEL = [
  ["arc_b580", "Intel Arc B580", 12, "Battlemage", 2024],
  ["arc_b570", "Intel Arc B570", 10, "Battlemage", 2025],
  ["arc_a770", "Intel Arc A770 16GB", 16, "Alchemist", 2022],
  ["arc_a750", "Intel Arc A750", 8, "Alchemist", 2022],
];

const NVIDIA = [
  ["rtx5090", "RTX 5090", 32, "Blackwell", 2025], ["rtx5080", "RTX 5080", 16, "Blackwell", 2025],
  ["rtx5070ti", "RTX 5070 Ti", 16, "Blackwell", 2025, null], ["rtx5070", "RTX 5070", 12, "Blackwell", 2025, "rtx5070_12gb"],
  ["rtx5060ti_16", "RTX 5060 Ti 16GB", 16, "Blackwell", 2025],
  ["rtx4090", "RTX 4090", 24, "Ada Lovelace", 2022], ["rtx4080super", "RTX 4080 SUPER", 16, "Ada Lovelace", 2024],
  ["rtx4080", "RTX 4080", 16, "Ada Lovelace", 2022], ["rtx4070tisuper", "RTX 4070 Ti SUPER 16GB", 16, "Ada Lovelace", 2024],
  ["rtx4070ti", "RTX 4070 Ti", 12, "Ada Lovelace", 2023], ["rtx4070super", "RTX 4070 SUPER", 12, "Ada Lovelace", 2024],
  ["rtx4070", "RTX 4070 12 GB", 12, "Ada Lovelace", 2023], ["rtx4060ti_16", "RTX 4060 Ti 16GB", 16, "Ada Lovelace", 2023],
  ["rtx4060ti_8", "RTX 4060 Ti 8GB", 8, "Ada Lovelace", 2023], ["rtx4060", "RTX 4060", 8, "Ada Lovelace", 2023],
  ["rtx3090ti", "RTX 3090 Ti", 24, "Ampere", 2022], ["rtx3090", "RTX 3090", 24, "Ampere", 2020],
  ["rtx3080ti", "RTX 3080 Ti", 12, "Ampere", 2021], ["rtx3080_12", "RTX 3080 12GB", 12, "Ampere", 2022],
  ["rtx3080", "RTX 3080", 10, "Ampere", 2020], ["rtx3070ti", "RTX 3070 Ti", 8, "Ampere", 2021],
  ["rtx3070", "RTX 3070", 8, "Ampere", 2020], ["rtx3060ti", "RTX 3060 Ti", 8, "Ampere", 2020],
  ["rtx3060_12", "RTX 3060 12GB", 12, "Ampere", 2021], ["rtx3060", "RTX 3060 8GB", 8, "Ampere", 2022],
  ["rtxa6000", "RTX A6000", 48, "Ampere", 2020], ["rtxa5000", "RTX A5000", 24, "Ampere", 2021],
  ["rtxa4000", "RTX A4000", 16, "Ampere", 2021], ["rtxpro6000", "RTX PRO 6000 Blackwell", 96, "Blackwell", 2025],
  // Turing (RTX 20 / GTX 16)
  ["rtx2080ti", "RTX 2080 Ti", 11, "Turing", 2018], ["rtx2080super", "RTX 2080 SUPER", 8, "Turing", 2019],
  ["rtx2080", "RTX 2080", 8, "Turing", 2018], ["rtx2070super", "RTX 2070 SUPER", 8, "Turing", 2019],
  ["rtx2070", "RTX 2070", 8, "Turing", 2018], ["rtx2060super", "RTX 2060 SUPER", 8, "Turing", 2019],
  ["rtx2060_12", "RTX 2060 12GB", 12, "Turing", 2021], ["rtx2060", "RTX 2060", 6, "Turing", 2019],
  ["gtx1660ti", "GTX 1660 Ti", 6, "Turing", 2019], ["gtx1660super", "GTX 1660 SUPER", 6, "Turing", 2019],
  ["gtx1650super", "GTX 1650 SUPER", 4, "Turing", 2019],
  // Pascal
  ["gtx1080ti", "GTX 1080 Ti", 11, "Pascal", 2017], ["gtx1080", "GTX 1080", 8, "Pascal", 2016],
  ["gtx1070ti", "GTX 1070 Ti", 8, "Pascal", 2017], ["gtx1070", "GTX 1070", 8, "Pascal", 2016],
  ["gtx1060_6", "GTX 1060 6GB", 6, "Pascal", 2016],
  // Blackwell workstation / server
  ["rtxpro5000", "RTX PRO 5000 Blackwell", 48, "Blackwell", 2025],
  ["rtxpro4000", "RTX PRO 4000 Blackwell", 24, "Blackwell", 2025],
  ["h100_80", "NVIDIA H100 80GB", 80, "Hopper", 2022],
  ["a100_80", "NVIDIA A100 80GB", 80, "Ampere", 2020],
  ["a100_40", "NVIDIA A100 40GB", 40, "Ampere", 2020],
  ["l40s", "NVIDIA L40S", 48, "Ada Lovelace", 2023],
  ["l4", "NVIDIA L4", 24, "Ada Lovelace", 2023],
  ["rtxa6000_ada", "RTX 6000 Ada", 48, "Ada Lovelace", 2022],
];

const AMD = [
  ["rx9070xt_16", "AMD Radeon RX 9070 XT 16GB", 16, "RDNA 4", 2025],
  ["rx9070_16", "AMD Radeon RX 9070 16GB", 16, "RDNA 4", 2025],
  ["rx9060xt_16", "AMD Radeon RX 9060 XT 16GB", 16, "RDNA 4", 2025],
  ["rx7900xtx", "AMD Radeon RX 7900 XTX", 24, "RDNA 3", 2022],
  ["rx7900xt", "AMD Radeon RX 7900 XT", 20, "RDNA 3", 2022],
  ["rx7800xt", "AMD Radeon RX 7800 XT", 16, "RDNA 3", 2023],
  ["rx7700xt", "AMD Radeon RX 7700 XT", 12, "RDNA 3", 2023],
  ["rx6950xt", "AMD Radeon RX 6950 XT", 16, "RDNA 2", 2022],
  ["rx6900xt", "AMD Radeon RX 6900 XT 16GB", 16, "RDNA 2", 2020],
  ["rx6800xt", "AMD Radeon RX 6800 XT", 16, "RDNA 2", 2020],
  ["rx6800", "AMD Radeon RX 6800", 16, "RDNA 2", 2020],
  ["rx6700xt", "AMD Radeon RX 6700 XT", 12, "RDNA 2", 2021],
  ["rx6750xt", "AMD Radeon RX 6750 XT", 12, "RDNA 2", 2022],
  ["rx6650xt", "AMD Radeon RX 6650 XT", 8, "RDNA 2", 2022],
  ["rx6600xt", "AMD Radeon RX 6600 XT", 8, "RDNA 2", 2021],
  ["rx6600", "AMD Radeon RX 6600", 8, "RDNA 2", 2021],
  // RDNA 1
  ["rx5700xt", "AMD Radeon RX 5700 XT", 8, "RDNA", 2019],
  // Vega / Polaris
  ["rxvega64", "AMD Radeon RX Vega 64", 8, "Vega", 2017],
  // Workstation / instinct
  ["radeonpro_w7900", "AMD Radeon PRO W7900", 48, "RDNA 3", 2023],
  ["radeonpro_w7800", "AMD Radeon PRO W7800", 32, "RDNA 3", 2023],
  ["mi300x", "AMD Instinct MI300X", 192, "CDNA 3", 2023],
  ["mi210", "AMD Instinct MI210", 64, "CDNA 2", 2022],
  ["rx7900gre", "AMD Radeon RX 7900 GRE", 16, "RDNA 3", 2024],
  ["rx7650gre", "AMD Radeon RX 7650 GRE", 8, "RDNA 3", 2025],
];

const APPLE = [
  ["m5ultra_512", "Mac Studio M5 Ultra 512 GB", 512, "Apple M5", 2026],
  ["m5ultra_256", "Mac Studio M5 Ultra 256 GB", 256, "Apple M5", 2026],
  ["m5ultra_96", "Mac Studio M5 Ultra 96 GB", 96, "Apple M5", 2026],
  ["m5max_128", "Mac Studio M5 Max 128 GB", 128, "Apple M5", 2026],
  ["m5max_64", "MacBook Pro M5 Max 64 GB", 64, "Apple M5", 2026],
  ["m5pro_64", "Mac mini M5 Pro 64 GB", 64, "Apple M5", 2026],
  ["m4max_128", "Mac Studio M4 Max 128 GB", 128, "Apple M4", 2024],
  ["m3ultra_512", "Mac Studio M3 Ultra 512 GB", 512, "Apple M3", 2025],
  ["m5ultra_192", "Mac Studio M5 Ultra 192 GB", 192, "Apple M5", 2026],
  ["m5max_96", "MacBook Pro M5 Max 96 GB", 96, "Apple M5", 2026],
  ["m4pro_48", "Mac mini M4 Pro 48 GB", 48, "Apple M4", 2024],
  ["m4max_64", "MacBook Pro M4 Max 64 GB", 64, "Apple M4", 2024],
  ["m4max_48", "MacBook Pro M4 Max 48 GB", 48, "Apple M4", 2024],
  ["m3max_128", "MacBook Pro M3 Max 128 GB", 128, "Apple M3", 2023],
  ["m3max_64", "MacBook Pro M3 Max 64 GB", 64, "Apple M3", 2023],
  ["m2ultra_192", "Mac Studio M2 Ultra 192 GB", 192, "Apple M2", 2023],
  ["m2ultra_128", "Mac Studio M2 Ultra 128 GB", 128, "Apple M2", 2023],
  ["m2max_96", "MacBook Pro M2 Max 96 GB", 96, "Apple M2", 2023],
  ["m1ultra_128", "Mac Studio M1 Ultra 128 GB", 128, "Apple M1", 2022],
  ["m1max_64", "MacBook Pro M1 Max 64 GB", 64, "Apple M1", 2021],
];

const slugify = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

/**
 * Rows are [id, name, vram, arch, year, benchmarkId?]. `benchmarkId` exists because catalogue ids
 * and benchmark ids are not the same namespace: `rtx5070` in benchmarks.json is the 5070 **Ti**,
 * so a row must say which measurement it is allowed to claim instead of looking it up by id.
 */
function makeRows(vendor, rows, bwKeyOf) {
  return rows.map(([id, name, vram, arch, year, benchmarkId]) => {
    const measured = benchmarkId === null ? undefined : measuredById.get(benchmarkId ?? id);
    const bw = BANDWIDTH[bwKeyOf(id)] ?? 0;
    const est = estimate(bw);
    return {
      id,
      slug: slugify(name),
      name,
      vendor,
      arch,
      vramGb: vram,
      year,
      bandwidthGbs: bw,
      readingTps: measured?.readingToks ?? est.readingTps,
      writingTps: measured?.writingToks ?? est.writingTps,
      evidence: measured ? "measured" : "estimated",
      cardPrice: measured?.cardPrice ?? null,
      powerWatts: measured?.powerWatts ?? null,
    };
  });
}

const rows = [
  ...makeRows("nvidia", NVIDIA, (id) => id.replace(/_(16|12|8|6|80|40)$/g, "")),
  ...makeRows("amd", AMD, (id) => id.replace(/_(16|8)$/g, "")),
  ...makeRows("intel", INTEL, (id) => id),
  ...makeRows("apple", APPLE, (id) => {
    if (id.startsWith("m5ultra")) return "m5ultra";
    if (id.startsWith("m5max")) return "m5max";
    if (id.startsWith("m5pro")) return "m5pro";
    if (id.startsWith("m4max")) return "m4max";
    return "m3ultra";
  }),
];

/**
 * Platform and runtime per vendor. These are build facts, not guesses: the release ships one
 * engine per accelerator backend, so a card maps to exactly one build.
 */
const PLATFORM = { nvidia: ["windows", "linux"], amd: ["windows", "linux"], intel: ["windows", "linux"], apple: ["macos"] };
const RUNTIME = { nvidia: "CUDA", amd: "ROCm", intel: "oneAPI/SYCL", apple: "Metal" };
/**
 * Minimum driver the shipped build needs. CUDA 12 requires 525+, CUDA 13 requires 580+;
 * ROCm 6 ships in the Adrenalin 24.x line; Metal comes with the OS.
 */
const DRIVER_MIN = {
  nvidia: "NVIDIA 580.65+ (CUDA 13)",
  "nvidia-legacy": "NVIDIA 525.60+ (CUDA 12)",
  amd: "AMD Adrenalin 24.6.1+ (ROCm 6)",
  apple: "macOS 14+ (Metal 3)",
  intel: "Intel Arc driver 32.0.101.6+ (oneAPI)",
};

const byFloor = [...models.variants].sort((a, b) => b.vramGbMin - a.vramGbMin);
for (const row of rows) {
  const fit = byFloor.find((v) => row.vramGb >= v.vramGbMin);
  row.quant = fit?.id ?? null;
  row.variant = row.vendor === "nvidia"
    ? (["Ampere", "Turing", "Pascal"].includes(row.arch) ? "nvidia-legacy" : "nvidia")
    : row.vendor === "amd" ? "amd" : row.vendor === "intel" ? "intel" : "apple";

  row.platforms = PLATFORM[row.vendor];
  row.runtime = RUNTIME[row.vendor];
  row.driverMin = DRIVER_MIN[row.variant];
  row.vramGbMin = models.variants.find((v) => v.vramGbMin === Math.min(...models.variants.map((x) => x.vramGbMin)))?.vramGbMin ?? 12;

  // Three levels, never inferred from the model name:
  //   verified  — benchmarked here and the smallest quant fits.
  //   supported — fits the VRAM/driver floor, but we have not measured this card.
  //   not-supported — below the smallest VRAM floor; no download would load.
  if (!fit) {
    row.support = "not-supported";
    row.reason = `VRAM ${row.vramGb} GB is below the ${row.vramGbMin} GB floor of the smallest build`;
  } else if (row.evidence === "measured") {
    row.support = "verified";
    row.reason = null;
  } else {
    row.support = "supported";
    row.reason = "fits the VRAM and driver floor; throughput not measured on this card";
  }

  row.runnable = row.support !== "not-supported";
  // The build a user should download for this card, or null when there is none.
  row.recommendedBuild = row.runnable
    ? { variant: row.variant, runtime: row.runtime, platforms: row.platforms, driverMin: row.driverMin }
    : null;
}

const out = {
  generatedAt: new Date().toISOString(),
  baseModel: models.baseModel,
  variants: models.variants,
  counts: {
    total: rows.length,
    measured: rows.filter((r) => r.evidence === "measured").length,
    estimated: rows.filter((r) => r.evidence === "estimated").length,
    runnable: rows.filter((r) => r.runnable).length,
    verified: rows.filter((r) => r.support === "verified").length,
    supported: rows.filter((r) => r.support === "supported").length,
    notSupported: rows.filter((r) => r.support === "not-supported").length,
  },
  gpus: rows,
};

const dest = `${ROOT}apps/www/src/data/gpus.json`;
(await import("node:fs")).writeFileSync(dest, `${JSON.stringify(out, null, 2)}\n`);
console.log(`wrote ${dest}`);
console.log(JSON.stringify(out.counts));
