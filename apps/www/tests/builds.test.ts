import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  BUILD_TIERS,
  allBuilds,
  annualPowerCostUsd,
  buildFaq,
  buildListText,
  buildPath,
  buildText,
  buildsForGpu,
  buildsForRig,
  filterBuilds,
  getBuild,
  relatedBuilds,
  sortBuilds,
  type PcBuild,
} from "../src/lib/builds.ts";

const LOCALES = ["en", "zh", "ja", "de", "fr", "es", "pt"] as const;

const REQUIRED = [
  ["rtx-4090-workstation", "rtx4090", "rtx-4090", 1, 24, "sweet-spot"],
  ["rtx-5090-flagship-build", "rtx5090", "rtx-5090", 1, 32, "flagship"],
  ["rtx-5080-balanced-ai-pc", "rtx5080", "rtx-5080", 1, 16, "sweet-spot"],
  ["rtx-5070-ti-creator-rig", "rtx5070", "rtx-5070-ti", 1, 16, "sweet-spot"],
  ["rtx-5070-12gb-entry-blackwell", "rtx5070_12gb", "rtx-5070", 1, 12, "budget"],
  ["rtx-4070-ti-super-silent-build", "rtx4070ti_super", "rtx-4070-ti-super-16gb", 1, 16, "sweet-spot"],
  ["rtx-3090-used-value-build", "rtx3090", "rtx-3090", 1, 24, "sweet-spot"],
  ["rtx-3090-ti-high-bandwidth", "rtx3090ti", "rtx-3090-ti", 1, 24, "sweet-spot"],
  ["dual-rtx-3090-48gb-workstation", "dual_rtx3090_24gb", "rtx-3090", 2, 48, "dual-gpu"],
  ["dual-rtx-5060-ti-32gb-build", "dual5060", "rtx-5060-ti-16gb", 2, 32, "dual-gpu"],
  ["dual-rtx-3060-24gb-budget-split", "dual_rtx3060_12gb", "rtx-3060-12gb", 2, 24, "budget"],
  ["dual-titan-rtx-48gb-workstation", "dual_titan_rtx_24gb", null, 2, 48, "dual-gpu"],
  ["rx-7900-xtx-rocm-linux-rig", "rx7900xtx", "amd-radeon-rx-7900-xtx", 1, 24, "sweet-spot"],
  ["rx-9070-xt-rdna4-build", "rx9070xt_16gb", "amd-radeon-rx-9070-xt-16gb", 1, 16, "budget"],
  ["rx-6900-xt-budget-rocm", "rx6900xt_16gb", "amd-radeon-rx-6900-xt-16gb", 1, 16, "budget"],
  ["dual-rx-6900-xt-32gb-rocm", "dual_rx6900xt_16gb", "amd-radeon-rx-6900-xt-16gb", 2, 32, "dual-gpu"],
  ["rtx-pro-6000-blackwell-96gb-tower", "rtxpro6000", "rtx-pro-6000-blackwell", 1, 96, "workstation"],
  ["rtx-a6000-48gb-ecc-workstation", null, "rtx-a6000", 1, 48, "workstation"],
  ["rtx-4080-super-gaming-ai-pc", null, "rtx-4080-super", 1, 16, "sweet-spot"],
  ["ryzen-ai-max-395-128gb-mini", "ryzen_ai_max_395_128", null, 1, 128, "compact-unified"],
  ["dgx-spark-128gb-desktop", "dgx", null, 1, 128, "compact-unified"],
  ["mac-studio-m5-ultra-96gb", "macstudio_m5ultra_96", "mac-studio-m5-ultra-96-gb", 1, 96, "compact-unified"],
  ["mac-studio-m5-ultra-256gb", "macstudio_m5ultra_256", "mac-studio-m5-ultra-256-gb", 1, 256, "workstation"],
  ["mac-mini-m5-pro-64gb-silent", "mac_mini_m5pro_64", "mac-mini-m5-pro-64-gb", 1, 64, "compact-unified"],
] as const;

const benchmarks = JSON.parse(readFileSync(new URL("../src/data/benchmarks.json", import.meta.url), "utf8")) as {
  rigs: {
    id: string;
    writingToks: number;
    readingToks: number;
    powerWatts: number;
    localCostPerMM: number;
    breakEvenDays: number;
    rigTotal: number;
    evidence: string;
  }[];
};

const gpuDoc = JSON.parse(readFileSync(new URL("../src/data/gpus.json", import.meta.url), "utf8")) as {
  gpus: { slug: string }[];
};

const gpuSlugs = new Set(gpuDoc.gpus.map((gpu) => gpu.slug));
const rigById = new Map(benchmarks.rigs.map((rig) => [rig.id, rig]));

