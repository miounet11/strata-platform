// Turns the curated rows + the TechPowerUp export into the site catalogue.
//
// Two sources, one output:
//   curated — hand-maintained rows with measured tok/s (benchmarks.json). Their ids, slugs and
//             numbers are the site's history; they must survive a regeneration untouched.
//   bulk    — scripts/gpus/data/gpus.csv, a TechPowerUp export: 3,203 rows of real hardware with
//             memory size, bandwidth, TDP, bus, process and release date. No throughput is
//             measured for these, so they are `estimated` from bandwidth and labelled as such.
//
// Rules that keep the output honest:
//   * a curated row wins over a bulk row with the same hardware (matched by name + memory);
//   * a bulk row without a memory size is not a card we can reason about, so it is skipped;
//   * two bulk rows are the same hardware only when name, brand, memory, release date and GPU
//     name all agree — anything less merges distinct chips (four "Radeon Vega 8 Mobile" exist);
//   * `evidence` is never upgraded to `measured` by estimation.

import { readFileSync, writeFileSync } from "node:fs";

const ROOT = new URL("../..", import.meta.url).pathname;
const benchmarks = JSON.parse(readFileSync(`${ROOT}apps/www/src/data/benchmarks.json`, "utf8"));
const models = JSON.parse(readFileSync(`${ROOT}apps/www/src/data/models.json`, "utf8"));
const measuredById = new Map(benchmarks.rigs.map((r) => [r.id, r]));

/** Memory bandwidth in GB/s, for curated rows whose CSV twin is absent. */
const BANDWIDTH = {
  rtx5090: 1792, rtx5080: 960, rtx5070ti: 896, rtx5070: 672, rtx5060ti: 448,
  rtx4090: 1008, rtx4080super: 736, rtx4080: 717, rtx4070tisuper: 672, rtx4070ti: 504,
  rtx4070super: 504, rtx4070: 504, rtx4060ti: 288, rtx4060: 272,
  rtx3090ti: 1008, rtx3090: 936, rtx3080ti: 912, rtx3080: 760, rtx3070ti: 608,
  rtx3070: 448, rtx3060ti: 448, rtx3060: 360,
  rtxa6000: 960, rtxpro6000: 1792, rtxa5000: 768, rtxa4000: 448,
  rx7900xtx: 960, rx7900xt: 800, rx7800xt: 624, rx7700xt: 432,
  rx9070xt: 645, rx9070: 645, rx9060xt: 322,
  rx6950xt: 576, rx6900xt: 512, rx6800xt: 512, rx6800: 512, rx6700xt: 384,
  m5ultra: 819, m5max: 546, m5pro: 273, m4max: 546, m4pro: 273, m3ultra: 819, m3max: 546,
  m2ultra: 819, m2max: 546, m1ultra: 819, m1max: 546,
  rtx2080ti: 616, rtx2080super: 496, rtx2080: 448, rtx2070super: 448, rtx2070: 448,
  rtx2060super: 448, rtx2060_12: 336, rtx2060: 336, gtx1660ti: 288, gtx1660super: 336, gtx1650super: 192,
  gtx1080ti: 484, gtx1080: 320, gtx1070ti: 256, gtx1070: 256, gtx1060_6: 192,
  rtxpro5000: 1344, rtxpro4000: 672, h100_80: 3350, a100_80: 2039, a100_40: 1555,
  l40s: 864, l4: 300, rtxa6000_ada: 960,
  rx6750xt: 432, rx6650xt: 280, rx6600xt: 256, rx6600: 224, rx5700xt: 448, rxvega64: 484,
  radeonpro_w7900: 864, radeonpro_w7800: 576, mi300x: 5300, mi210: 1638,
  rx7900gre: 576, rx7650gre: 256,
  arc_b580: 456, arc_b570: 380, arc_a770: 560, arc_a750: 512,
};

/**
 * `estimate` scales throughput from memory bandwidth.
 *
 * RTX 4090 (1008 GB/s) measures 4000 read / 109.3 write tok/s. Linear scaling ranks cards well
 * enough to answer "can it run" and "roughly how fast", which is what these pages are for; it is
 * not accurate enough to publish as a benchmark, hence `evidence: "estimated"` everywhere.
 */
