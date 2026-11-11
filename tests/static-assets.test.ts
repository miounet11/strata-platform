import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

const script = join(import.meta.dirname, "..", "scripts", "check-static-assets.mjs");

function guard(dist: string) {
  return spawnSync(process.execPath, [script, dist], { encoding: "utf8" });
}

function tree(): string {
  return mkdtempSync(join(tmpdir(), "static-guard-"));
}

test("rejects a build tree with no static/chunks directory", () => {
  const dist = tree();
  try {
    const r = guard(dist);
    assert.equal(r.status, 1);
    assert.match(r.stderr, /does not exist/);
  } finally {
    rmSync(dist, { recursive: true, force: true });
  }
});

test("rejects a build tree whose static/chunks has no JS chunks", () => {
  const dist = tree();
  try {
    mkdirSync(join(dist, "static", "chunks"), { recursive: true });
    const r = guard(dist);
    assert.equal(r.status, 1);
    assert.match(r.stderr, /no \.js chunks/);
  } finally {
    rmSync(dist, { recursive: true, force: true });
  }
});

test("accepts JS chunks in nested app-router directories", () => {
  const dist = tree();
  try {
    const nested = join(dist, "static", "chunks", "app", "[locale]");
    mkdirSync(nested, { recursive: true });
    writeFileSync(join(nested, "layout-abc.js"), "/* chunk */");
    const r = guard(dist);
    assert.equal(r.status, 0);
    assert.match(r.stdout, /1 JS chunks/);
  } finally {
    rmSync(dist, { recursive: true, force: true });
  }
});

test("accepts a tree with chunks at the top level", () => {
  const dist = tree();
  try {
    mkdirSync(join(dist, "static", "chunks"), { recursive: true });
    writeFileSync(join(dist, "static", "chunks", "webpack-abc.js"), "/* chunk */");
    const r = guard(dist);
    assert.equal(r.status, 0);
  } finally {
    rmSync(dist, { recursive: true, force: true });
  }
});
