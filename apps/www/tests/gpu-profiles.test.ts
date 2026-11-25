import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import type { Gpu, QuantVariant } from "../src/lib/gpus.ts";
import { gpuHardwareProfile, type GpuHardwareProfile, type GpuQuantRow } from "../src/lib/gpu-profiles.ts";

const catalogue = JSON.parse(readFileSync(new URL("../src/data/gpus.json", import.meta.url), "utf8")) as {
  variants: QuantVariant[];
  gpus: Gpu[];
};

const gpus = catalogue.gpus;
const variants = catalogue.variants;

function bySlug(slug: string): Gpu {
  const gpu = gpus.find((entry) => entry.slug === slug);
  assert.ok(gpu, `missing ${slug}`);
  return gpu;
}

function profileOf(slug: string): GpuHardwareProfile {
  return gpuHardwareProfile(bySlug(slug), variants);
}

function row(profile: GpuHardwareProfile, id: string): GpuQuantRow {
  const match = profile.quantMatrix.find((entry) => entry.id === id);
  assert.ok(match, `missing quant ${id}`);
  return match;
}

const FITS = new Set(["full-vram", "hybrid-offload", "too-small"]);
const CONTEXTS = new Set([0, 8, 16, 32, 64, 128]);
const COOLING = new Set(["unified-silent", "compact-air", "high-airflow-tower", "workstation-blower-or-aio"]);

function assertCleanNumber(value: number, label: string): void {
  assert.equal(Number.isFinite(value), true, `${label} is not finite`);
  assert.equal(Number.isNaN(value), false, `${label} is NaN`);
  assert.ok(value >= 0, `${label} is negative (${value})`);
  assert.ok(value !== Infinity, `${label} is Infinity`);
}

test("catalogue: every GPU profile is finite, positive-TDP, and free of NaN", () => {
  assert.ok(gpus.length >= 3200, `expected 3200+ cards, got ${gpus.length}`);
  for (const gpu of gpus) {
    const profile = gpuHardwareProfile(gpu, variants);
    assert.equal(profile.quantMatrix.length, variants.length, gpu.slug);
    assertCleanNumber(profile.tdpWatts, `${gpu.slug} tdp`);
    assert.ok(profile.tdpWatts > 0, `${gpu.slug} tdp`);
    assertCleanNumber(profile.annualPower4hUsd, `${gpu.slug} annual`);
    assertCleanNumber(profile.recommendedHostRamGb, `${gpu.slug} ram`);
    assertCleanNumber(profile.minHostRamGb, `${gpu.slug} min ram`);
    assert.ok(profile.recommendedHostRamGb >= profile.minHostRamGb, gpu.slug);
    assert.ok(profile.powerConnector.length > 0, gpu.slug);
    assert.ok(profile.slotWidth.length > 0, gpu.slug);
    assert.ok(profile.pcieInterface.length > 0, gpu.slug);
    assert.ok(COOLING.has(profile.coolingTier), `${gpu.slug} cooling ${profile.coolingTier}`);
    if (profile.recommendedPsuWatts == null) {
      assert.equal(profile.isUnifiedOrMobile, true, `${gpu.slug} null PSU without unified`);
    } else {
      assertCleanNumber(profile.recommendedPsuWatts, `${gpu.slug} psu`);
      assert.equal(profile.recommendedPsuWatts % 50, 0, `${gpu.slug} psu ${profile.recommendedPsuWatts}`);
      assert.ok(profile.recommendedPsuWatts <= 2000, `${gpu.slug} psu exploded`);
    }
    if (profile.tpsPer100W != null) assertCleanNumber(profile.tpsPer100W, `${gpu.slug} efficiency`);
    if (!gpu.runnable || profile.tdpWatts <= 0) assert.equal(profile.tpsPer100W, null, gpu.slug);
    assert.equal(JSON.stringify(profile).includes("NaN"), false, gpu.slug);
    for (const entry of profile.quantMatrix) {
      assert.ok(FITS.has(entry.fit), entry.fit);
      assert.ok(CONTEXTS.has(entry.maxContextK), `${gpu.slug} ${entry.id} context`);
      for (const key of ["downloadGb", "vramFloorGb", "ramFloorGb", "vramUsedGb", "ramOffloadGb", "estWriteTps", "estReadTps"] as const) {
        assertCleanNumber(entry[key], `${gpu.slug} ${entry.id} ${key}`);
      }
      if (entry.fit === "too-small") {
        assert.equal(entry.estWriteTps, 0);
        assert.equal(entry.estReadTps, 0);
        assert.equal(entry.maxContextK, 0);
      }
    }
    if (profile.bestQuantId != null) {
      const best = profile.quantMatrix.find((entry) => entry.id === profile.bestQuantId);
      assert.equal(best?.fit, "full-vram", `${gpu.slug} best ${profile.bestQuantId}`);
    }
  }
});