function estimate(bw) {
  if (!bw) return { readingTps: 0, writingTps: 0 };
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
  ["rtx2080ti", "RTX 2080 Ti", 11, "Turing", 2018], ["rtx2080super", "RTX 2080 SUPER", 8, "Turing", 2019],
  ["rtx2080", "RTX 2080", 8, "Turing", 2018], ["rtx2070super", "RTX 2070 SUPER", 8, "Turing", 2019],
  ["rtx2070", "RTX 2070", 8, "Turing", 2018], ["rtx2060super", "RTX 2060 SUPER", 8, "Turing", 2019],
  ["rtx2060_12", "RTX 2060 12GB", 12, "Turing", 2021], ["rtx2060", "RTX 2060", 6, "Turing", 2019],
  ["gtx1660ti", "GTX 1660 Ti", 6, "Turing", 2019], ["gtx1660super", "GTX 1660 SUPER", 6, "Turing", 2019],
  ["gtx1650super", "GTX 1650 SUPER", 4, "Turing", 2019],
  ["gtx1080ti", "GTX 1080 Ti", 11, "Pascal", 2017], ["gtx1080", "GTX 1080", 8, "Pascal", 2016],
  ["gtx1070ti", "GTX 1070 Ti", 8, "Pascal", 2017], ["gtx1070", "GTX 1070", 8, "Pascal", 2016],
  ["gtx1060_6", "GTX 1060 6GB", 6, "Pascal", 2016],
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
  ["rx5700xt", "AMD Radeon RX 5700 XT", 8, "RDNA", 2019],
  ["rxvega64", "AMD Radeon RX Vega 64", 8, "Vega", 2017],
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
 * Series for a curated row, derived the same way as the bulk rows.
 *
 * The curated tables carry no generation column, so without this the 101 rows closest to the
 * site's actual benchmarks would be the only ones missing from every series page.
 */
/**
 * Generation bucket for a model number.
 *
 * NVIDIA and AMD number their ranges differently, so one rule cannot serve both: GeForce 4090
 * is "RTX 40" (first two digits) while Radeon RX 7900 is "RX 7000" (first digit + zeros). Guessing
 * with a single formula produced buckets like "RTX 400" that match nothing anyone searches for.
 */
function bucketOf(family, digits) {
  if (!digits) return "";
  const amd = /^rx$/i.test(family) || /radeon/i.test(family);
  if (amd) return `${digits[0]}${"0".repeat(Math.max(digits.length - 1, 2))}`;
  return digits.length >= 4 ? digits.slice(0, 2) : `${digits[0]}0`;
}

function seriesForName(rawName) {
  // Curated rows keep the vendor prefix ("AMD Radeon RX 7900 XTX", "NVIDIA H100 80GB") while the
  // CSV does not, so strip it before matching or half the catalogue lands in "Other".
  const vendor = /^(NVIDIA|AMD|Intel|Apple)\s+/i.exec(rawName)?.[1]?.toUpperCase() ?? "";
  const name = rawName.replace(/^(NVIDIA|AMD|Intel|Apple)\s+/i, "");
  // "Mobility Radeon 7500" is a Radeon family part; the form factor is not the family.
  const mobile = /^Mobility\s+(Radeon|FireGL|FirePro)\s*/i.exec(name);
  if (mobile) {
    const digits = /(\d{2,5})/.exec(name)?.[1] ?? "";
    return ["Mobility", mobile[1], bucketOf(mobile[1], digits)].filter(Boolean).join(" ");
  }
  // "GeForce RTX 5070 Ti" → "GeForce RTX 50"; "Radeon RX 7900 XTX" → "Radeon RX 7000";
  // "GeForce2 MX" → "GeForce2"; "i740 Graphics" → "Intel i740". The digit group is optional so
  // family names written without a space ("GeForce2") still match.
  const tiered =
    /^(GeForce|Radeon|Quadro|Tesla|Titan|Instinct|Arc|Rage|Mobility)\s*(\d*)\s*(RTX|GTX|GTS|RX|Arc)?\s*([A-Z]?\d{2,5})?/i.exec(
      name,
    );
  if (tiered && (tiered[2] || tiered[3] || tiered[4])) {
    const family = tiered[1] + (tiered[2] ?? "");
    const badge = tiered[3] ?? "";
    const bucket = bucketOf(badge || family, tiered[4] ?? "");
    return [family, badge, bucket].filter(Boolean).join(" ");
  }
  // Curated names drop the vendor prefix ("RTX 5090"), so the badge alone is the family. Map it
  // back to the vendor's own naming, or these rows land in "RTX 40" while the CSV rows land in
  // "GeForce RTX 40" and the series pages split in two.
  const badgeOnly = /^(RTX|GTX|RX|Arc)\s*([A-Z]?\d{2,5})/i.exec(name);
  if (badgeOnly) {
    const badge = badgeOnly[1].toUpperCase();
    const family = badge === "RX" ? "Radeon" : badge === "ARC" ? "Arc" : "GeForce";
    return [family, badge === "ARC" ? "" : badge, bucketOf(badge, badgeOnly[2])].filter(Boolean).join(" ");
  }
  const display = /^(MacBook Pro|MacBook Air|Mac Studio|Mac mini|iMac|Mac Pro)\b/i.exec(name);
  if (display) return display[1];
  const intel = /^i\d{3}/i.exec(name);
  if (intel) return `Intel ${intel[0]}`;
  // Workstation and datacenter parts have no model number to bucket: "RTX PRO 6000" is a family
  // of its own, and "NVIDIA H100 80GB" belongs with the H-series, not scattered into "Other".
  const pro = /^(?:NVIDIA\s+)?(RTX PRO)\s*(\d)/i.exec(name);
  if (pro) return `${pro[1].toUpperCase()} ${pro[2]}0`;
  const datacenter = /^([HABLM]\d{2,3}X?)\b/i.exec(name);
  if (datacenter) return `${vendor || "NVIDIA"} ${datacenter[1].toUpperCase()}`;
  const family = /^(GeForce|Radeon|Arc|Quadro|Tesla|Titan|Instinct|FirePro|FireGL|Matrox|Rage|S3|SiS|VIA|XGI)\b/i.exec(name);
  return family ? family[1] : "Other";
}

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
      series: seriesForName(name),
      vramGb: vram,
      year,
      bandwidthGbs: bw,
      readingTps: measured?.readingToks ?? est.readingTps,
      writingTps: measured?.writingToks ?? est.writingTps,
      evidence: measured ? "measured" : "estimated",
      cardPrice: measured?.cardPrice ?? null,
      powerWatts: measured?.powerWatts ?? null,
      memoryType: null,
      bus: null,
      process: null,
      gpuName: null,
      brand: vendor === "nvidia" ? "NVIDIA" : vendor === "amd" ? "AMD" : vendor === "intel" ? "Intel" : "Apple",
    };
  });
}

