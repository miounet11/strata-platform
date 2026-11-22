import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  evaluateHardware,
  HARDWARE_TIERS,
  kvCacheMemoryGb,
  type ModelVariantSpec,
} from "../src/lib/can-i-run.ts";

const models = JSON.parse(
  readFileSync(new URL("../src/data/models.json", import.meta.url), "utf8"),
) as { variants: ModelVariantSpec[] };

const variants = models.variants;

test("can-i-run: 8 GB discrete GPU fails VRAM floor cleanly", () => {
  const verdict = evaluateHardware(
    { vramGb: 8, ramGb: 32, unifiedMemory: false, contextK: 8, bandwidthGbs: 272 },
    variants,
  );
  assert.equal(verdict.runnable, false);
  assert.equal(verdict.bestVariant, null);
  assert.equal(verdict.bottleneck, "vram");
});

test("can-i-run: 12 GB VRAM + 32 GB RAM at 8K fits Coder, fails larger 64 GB builds", () => {
  const verdict = evaluateHardware(
    { vramGb: 12, ramGb: 32, unifiedMemory: false, contextK: 8, bandwidthGbs: 504 },
    variants,
  );
  assert.equal(verdict.runnable, true);
  assert.equal(verdict.bestVariant?.variant.id, "coder");
  const iq2 = verdict.variants.find((v) => v.variant.id === "iq2_xs");
  assert.equal(iq2?.status, "needs-ram");
});

test("can-i-run: 24 GB VRAM + 64 GB RAM at 32K recommends IQ3_S or IQ2_XS and computes economics", () => {
  const verdict = evaluateHardware(
    {
      vramGb: 24,
      ramGb: 64,
      unifiedMemory: false,
      contextK: 32,
      measuredReadTps: 4000,
      measuredWriteTps: 109.3,
      powerWatts: 550,
      rigPriceUsd: 4199,
      dailyHours: 24,
      electricityPerKwh: 0.15,
    },
    variants,
  );
  assert.equal(verdict.runnable, true);
  assert.ok(verdict.bestVariant);
  assert.equal(verdict.bestVariant.evidence, "measured");
  assert.ok((verdict.bestVariant.estimatedWriteTps ?? 0) > 50);
  assert.ok((verdict.bestVariant.localCostPerMM ?? 1) < 0.15);
  assert.ok((verdict.bestVariant.breakEvenDays ?? 9999) < 800);
});

test("can-i-run: 128K context increases KV cache overhead and requires more RAM", () => {
  assert.ok(kvCacheMemoryGb(128) > kvCacheMemoryGb(32));
  assert.ok(kvCacheMemoryGb(32) > kvCacheMemoryGb(8));
  const at8k = evaluateHardware(
    { vramGb: 12, ramGb: 32, unifiedMemory: false, contextK: 8, bandwidthGbs: 504 },
    variants,
  );
  const at128k = evaluateHardware(
    { vramGb: 12, ramGb: 32, unifiedMemory: false, contextK: 128, bandwidthGbs: 504 },
    variants,
  );
  assert.equal(at8k.runnable, true);
  assert.equal(at128k.runnable, false);
  assert.equal(at128k.bottleneck, "ram");
});

test("can-i-run: unified memory reserves OS headroom (~82% usable)", () => {
  const mac32 = evaluateHardware(
    { vramGb: 32, ramGb: 32, unifiedMemory: true, contextK: 32, bandwidthGbs: 400 },
    variants,
  );
  assert.equal(mac32.runnable, false);
  assert.equal(mac32.bottleneck, "unified-memory");

  const mac128 = evaluateHardware(
    { vramGb: 128, ramGb: 128, unifiedMemory: true, contextK: 128, bandwidthGbs: 546 },
    variants,
  );
  assert.equal(mac128.runnable, true);
  assert.equal(mac128.bestVariant?.variant.id, "ud-iq4_xs");
});

test("can-i-run: all HARDWARE_TIERS evaluate deterministically without throwing", () => {
  assert.ok(HARDWARE_TIERS.length >= 6);
  for (const tier of HARDWARE_TIERS) {
    const out = evaluateHardware(
      {
        vramGb: tier.vramGb,
        ramGb: tier.ramGb,
        unifiedMemory: tier.unifiedMemory,
        contextK: 32,
        bandwidthGbs: tier.bandwidthGbs,
      },
      variants,
    );
    assert.equal(out.variants.length, variants.length);
  }
});