test("RTX 5090: ATX 3.1 cable, 1000W-class PSU, multi-GPU, UD-IQ4 fits", () => {
  const gpu = bySlug("rtx-5090");
  const profile = gpuHardwareProfile(gpu, variants);
  assert.equal(gpu.evidence, "measured");
  assert.match(profile.powerConnector, /12V-2x6/);
  assert.ok(profile.recommendedPsuWatts != null && profile.recommendedPsuWatts >= 1000);
  assert.equal(profile.multiGpuViable, true);
  assert.notEqual(row(profile, "ud-iq4_xs").fit, "too-small");
  assert.ok(profile.tpsPer100W != null && profile.tpsPer100W > 0);
  assert.equal(profile.tdpEstimated, false);
  assert.equal(profile.pcieInterface, "PCIe 5.0 x16");
});

test("RTX 4090: 12VHPWR and at least 64 GB host RAM", () => {
  const profile = profileOf("rtx-4090");
  assert.match(profile.powerConnector, /16-pin 12VHPWR/);
  assert.ok(profile.recommendedPsuWatts != null && profile.recommendedPsuWatts >= 800);
  assert.ok(profile.recommendedHostRamGb >= 64);
  assert.equal(profile.isUnifiedOrMobile, false);
});

test("RTX 3090: dual or triple 8-pin, 750W-class PSU, multi-GPU", () => {
  const profile = profileOf("rtx-3090");
  assert.match(profile.powerConnector, /[23]× 8-pin PCIe/);
  assert.ok(profile.recommendedPsuWatts != null && profile.recommendedPsuWatts >= 750);
  assert.equal(profile.multiGpuViable, true);
});

test("RX 7900 XTX: ROCm card with a 700W-class PSU and runnable quants", () => {
  const gpu = bySlug("amd-radeon-rx-7900-xtx");
  const profile = gpuHardwareProfile(gpu, variants);
  assert.equal(gpu.runtime, "ROCm");
  assert.ok(profile.recommendedPsuWatts != null && profile.recommendedPsuWatts >= 700);
  assert.equal(gpu.runnable, true);
  for (const entry of profile.quantMatrix) {
    assert.notEqual(entry.fit, "too-small", entry.id);
    assert.ok(entry.estWriteTps > 0, entry.id);
  }
});

test("Mac Studio M5 Ultra 256 GB: unified, silent, 128K context", () => {
  const profile = profileOf("mac-studio-m5-ultra-256-gb");
  assert.equal(profile.isUnifiedOrMobile, true);
  assert.equal(profile.recommendedPsuWatts, null);
  assert.equal(profile.powerConnector, "Unified / Internal");
  assert.equal(profile.slotWidth, "Unified / Mobile");
  assert.equal(profile.coolingTier, "unified-silent");
  assert.equal(profile.bestQuantId, "ud-iq4_xs");
  for (const entry of profile.quantMatrix) {
    assert.equal(entry.fit, "full-vram", entry.id);
    assert.equal(entry.maxContextK, 128, entry.id);
    assert.equal(entry.ramOffloadGb, 0, entry.id);
  }
});

test("12 GB cards: Coder runs, heavy quants spill out of VRAM", () => {
  for (const slug of ["rtx-3060-12gb", "rtx-5070"]) {
    const profile = profileOf(slug);
    const coder = row(profile, "coder");
    const iq2 = row(profile, "iq2_xs");
    const heavy = row(profile, "ud-iq4_xs");
    assert.notEqual(coder.fit, "too-small", slug);
    assert.notEqual(iq2.fit, "too-small", slug);
    assert.ok(coder.estWriteTps > 0, slug);
    assert.ok(heavy.ramOffloadGb > 0 || heavy.fit === "too-small", slug);
    assert.ok(heavy.ramOffloadGb > coder.ramOffloadGb, `${slug} UD offload`);
  }
});

test("legacy unsupported cards: every quant is too small and nothing is recommended", () => {
  const gpu = bySlug("rtx-3060-8gb");
  assert.equal(gpu.support, "not-supported");
  assert.ok(gpu.vramGb <= 8);
  const profile = gpuHardwareProfile(gpu, variants);
  assert.equal(profile.bestQuantId, null);
  assert.equal(gpu.runnable, false);
  for (const entry of profile.quantMatrix) {
    assert.equal(entry.fit, "too-small");
    assert.equal(entry.estWriteTps, 0);
    assert.equal(entry.estReadTps, 0);
    assert.equal(entry.maxContextK, 0);
  }
});