const curated = [
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

// ---------------------------------------------------------------------------------------------
// Bulk source
// ---------------------------------------------------------------------------------------------

/** RFC 4180 CSV: quotes escaped by doubling, commas and newlines legal inside quotes. */
function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (ch === '"') {
        quoted = false;
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      quoted = true;
    } else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (ch !== "\r") {
      field += ch;
    }
  }
  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

const csv = parseCsv(readFileSync(`${ROOT}scripts/gpus/data/gpus.csv`, "utf8"));
const header = csv[0];
const COL = Object.fromEntries(header.map((name, i) => [name, i]));
const cell = (row, name) => (COL[name] === undefined ? "" : (row[COL[name]] ?? "").trim());

const VENDOR_OF_BRAND = {
  NVIDIA: "nvidia",
  AMD: "amd",
  ATI: "amd",
  Intel: "intel",
  Matrox: "matrox",
  "3dfx": "3dfx",
  XGI: "xgi",
  SiS: "sis",
  Sony: "sony",
  S3: "s3",
  VIA: "via",
};

/**
 * "8 GB" → 8; "256 MB" → 0.25; "32 KB" → 0.000031; "System Shared" → 0.
 *
 * Early cards are measured in KB, and integrated GPUs have no dedicated memory at all. Both are
 * real hardware from the same database and belong in a catalogue that claims to cover the line,
 * so they are kept: the KB cards simply fail the VRAM floor, and the shared ones are labelled
 * rather than shown as "0 GB VRAM", which would read as a typo.
 */
function memoryGb(text) {
  if (/system shared/i.test(text)) return 0;
  const m = /([\d.]+)\s*(KB|MB|GB)/i.exec(text);
  if (!m) return null;
  const value = Number(m[1]);
  const unit = m[2].toUpperCase();
  const gb = unit === "KB" ? value / 1024 / 1024 : unit === "MB" ? value / 1024 : value;
  return gb > 0 ? Math.round(gb * 10000) / 10000 : null;
}

function bandwidthGbs(text) {
  const m = /([\d.]+)/.exec(text);
  if (!m) return 0;
  return /gb\/s/i.test(text) ? Number(m[1]) : /mb\/s/i.test(text) ? Number(m[1]) / 1024 : Number(m[1]);
}

function watts(text) {
  const m = /(\d+(?:\.\d+)?)/.exec(text);
  return m ? Number(m[1]) : null;
}

function releaseYear(text) {
  const m = /(19|20)\d{2}/.exec(text);
  return m ? Number(m[0]) : null;
}

/**
 * The architecture label shown on the card. The export has both a marketing generation
 * ("Navi III (RX 7000)") and the chip family ("Navi 31"); the generation is what a reader
 * recognises, so it wins, with the chip family kept for the specs table.
 */