function tokenSet(text: string): Set<string> {
  return new Set(text.toLowerCase().match(/[a-z0-9]+/g) ?? []);
}

function jaccard(a: Set<string>, b: Set<string>): number {
  let inter = 0;
  for (const token of a) if (b.has(token)) inter++;
  const union = a.size + b.size - inter;
  return union === 0 ? 0 : inter / union;
}

test("catalogue has exactly 24 unique URL-safe slugs", () => {
  const builds = allBuilds();
  assert.equal(builds.length, 24);
  assert.equal(new Set(builds.map((build) => build.slug)).size, 24);
  assert.deepEqual(
    builds.map((build) => build.slug),
    REQUIRED.map((row) => row[0]),
  );
  for (const build of builds) {
    assert.match(build.slug, /^[a-z0-9]+(?:-[a-z0-9]+)*$/);
    assert.equal(buildPath(build.slug), `/builds/${build.slug}`);
  }
  assert.equal(getBuild("missing-build"), undefined);
  assert.equal(getBuild("rtx-4090-workstation")?.gpuModel.includes("4090"), true);
});

test("identity fields match the 24-build contract", () => {
  assert.deepEqual([...BUILD_TIERS], ["budget", "sweet-spot", "dual-gpu", "workstation", "compact-unified", "flagship"]);
  const builds = allBuilds();
  for (const [slug, rigId, gpuSlug, gpuCount, vram, tier] of REQUIRED) {
    const build = getBuild(slug);
    assert.ok(build, slug);
    assert.equal(build.rigId, rigId);
    assert.equal(build.gpuSlug, gpuSlug);
    assert.equal(build.gpuCount, gpuCount);
    assert.equal(build.totalVramGb, vram);
    assert.equal(build.tier, tier);
  }
  assert.equal(builds.filter((build) => build.tier === "budget").length, 4);
  assert.equal(builds.filter((build) => build.vendor === "apple").length, 3);
});

test("every rigId matches benchmarks.json on throughput, power, cost and evidence", () => {
  for (const build of allBuilds()) {
    if (!build.rigId) continue;
    const rig = rigById.get(build.rigId);
    assert.ok(rig, build.rigId);
    assert.equal(build.writingToks, rig.writingToks);
    assert.equal(build.readingToks, rig.readingToks);
    assert.equal(build.loadWatts, rig.powerWatts);
    assert.equal(build.localCostPerMM, rig.localCostPerMM);
    assert.equal(build.breakEvenDays, rig.breakEvenDays);
    assert.equal(build.evidence, rig.evidence === "median" ? "measured" : "estimated");
    const ratio = build.totalPriceUsd / rig.rigTotal;
    assert.ok(ratio >= 0.95 && ratio <= 1.05, `${build.slug} price ${build.totalPriceUsd} vs ${rig.rigTotal}`);
  }
  assert.equal(getBuild("rtx-a6000-48gb-ecc-workstation")?.evidence, "estimated");
  assert.equal(getBuild("rtx-4080-super-gaming-ai-pc")?.evidence, "estimated");
});

test("every gpuSlug exists in gpus.json and null slugs stay null", () => {
  for (const build of allBuilds()) {
    if (build.gpuSlug == null) {
      assert.equal(build.gpuSlug, null);
      continue;
    }
    assert.equal(gpuSlugs.has(build.gpuSlug), true, build.gpuSlug);
  }
  assert.equal(getBuild("dual-titan-rtx-48gb-workstation")?.gpuSlug, null);
  assert.equal(getBuild("dgx-spark-128gb-desktop")?.gpuSlug, null);
  assert.equal(getBuild("ryzen-ai-max-395-128gb-mini")?.gpuSlug, null);
});

test("bill of materials sums exactly to totalPriceUsd", () => {
  for (const build of allBuilds()) {
    assert.ok(build.bom.length >= 1, build.slug);
    const sum = build.bom.reduce((total, part) => total + part.priceUsd, 0);
    assert.equal(sum, build.totalPriceUsd, build.slug);
    for (const part of build.bom) {
      assert.ok(part.model.trim(), build.slug);
      assert.ok(part.spec.trim(), build.slug);
      assert.equal(Number.isFinite(part.priceUsd), true);
    }
  }
});

