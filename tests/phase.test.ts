import assert from "node:assert/strict";
import { test } from "node:test";
import { Phase, type PhaseStatus } from "../src/index.ts";

test("phase advances pending -> running -> succeeded", () => {
  const phase = new Phase("build");
  assert.equal(phase.status, "pending");
  assert.equal(phase.advance(), "running");
  assert.equal(phase.advance(), "succeeded");
  assert.equal(phase.failure, null);
});

test("a failed phase carries its reason and cannot advance again", () => {
  const phase = new Phase("deploy");
  phase.advance();
  phase.fail("patrol regression");
  assert.equal(phase.status, "failed");
  assert.equal(phase.failure, "patrol regression");
  assert.throws(() => phase.advance(), /terminal \(failed\)/);
});

test("guards reject empty id and empty failure reason", () => {
  assert.throws(() => new Phase("  "), /phase id must not be empty/);
  const phase = new Phase("build");
  assert.throws(() => phase.fail("   "), /non-empty reason/);
  assert.equal(phase.status, "pending");
  assert.equal(phase.failure, null);
});

test("phase ids and failure reasons are normalized like plan step names", () => {
  const phase = new Phase("  build  ");
  assert.equal(phase.id, "build");
  phase.fail("  patrol regression  ");
  assert.equal(phase.failure, "patrol regression");
});

test("status and failure are read-only views of the state machine", () => {
  const phase = new Phase("build");
  const initial: PhaseStatus = phase.status;
  assert.equal(initial, "pending");
  assert.throws(() => {
    // @ts-expect-error - frozen public API: state changes only through advance()/fail()
    phase.status = "failed";
  }, TypeError);
  assert.equal(phase.status, "pending");
});