function archOf(row) {
  const generation = cell(row, "Graphics Card__Generation");
  const architecture = cell(row, "Graphics Processor__Architecture");
  return (generation || architecture || "Unknown").replace(/\s*\(.*?\)\s*/g, " ").trim();
}

/**
 * Series grouping: what a person would call the family.
 *
 * The `Generation` column is ideal but missing on 1,458 rows, so fall back to the model prefix
 * (GeForce RTX 40, Radeon RX 7000, Arc B). Falling back to "Other" would put half the catalogue
 * in one meaningless bucket and make the series pages useless.
 */
function seriesOf(row) {
  const generation = cell(row, "Graphics Card__Generation");
  if (generation) return generation.replace(/\s*\(.*?\)\s*/g, " ").trim();

  const name = cell(row, "Name");
  const series = seriesForName(name);
  // A bare family name is still a usable bucket; "Other" means nothing was recognised at all.
  return series;
}

function slugOf(row, vendor) {
  const base = slugify(cell(row, "Name"));
  // "2.5 GB" → "2-5gb", not "2.5gb": a dot in a path segment is legal but surprising, and the
  // slug must match the `[a-z0-9-]` shape the rest of the site's URLs follow.
  const vram = slugify(cell(row, "Memory__Memory Size")).replace(/(\d)-(\d)/g, "$1-$2");
  const year = String(releaseYear(cell(row, "Graphics Card__Release Date")) ?? "");
  // Same name, different memory or year, is different hardware and needs a different URL.
  return [vendor, base, vram, year].filter(Boolean).join("-");
}

/**
 * Distinct hardware = name + brand + memory + release date + GPU name.
 *
 * Bus interface is deliberately excluded: the same chip is listed once per interface with
 * identical memory and clock, which is the same card in two slots, not two products. Including
 * it produced pairs whose pages were byte-identical apart from one trait.
 */
function bulkKey(row) {
  return [
    cell(row, "Brand"),
    cell(row, "Name"),
    cell(row, "Memory__Memory Size"),
    cell(row, "Graphics Card__Release Date"),
    cell(row, "Graphics Processor__GPU Name"),
  ]
    .map((part) => part.toLowerCase())
    .join("|");
}

const seenBulk = new Set();
const bulk = [];
for (const row of csv.slice(1)) {
  const brand = cell(row, "Brand");
  const vendor = VENDOR_OF_BRAND[brand];
  if (!vendor) continue;
  const name = cell(row, "Name");
  if (!name) continue;
  const vramGb = memoryGb(cell(row, "Memory__Memory Size"));
  // Without a memory size there is no compatibility answer to give, so the row is not a card.
  if (vramGb == null) continue;
  const key = bulkKey(row);
  if (seenBulk.has(key)) continue;
  seenBulk.add(key);

  const bandwidthGbsValue = bandwidthGbs(cell(row, "Memory__Bandwidth"));
  const est = estimate(bandwidthGbsValue);
  bulk.push({
    id: slugOf(row, vendor),
    slug: slugOf(row, vendor),
    name,
    vendor,
    arch: archOf(row),
    series: seriesOf(row),
    vramGb,
    year: releaseYear(cell(row, "Graphics Card__Release Date")),
    bandwidthGbs: Math.round(bandwidthGbsValue * 100) / 100,
    readingTps: est.readingTps,
    writingTps: est.writingTps,
    evidence: "estimated",
    cardPrice: null,
    powerWatts: watts(cell(row, "Board Design__TDP")),
    memoryType: cell(row, "Memory__Memory Type") || null,
    bus: cell(row, "Graphics Card__Bus Interface") || null,
    process: cell(row, "Graphics Processor__Process Size") || null,
    gpuName: cell(row, "Graphics Processor__GPU Name") || null,
    brand,
  });
}

// ---------------------------------------------------------------------------------------------
// Merge
// ---------------------------------------------------------------------------------------------

const norm = (s) => (s ?? "").toLowerCase().replace(/\s+/g, " ").replace(/(\d)\s*gb\b/g, "$1gb").trim();

/** Curated wins: it carries measured tok/s and a slug the site has already published. */
const curatedNames = new Set(curated.map((row) => norm(row.name)));
const merged = [...curated];
for (const row of bulk) {
  if (curatedNames.has(norm(row.name))) continue;
  merged.push(row);
}