test("workloads, assembly notes and FAQ exist in all seven locales", () => {
  const models = [
    "Qwen3.8-Flash-Next (125B MoE)",
    "Qwen3-Coder (32B)",
    "DeepSeek-R1 (70B Q4)",
    "Llama-3.3 (70B Q4)",
  ];
  for (const build of allBuilds()) {
    assert.deepEqual(
      build.workloads.map((row) => row.model),
      models,
      build.slug,
    );
    for (const row of build.workloads) {
      assert.ok(row.quant.trim());
      assert.ok(row.estWriteTps > 0);
      assert.ok(row.maxContextK > 0);
      assert.ok(row.fit === "full-vram" || row.fit === "hybrid-offload" || row.fit === "unified");
    }
    for (const locale of LOCALES) {
      for (const field of ["title", "tagline", "summary", "bestFor", "tradeoffs"] as const) {
        const text = build[field][locale];
        assert.equal(typeof text, "string");
        assert.ok(text.trim(), `${build.slug} ${field}.${locale}`);
        if (locale !== "en") assert.notEqual(text, build[field].en);
      }
      assert.ok(build.assemblyNotes[locale].length >= 4, `${build.slug} notes ${locale}`);
      assert.equal(build.faq[locale].length, 3, `${build.slug} faq ${locale}`);
      for (const note of build.assemblyNotes[locale]) assert.ok(note.trim());
      for (const item of build.faq[locale]) {
        assert.ok(item.q.trim());
        assert.ok(item.a.trim());
      }
      assert.ok(/\p{Script=Han}/u.test(build.summary.zh));
      assert.ok(/\p{Script=Hiragana}/u.test(build.summary.ja));
    }
  }
});

test("image prompts are long enough and forbid rendered text", () => {
  for (const build of allBuilds()) {
    const words = build.imagePrompt.split(/\s+/).filter(Boolean);
    assert.ok(words.length >= 35, `${build.slug} ${words.length}`);
    assert.ok(build.imagePrompt.includes("zero text"), build.slug);
    assert.ok(build.imagePrompt.endsWith("zero text, no labels, no watermark"), build.slug);
  }
});

test("buildsForGpu and buildsForRig return the right machines", () => {
  const ada = buildsForGpu("rtx-4090");
  assert.deepEqual(ada.map((build) => build.slug), ["rtx-4090-workstation"]);

  const ampere = buildsForGpu("rtx-3090");
  assert.deepEqual(ampere.map((build) => build.slug), [
    "rtx-3090-used-value-build",
    "dual-rtx-3090-48gb-workstation",
  ]);
  assert.ok((ampere[0].localCostPerMM ?? 999) <= (ampere[1].localCostPerMM ?? 999));

  const xtx = buildsForRig("rx7900xtx");
  assert.deepEqual(xtx.map((build) => build.slug), ["rx-7900-xtx-rocm-linux-rig"]);
  assert.deepEqual(buildsForRig("no-such-rig"), []);
  assert.deepEqual(buildsForGpu("no-such-gpu"), []);
});

test("filterBuilds narrows by tier, vendor, VRAM, price and text", () => {
  const budget = filterBuilds({ tier: "budget" });
  assert.ok(budget.length >= 4);
  assert.ok(budget.every((build) => build.tier === "budget"));
  assert.ok(budget.some((build) => build.slug === "rtx-5070-12gb-entry-blackwell"));

  const apple = filterBuilds({ vendor: "apple" });
  assert.equal(apple.length, 3);
  assert.ok(apple.every((build) => build.vendor === "apple"));

  const huge = filterBuilds({ minVram: 96 });
  assert.ok(huge.every((build) => build.totalVramGb >= 96));
  assert.equal(filterBuilds({ minVram: 256 }).length, 1);

  const cheap = filterBuilds({ maxPrice: 2000 });
  assert.ok(cheap.every((build) => build.totalPriceUsd <= 2000));
  assert.ok(cheap.some((build) => build.slug === "rx-6900-xt-budget-rocm"));
  assert.equal(filterBuilds({ maxPrice: 0 }).length, 24);

  const titan = filterBuilds({ query: "TITAN", locale: "en" });
  assert.ok(titan.some((build) => build.slug === "dual-titan-rtx-48gb-workstation"));

  const zh = getBuild("rtx-4090-workstation");
  assert.ok(zh);
  const hits = filterBuilds({ query: buildText(zh.title, "zh"), locale: "zh" });
  assert.ok(hits.some((build) => build.slug === zh.slug));

  assert.equal(filterBuilds({ tier: "all", vendor: "all" }).length, 24);
  assert.equal(filterBuilds({ tier: "flagship", vendor: "amd" }).length, 0);
});

