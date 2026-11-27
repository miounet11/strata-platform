import type { ToolDefinition, ToolSlug } from "./types";

export const TOOL_SLUGS: readonly ToolSlug[] = [
  "vram-visualizer",
  "gpu-compare",
  "quant-explorer",
  "install-wizard",
  "benchmark-scatter",
  "multi-gpu-planner",
  "pc-builder",
  "troubleshooter",
  "roi-calculator",
  "agent-studio",
] as const;

const SLUG_SET: ReadonlySet<string> = new Set(TOOL_SLUGS);

export function isToolSlug(s: string): s is ToolSlug {
  return SLUG_SET.has(s);
}

function define(tool: ToolDefinition): ToolDefinition {
  return tool;
}

export const ALL_TOOLS: readonly ToolDefinition[] = [
  define({
    slug: "vram-visualizer",
    category: "memory",
    priority: "P0",
    order: 1,
    badgeMetric: "VRAM fit",
    relatedSlugs: ["quant-explorer", "gpu-compare", "pc-builder"],
    ctaHref: "/models",
    keywords: ["vram", "memory", "fit", "context", "offload"],
  }),
  define({
    slug: "gpu-compare",
    category: "hardware",
    priority: "P0",
    order: 2,
    badgeMetric: "tok/s per $",
    relatedSlugs: ["vram-visualizer", "benchmark-scatter", "multi-gpu-planner"],
    ctaHref: "/gpus",
    keywords: ["gpu", "compare", "bandwidth", "tps", "price"],
  }),
  define({
    slug: "quant-explorer",
    category: "models",
    priority: "P0",
    order: 3,
    badgeMetric: "quant quality",
    relatedSlugs: ["vram-visualizer", "gpu-compare", "roi-calculator"],
    ctaHref: "/models",
    keywords: ["quant", "iq2", "iq3", "q2", "quality", "download"],
  }),
  define({
    slug: "install-wizard",
    category: "setup",
    priority: "P0",
    order: 4,
    badgeMetric: "time to run",
    relatedSlugs: ["troubleshooter", "agent-studio", "gpu-compare"],
    ctaHref: "/download",
    keywords: ["install", "setup", "driver", "cuda", "rocm", "metal"],
  }),
  define({
    slug: "benchmark-scatter",
    category: "hardware",
    priority: "P1",
    order: 5,
    badgeMetric: "29 rigs",
    relatedSlugs: ["gpu-compare", "roi-calculator", "pc-builder"],
    ctaHref: "/benchmarks",
    keywords: ["benchmark", "scatter", "throughput", "latency", "rig"],
  }),
  define({
    slug: "multi-gpu-planner",
    category: "hardware",
    priority: "P1",
    order: 6,
    badgeMetric: "PCIe lanes",
    relatedSlugs: ["gpu-compare", "pc-builder", "vram-visualizer"],
    ctaHref: "/builds",
    keywords: ["multi-gpu", "bifurcation", "pcie", "pooling", "psu"],
  }),
  define({
    slug: "pc-builder",
    category: "hardware",
    priority: "P1",
    order: 7,
    badgeMetric: "$ / tok/s",
    relatedSlugs: ["multi-gpu-planner", "vram-visualizer", "roi-calculator"],
    ctaHref: "/builds",
    keywords: ["pc", "build", "parts", "budget", "bom"],
  }),
  define({
    slug: "troubleshooter",
    category: "diagnostics",
    priority: "P1",
    order: 8,
    badgeMetric: "fix rate",
    relatedSlugs: ["install-wizard", "gpu-compare", "agent-studio"],
    ctaHref: "/issues",
    keywords: ["troubleshoot", "error", "driver", "fallback", "diagnostics"],
  }),
  define({
    slug: "roi-calculator",
    category: "economics",
    priority: "P2",
    order: 9,
    badgeMetric: "break-even",
    relatedSlugs: ["benchmark-scatter", "pc-builder", "quant-explorer"],
    ctaHref: "/benchmarks",
    keywords: ["roi", "cost", "electricity", "break-even", "api"],
  }),
  define({
    slug: "agent-studio",
    category: "models",
    priority: "P2",
    order: 10,
    badgeMetric: "agent loops",
    relatedSlugs: ["install-wizard", "troubleshooter", "quant-explorer"],
    ctaHref: "/guides",
    keywords: ["agent", "tools", "studio", "workflow", "prompts"],
  }),
];

export function getTool(slug: ToolSlug): ToolDefinition;
export function getTool(slug: string): ToolDefinition | undefined;
export function getTool(slug: string): ToolDefinition | undefined {
  return ALL_TOOLS.find((tool) => tool.slug === slug);
}