test("PSU recommendations are multiples of 50W whenever a discrete card needs one", () => {
  const discrete = gpus.filter((gpu) => gpuHardwareProfile(gpu, variants).recommendedPsuWatts != null);
  assert.ok(discrete.length > 1000);
  for (const gpu of discrete) {
    const psu = gpuHardwareProfile(gpu, variants).recommendedPsuWatts;
    assert.ok(psu != null && psu % 50 === 0 && psu >= 550, `${gpu.slug} ${psu}`);
  }
});

test("gpu-profiles.ts stays browser-safe: no node:fs import", () => {
  const source = readFileSync(new URL("../src/lib/gpu-profiles.ts", import.meta.url), "utf8");
  assert.doesNotMatch(source, /node:fs/);
  assert.doesNotMatch(source, /from\s+["']fs["']/);
  assert.doesNotMatch(source, /require\(\s*["']fs["']\s*\)/);
});

test("GpuConfigPanel is a Server Component", () => {
  const source = readFileSync(new URL("../src/components/GpuConfigPanel.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(source, /["']use client["']/);
  assert.match(source, /gpu-config-panel/);
  assert.match(source, /gpu-config-grid/);
  assert.match(source, /gpu-quant-table/);
  assert.match(source, /badge-ok/);
  assert.match(source, /badge-warn/);
  assert.match(source, /badge-muted/);
  assert.match(source, /not-supported/);
});

test("annual electricity is deterministic and strictly ordered by wattage", () => {
  const low = profileOf("rtx-5070");
  const high = profileOf("rtx-5090");
  assert.ok(low.tdpWatts < high.tdpWatts);
  assert.ok(low.annualPower4hUsd < high.annualPower4hUsd);
  assert.deepEqual(gpuHardwareProfile(bySlug("rtx-5090"), variants), high);

  const base = bySlug("rtx-3060-12gb");
  const modest = gpuHardwareProfile({ ...base, name: "Desktop 120W", powerWatts: 120, evidence: "estimated" }, variants);
  const hungry = gpuHardwareProfile({ ...base, name: "Desktop 320W", powerWatts: 320, evidence: "estimated" }, variants);
  assert.ok(modest.tdpWatts < hungry.tdpWatts);
  assert.ok(modest.annualPower4hUsd < hungry.annualPower4hUsd);
  assert.deepEqual(modest, gpuHardwareProfile({ ...base, name: "Desktop 120W", powerWatts: 120, evidence: "estimated" }, variants));
});

test("measured rig wall-draw and estimated board TDP size the PSU differently", () => {
  const pro = profileOf("rtx-pro-6000-blackwell");
  assert.match(pro.powerConnector, /12V-2x6/);
  assert.ok(pro.recommendedPsuWatts != null && pro.recommendedPsuWatts >= 1050);
  assert.equal(pro.tdpWatts, 720);
  assert.equal(row(pro, "iq3_s").fit, "full-vram");

  const board5090 = profileOf("nvidia-geforce-rtx-5090-32-gb-2025");
  assert.equal(board5090.tdpEstimated, false);
  assert.equal(board5090.tdpWatts, 575);
  assert.match(board5090.powerConnector, /12V-2x6/);
  assert.equal(board5090.recommendedPsuWatts, 1000);
});

test("default quant table matches the catalogue and keeps speed order", () => {
  const gpu = bySlug("rtx-4090");
  assert.deepEqual(gpuHardwareProfile(gpu), gpuHardwareProfile(gpu, variants));
  const profile = gpuHardwareProfile(gpu, variants);
  const iq3 = row(profile, "iq3_s");
  const coder = row(profile, "coder");
  const iq2 = row(profile, "iq2_xs");
  const ud = row(profile, "ud-iq4_xs");
  assert.ok(iq2.estWriteTps > iq3.estWriteTps);
  assert.ok(coder.estWriteTps > iq3.estWriteTps);
  assert.ok(ud.estWriteTps < iq3.estWriteTps);
  assert.ok(ud.ramOffloadGb > iq3.ramOffloadGb);
});

test("Ada plugs follow the board name and wattage, not a copied generation", () => {
  const ada6000 = profileOf("nvidia-rtx-6000-ada-generation-48-gb-2022");
  assert.match(ada6000.powerConnector, /16-pin 12VHPWR/);

  const l40 = profileOf("nvidia-l40-48-gb-2022");
  assert.equal(l40.tdpWatts, 300);
  assert.match(l40.powerConnector, /16-pin 12VHPWR/);

  const ampere = profileOf("nvidia-geforce-rtx-3080-10-gb-2020");
  assert.equal(ampere.tdpWatts, 320);
  assert.doesNotMatch(ampere.powerConnector, /12VHPWR|12V-2x6/);
  assert.match(ampere.powerConnector, /8-pin/);

  const lowAda = profileOf("nvidia-rtx-2000-ada-generation-16-gb-2024");
  assert.ok(lowAda.tdpWatts < 250);
  assert.doesNotMatch(lowAda.powerConnector, /12VHPWR/);
});