test("sortBuilds orders cost, speed, price, VRAM and power without mutating input", () => {
  const input = allBuilds();
  const before = input.map((build) => build.slug).join("|");

  const byCost = sortBuilds(input, "cost");
  const bySpeed = sortBuilds(input, "speed");
  const byPrice = sortBuilds(input, "price");
  const byVram = sortBuilds(input, "vram");
  const byPower = sortBuilds(input, "power");

  assert.equal(input.map((build) => build.slug).join("|"), before);
  assert.equal(byCost[0].slug, "rtx-4090-workstation");
  assert.equal(bySpeed[0].slug, "rtx-pro-6000-blackwell-96gb-tower");
  assert.equal(byPrice[0].slug, "rx-6900-xt-budget-rocm");
  assert.equal(byVram[0].slug, "mac-studio-m5-ultra-256gb");
  assert.equal(byPower[0].slug, "mac-mini-m5-pro-64gb-silent");

  assertMonotonic(byCost, (build) => build.localCostPerMM ?? Number.POSITIVE_INFINITY, true);
  assertMonotonic(bySpeed, (build) => build.writingToks, false);
  assertMonotonic(byPrice, (build) => build.totalPriceUsd, true);
  assertMonotonic(byVram, (build) => build.totalVramGb, false);
  assertMonotonic(byPower, (build) => build.loadWatts, true);
});

function assertMonotonic(list: PcBuild[], value: (build: PcBuild) => number, ascending: boolean) {
  for (let i = 1; i < list.length; i++) {
    const prev = value(list[i - 1]);
    const next = value(list[i]);
    if (ascending) assert.ok(prev <= next);
    else assert.ok(prev >= next);
  }
}

test("relatedBuilds excludes self and respects the limit", () => {
  const reference = getBuild("rtx-4090-workstation");
  assert.ok(reference);
  assert.deepEqual(
    relatedBuilds(reference, 3).map((build) => build.slug),
    [
      "ryzen-ai-max-395-128gb-mini",
      "dual-rtx-3090-48gb-workstation",
      "dual-rtx-5060-ti-32gb-build",
    ],
  );
  assert.equal(relatedBuilds(reference, 0).length, 0);
  for (const build of allBuilds()) {
    const list = relatedBuilds(build, 4);
    assert.ok(list.length <= 4);
    assert.equal(list.some((item) => item.slug === build.slug), false);
    assert.equal(new Set(list.map((item) => item.slug)).size, list.length);
  }
});

test("annualPowerCostUsd is deterministic and positive", () => {
  assert.equal(annualPowerCostUsd(550, 80, 8, 0.15), 310.98);
  assert.equal(annualPowerCostUsd(550, 80, 8), 310.98);
  assert.equal(annualPowerCostUsd(100, 20, 4, 0.2), annualPowerCostUsd(100, 20, 4, 0.2));
  assert.ok(annualPowerCostUsd(200, 40, 6) > 0);
  assert.ok(annualPowerCostUsd(0, 30, 0) > 0);
});

test("English summaries stay under a Jaccard ceiling of 0.55", () => {
  const builds = allBuilds();
  const sets = builds.map((build) => tokenSet(build.summary.en));
  let worst = 0;
  let pair = "";
  for (let i = 0; i < sets.length; i++) {
    for (let j = i + 1; j < sets.length; j++) {
      const score = jaccard(sets[i], sets[j]);
      if (score > worst) {
        worst = score;
        pair = `${builds[i].slug} :: ${builds[j].slug}`;
      }
    }
  }
  assert.ok(worst < 0.55, `${pair} scored ${worst}`);
});

test("builds.ts does not import node:fs", () => {
  const source = readFileSync(new URL("../src/lib/builds.ts", import.meta.url), "utf8");
  assert.equal(/\bnode:fs\b/.test(source), false);
  assert.equal(/from\s+["']fs["']/.test(source), false);
  assert.equal(/\bcreateRequire\b/.test(source), false);
  assert.equal(/\breadFileSync\b/.test(source), false);
});

test("locale helpers fall back to English", () => {
  const build = getBuild("mac-mini-m5-pro-64gb-silent");
  assert.ok(build);
  assert.equal(buildText(build.title, "zz"), build.title.en);
  assert.equal(buildText(build.title, "pt"), build.title.pt);
  assert.ok(buildListText(build.assemblyNotes, "es").length >= 4);
  assert.equal(buildListText({ en: ["only"], zh: [] }, "zh")[0], "only");
  assert.equal(buildFaq(build, "no-such")[0].q, build.faq.en[0].q);
  assert.equal(buildFaq(build, "de").length, 3);
});

test("the suite itself contains at least 15 cases", () => {
  const source = readFileSync(new URL("./builds.test.ts", import.meta.url), "utf8");
  const cases = source.split("\n").filter((line) => line.startsWith("test("));
  assert.ok(cases.length >= 15, `found ${cases.length}`);
});
