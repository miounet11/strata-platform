import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { gpuPath, gpuSeriesPath, gpuVendorPath } from "../src/lib/internal-links.ts";
import { modelNumber, vramLabel } from "../src/lib/gpu-naming.ts";

/**
 * These read the generated data directly rather than importing `lib/gpus`, because that module
 * pulls in JSON through the bundler's import assertions and `node --test` runs this file with no
 * loader. The invariants are the same ones the pages rely on.
 */
const catalogue = JSON.parse(readFileSync(new URL("../src/data/gpus.json", import.meta.url), "utf8")) as {
  counts: { total: number; measured: number; estimated: number; vendors: number; series: number };
  gpus: {
    id: string;
    slug: string;
    name: string;
    vendor: string;
    series: string;
    brand: string;
    vramGb: number;
    year: number;
    bandwidthGbs: number;
    evidence: "measured" | "estimated";
    support: string;
    quant: string | null;
    /** Silicon name; two rows that differ only here are different chips. */
    gpuName: string | null;
  }[];
};

const gpus = catalogue.gpus;

test("catalogue: thousands of cards, all with a unique slug and id", () => {
  assert.ok(gpus.length >= 3000, `expected 3000+ cards, got ${gpus.length}`);
  const slugs = new Set(gpus.map((gpu) => gpu.slug));
  const ids = new Set(gpus.map((gpu) => gpu.id));
  assert.equal(slugs.size, gpus.length, "duplicate slug would overwrite a detail page");
  assert.equal(ids.size, gpus.length, "duplicate id would overwrite a benchmark link");
  assert.equal(catalogue.counts.total, gpus.length);
});

test("catalogue: slugs are URL-safe and never collide with the static segments", () => {
  const reserved = new Set(["vendor", "series", "page", "index"]);
  for (const gpu of gpus) {
    assert.match(gpu.slug, /^[a-z0-9]+(?:-[a-z0-9]+)*$/, `unusable slug: ${gpu.slug}`);
    assert.ok(!reserved.has(gpu.slug), `slug shadows a route segment: ${gpu.slug}`);
  }
});

test("catalogue: every card names a vendor, series and brand", () => {
  for (const gpu of gpus) {
    assert.ok(gpu.name.trim(), `nameless card ${gpu.slug}`);
    assert.ok(gpu.vendor.trim(), `vendor missing on ${gpu.slug}`);
    assert.ok(gpu.series.trim(), `series missing on ${gpu.slug}`);
    assert.ok(gpu.brand.trim(), `brand missing on ${gpu.slug}`);
  }
});

test("catalogue: no record is a duplicate of another once identity fields are compared", () => {
  // Two cards may share a marketing name (RTX 3060 12 GB vs 8 GB), but not the whole tuple.
  // `gpuName` is part of it: HD 6550M ships as both Capilano and Lexington with identical
  // memory and clocks, and those are two chips, not one card listed twice.
  const seen = new Map<string, string>();
  for (const gpu of gpus) {
    const key = [gpu.name, gpu.vendor, gpu.series, gpu.vramGb, gpu.year, gpu.bandwidthGbs, gpu.gpuName]
      .join("|")
      .toLowerCase();
    const previous = seen.get(key);
    assert.equal(previous, undefined, `${gpu.slug} duplicates ${previous}`);
    seen.set(key, gpu.slug);
  }
});

test("catalogue: card counts per vendor add up to the total", () => {
  const byVendor = new Map<string, number>();
  for (const gpu of gpus) byVendor.set(gpu.vendor, (byVendor.get(gpu.vendor) ?? 0) + 1);
  assert.equal(byVendor.size, catalogue.counts.vendors);
  const sum = [...byVendor.values()].reduce((a, b) => a + b, 0);
  assert.equal(sum, gpus.length);
  // The four vendors with a release build must actually be represented in bulk.
  for (const vendor of ["nvidia", "amd", "intel"]) {
    assert.ok((byVendor.get(vendor) ?? 0) > 100, `${vendor} catalogue is too thin`);
  }
});