const usedSlugs = new Set();
const usedIds = new Set();
for (const row of merged) {
  // Slugs must be stable and unique; a collision gets a numeric suffix, never a dropped page.
  let slug = row.slug;
  let n = 2;
  while (usedSlugs.has(slug)) slug = `${row.slug}-${n++}`;
  usedSlugs.add(slug);
  row.slug = slug;
  let id = row.id;
  n = 2;
  while (usedIds.has(id)) id = `${row.id}-${n++}`;
  usedIds.add(id);
  row.id = id;
}

// ---------------------------------------------------------------------------------------------
// Compatibility (unchanged rules; only the row set grew)
// ---------------------------------------------------------------------------------------------

const PLATFORM = {
  nvidia: ["windows", "linux"],
  amd: ["windows", "linux"],
  intel: ["windows", "linux"],
  apple: ["macos"],
  matrox: [],
  "3dfx": [],
  xgi: [],
  sis: [],
  sony: [],
  s3: [],
  via: [],
};
const RUNTIME = {
  nvidia: "CUDA",
  amd: "ROCm",
  intel: "oneAPI/SYCL",
  apple: "Metal",
  matrox: "legacy",
  "3dfx": "legacy",
  xgi: "legacy",
  sis: "legacy",
  sony: "legacy",
  s3: "legacy",
  via: "legacy",
};
const DRIVER_MIN = {
  nvidia: "NVIDIA 580.65+ (CUDA 13)",
  "nvidia-legacy": "NVIDIA 525.60+ (CUDA 12)",
  amd: "AMD Adrenalin 24.6.1+ (ROCm 6)",
  "amd-legacy": "AMD Adrenalin 24.6.1+ (ROCm 6)",
  apple: "macOS 14+ (Metal 3)",
  intel: "Intel Arc driver 32.0.101.6+ (oneAPI)",
  legacy: "No shipped build targets this vendor",
};
/** Vendors with a release build. Everything else is a catalogue entry, not a download target. */
const SUPPORTED_VENDORS = new Set(["nvidia", "amd", "intel", "apple"]);

const smallestFloor = models.variants.reduce((min, v) => Math.min(min, v.vramGbMin), Infinity);
const byFloor = [...models.variants].sort((a, b) => b.vramGbMin - a.vramGbMin);

for (const row of merged) {
  const fit = byFloor.find((v) => row.vramGb >= v.vramGbMin);
  row.quant = fit?.id ?? null;
  row.variant =
    row.vendor === "nvidia"
      ? ["Ampere", "Turing", "Pascal", "Maxwell", "Kepler", "Fermi"].some((a) => row.arch.includes(a))
        ? "nvidia-legacy"
        : "nvidia"
      : row.vendor === "amd"
        ? ["GCN", "Vega", "Polaris", "RDNA", "TeraScale"].some((a) => row.arch.includes(a))
          ? "amd-legacy"
          : "amd"
        : row.vendor === "intel"
          ? "intel"
          : row.vendor === "apple"
            ? "apple"
            : "legacy";

  row.platforms = PLATFORM[row.vendor] ?? [];
  row.runtime = RUNTIME[row.vendor] ?? "legacy";
  row.driverMin = DRIVER_MIN[row.variant] ?? DRIVER_MIN.legacy;
  row.vramGbMin = smallestFloor;

  if (!SUPPORTED_VENDORS.has(row.vendor)) {
    // A 3dfx card cannot run the release at all — no build, no driver, no runtime.
    row.support = "not-supported";
    row.reason = "no release build targets this vendor";
  } else if (!fit) {
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
  row.recommendedBuild = row.runnable
    ? { variant: row.variant, runtime: row.runtime, platforms: row.platforms, driverMin: row.driverMin }
    : null;
}

const seriesCount = new Map();
for (const row of merged) {
  const key = `${row.vendor}|${row.series ?? row.arch}`;
  seriesCount.set(key, (seriesCount.get(key) ?? 0) + 1);
}

const out = {
  generatedAt: new Date().toISOString(),
  baseModel: models.baseModel,
  variants: models.variants,
  counts: {
    total: merged.length,
    measured: merged.filter((r) => r.evidence === "measured").length,
    estimated: merged.filter((r) => r.evidence === "estimated").length,
    runnable: merged.filter((r) => r.runnable).length,
    verified: merged.filter((r) => r.support === "verified").length,
    supported: merged.filter((r) => r.support === "supported").length,
    notSupported: merged.filter((r) => r.support === "not-supported").length,
    vendors: new Set(merged.map((r) => r.vendor)).size,
    series: seriesCount.size,
    curated: curated.length,
    fromCsv: merged.length - curated.length,
  },
  gpus: merged,
};

writeFileSync(`${ROOT}apps/www/src/data/gpus.json`, `${JSON.stringify(out, null, 2)}\n`);
console.log(JSON.stringify(out.counts, null, 2));
