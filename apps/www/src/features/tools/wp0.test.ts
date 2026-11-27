import test from "node:test";
import assert from "node:assert/strict";

import { ALL_TOOLS, TOOL_SLUGS, getTool, isToolSlug } from "./registry.ts";
import type { ToolSlug } from "./types.ts";
import { clamp, fmtDecimal, fmtGb, fmtNum, fmtPct, fmtTps, fmtUsd, fmtWatts } from "./format.ts";
import { decodeQuery, encodeQuery } from "./url-state.ts";

test("registry: 10 unique slugs in canonical order", () => {
  assert.equal(TOOL_SLUGS.length, 10);
  assert.equal(new Set(TOOL_SLUGS).size, 10);
  assert.equal(ALL_TOOLS.length, 10);
  assert.deepEqual(
    ALL_TOOLS.map((tool) => tool.slug),
    [...TOOL_SLUGS],
  );
  const expected: ToolSlug[] = [
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
  ];
  assert.deepEqual([...TOOL_SLUGS], expected);
  for (const tool of ALL_TOOLS) {
    assert.equal(isToolSlug(tool.slug), true);
    assert.equal(getTool(tool.slug)?.order, tool.order);
  }
  assert.equal(isToolSlug("not-a-tool"), false);
  assert.equal(getTool("not-a-tool"), undefined);
});

test("registry: relatedSlugs are valid, unique, and self-free", () => {
  const set = new Set<string>(TOOL_SLUGS);
  for (const tool of ALL_TOOLS) {
    assert.equal(new Set(tool.relatedSlugs).size, tool.relatedSlugs.length);
    for (const slug of tool.relatedSlugs) {
      assert.equal(set.has(slug), true, `${tool.slug} → unknown ${slug}`);
      assert.notEqual(slug, tool.slug);
    }
    assert.ok(tool.ctaHref.startsWith("/"));
    assert.ok(tool.keywords.length > 0);
  }
});

test("format: clamp handles bounds, NaN, Infinity and nullish input", () => {
  assert.equal(clamp(5, 0, 10), 5);
  assert.equal(clamp(-1, 0, 10), 0);
  assert.equal(clamp(11, 0, 10), 10);
  assert.equal(clamp(Number.NaN, 0, 10), 0);
  assert.equal(clamp(Number.POSITIVE_INFINITY, 0, 10), 10);
  assert.equal(clamp(Number.NEGATIVE_INFINITY, 0, 10), 0);
  assert.equal(clamp(5, 10, 0), 5);
  assert.equal(clamp(Number.NaN, 2, 8, 4), 4);
});

test("format: deterministic strings for null/NaN/Infinity", () => {
  for (const bad of [null, undefined, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
    assert.equal(fmtNum(bad), "0");
    assert.equal(fmtDecimal(bad), "0.0");
    assert.equal(fmtUsd(bad), "$0.00");
    assert.equal(fmtGb(bad), "0 GB");
    assert.equal(fmtTps(bad), "0.0 tok/s");
    assert.equal(fmtWatts(bad), "0 W");
    assert.equal(fmtPct(bad), "0.0%");
  }
  assert.equal(fmtNum(1234567), "1,234,567");
  assert.equal(fmtDecimal(12.3456), "12.3");
  assert.equal(fmtUsd(1234.5), "$1,234.50");
  assert.equal(fmtUsd(7, 0), "$7");
  assert.equal(fmtGb(48), "48 GB");
  assert.equal(fmtTps(109.34), "109.3 tok/s");
  assert.equal(fmtWatts(450), "450 W");
  assert.equal(fmtPct(12.25), "12.3%");
});

const schema = {
  gpu: { kind: "enum", default: "rtx-4090", values: ["rtx-4090", "rx-7900-xtx", "m5-ultra"] },
  vram: { kind: "number", default: 24, min: 8, max: 128 },
  offload: { kind: "boolean", default: false },
  q: { kind: "string", default: "" },
} as const;

test("url-state: encode/decode round trip and default omission", () => {
  const state = { gpu: "rx-7900-xtx", vram: 48, offload: true, q: "local llm" };
  const query = encodeQuery(state, schema);
  assert.equal(query, "?gpu=rx-7900-xtx&vram=48&offload=1&q=local%20llm");
  assert.deepEqual(decodeQuery(query, schema), state);
  assert.equal(encodeQuery(decodeQuery("", schema), schema), "");
});

test("url-state: invalid values fall back or clamp", () => {
  assert.deepEqual(decodeQuery("?gpu=bogus&vram=999999&offload=maybe&q=a%20b", schema), {
    gpu: "rtx-4090",
    vram: 128,
    offload: false,
    q: "a b",
  });
  assert.deepEqual(decodeQuery("?vram=NaN&vramLow=-20", schema), {
    gpu: "rtx-4090",
    vram: 24,
    offload: false,
    q: "",
  });
  const encoded = encodeQuery({ gpu: "bogus", vram: -5, offload: true, q: 123 }, schema);
  assert.deepEqual(decodeQuery(encoded, schema), {
    gpu: "rtx-4090",
    vram: 8,
    offload: true,
    q: "",
  });
});

test("url-state: unknown keys are ignored and aliases are supported", () => {
  const aliased = { gpu: { kind: "string", default: "", alias: "g" }, page: { kind: "number", default: 1, min: 1, max: 5 } } as const;
  assert.deepEqual(decodeQuery("?g=hello&junk=1&page=3", aliased), { gpu: "hello", page: 3 });
  assert.equal(encodeQuery({ gpu: "hello", page: 3 }, aliased), "?g=hello&page=3");
});