test("catalogue: evidence is labelled and measured throughput is preserved", () => {
  const measured = gpus.filter((gpu) => gpu.evidence === "measured");
  assert.equal(measured.length, catalogue.counts.measured);
  assert.ok(measured.length >= 9, "the locally benchmarked cards must survive regeneration");
  for (const gpu of gpus) {
    assert.ok(gpu.evidence === "measured" || gpu.evidence === "estimated");
    // An estimated card must never claim a verified run.
    if (gpu.evidence === "estimated") assert.notEqual(gpu.support, "verified");
  }
});

test("catalogue: a card below the quantization floor is marked unsupported, not runnable", () => {
  for (const gpu of gpus) {
    if (gpu.support === "not-supported") {
      assert.equal(gpu.quant, null, `${gpu.slug} claims a quantization while unsupported`);
    } else {
      assert.ok(gpu.quant, `${gpu.slug} is supported but has no quantization`);
    }
  }
});

test("series: every series page has at least one card and a distinct URL", () => {
  const bySeries = new Map<string, { vendor: string; count: number }>();
  for (const gpu of gpus) {
    const key = `${gpu.vendor}|${gpu.series}`;
    const entry = bySeries.get(key) ?? { vendor: gpu.vendor, count: 0 };
    entry.count++;
    bySeries.set(key, entry);
  }
  assert.equal(bySeries.size, catalogue.counts.series);

  const urls = new Set<string>();
  for (const [key, entry] of bySeries) {
    const series = key.split("|")[1];
    assert.ok(entry.count >= 1);
    const url = gpuSeriesPath(entry.vendor, seriesSlug(series));
    assert.ok(!urls.has(url), `two series collapse to ${url}`);
    urls.add(url);
  }
});

test("routes: brand and series paths are stable and unambiguous", () => {
  assert.equal(gpuPath("rtx-4090"), "/gpus/rtx-4090");
  assert.equal(gpuVendorPath("nvidia"), "/gpus/vendor/nvidia");
  assert.equal(gpuSeriesPath("nvidia", "geforce-rtx-40"), "/gpus/vendor/nvidia/geforce-rtx-40");
  // A slug must not escape its segment when the name contains a slash or a space.
  assert.equal(gpuSeriesPath("amd", "radeon rx 7000"), "/gpus/vendor/amd/radeon%20rx%207000");
});

/** Mirrors `seriesSlug` in `lib/gpus`: same rule, asserted here so a change breaks a test. */
function seriesSlug(series: string): string {
  return series
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

test("name duplication: a card whose name states its memory does not repeat it beside the name", () => {
  // 134 cards are named "RTX 4060 Ti 16GB", and every list rendered "RTX 4060 Ti 16GB · 16 GB".
  const named = catalogue.gpus.filter((g) => /(\d+)\s*GB\b/i.test(g.name));
  assert.ok(named.length > 0, "the catalogue is expected to contain cards named with their memory");
  for (const gpu of named) {
    const stated = Number(/(\d+)\s*GB\b/i.exec(gpu.name)?.[1]);
    if (stated !== gpu.vramGb) continue;
    assert.equal(vramLabel(gpu, "shared"), "", `${gpu.name} must not print its capacity twice`);
  }
  // A card whose name omits memory still shows it.
  assert.equal(vramLabel({ name: "RTX 4090", vramGb: 24 }, "shared"), "24 GB");
  // A shared-memory part says so instead of printing "0 GB".
  assert.equal(vramLabel({ name: "GMA", vramGb: 0 }, "Shared"), "Shared");
});

test("model number: the numeric part of a card name, used to order siblings", () => {
  assert.equal(modelNumber("GeForce RTX 4090 Max-Q"), "4090");
  assert.equal(modelNumber("RTX 4060 Ti 16GB"), "4060");
  assert.equal(modelNumber("RX 7900 XTX"), "7900");
  assert.equal(modelNumber("8514-Ultra"), "8514");
  assert.equal(modelNumber("GMA"), "");
});
