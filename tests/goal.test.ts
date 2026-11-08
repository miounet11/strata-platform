import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { test } from "node:test";
import { Phase, Plan, Goal, type GoalStatus } from "../src/index.ts";

test("goal description is normalized and cannot be empty", () => {
  const goal = new Goal("  close the loop  ", ["tests pass"]);
  assert.equal(goal.description, "close the loop");
  assert.throws(() => new Goal("   "), /description must not be empty/);
});

test("goal accepts when all criteria are backed by evidence", () => {
  const goal = new Goal("close the loop", ["index exports", "tests pass"]);
  assert.equal(goal.status, "pending");
  const pending: GoalStatus = goal.status;
  assert.equal(pending, "pending");
  assert.equal(goal.accept(["index exports", "tests pass"]), true);
  assert.equal(goal.status, "accepted");
  assert.equal(goal.isAccepted(), true);
  assert.equal(goal.reason, null);
});

test("goal rejects missing evidence and records what is missing", () => {
  const goal = new Goal("close the loop", ["index exports", "tests pass"]);
  assert.equal(goal.accept([]), false);
  assert.equal(goal.reason, "missing evidence: index exports, tests pass");
  assert.equal(goal.accept(["index exports"]), false);
  assert.equal(goal.status, "rejected");
  assert.equal(goal.isAccepted(), false);
  assert.equal(goal.reason, "missing evidence: tests pass");
});

test("a goal with no criteria cannot pass silently", () => {
  const goal = new Goal("unspecified");
  assert.equal(goal.accept(["anything"]), false);
  assert.equal(goal.status, "rejected");
  assert.equal(goal.reason, "no criteria defined");
});

test("criteria is a read-only snapshot", () => {
  const source = ["index exports", "tests pass"];
  const goal = new Goal("close the loop", source);
  const snapshot = goal.criteria;
  snapshot.push("ghost");
  source[0] = "mutated";
  assert.deepEqual(goal.criteria, ["index exports", "tests pass"]);
  assert.equal(goal.accept(["index exports", "tests pass"]), true);
  assert.equal(goal.reason, null);
  assert.equal(goal.status, "accepted");
});

test("index exports all three modules and every contract test is scanned by npm test", () => {
  assert.equal(typeof Phase, "function");
  assert.equal(typeof Plan, "function");
  assert.equal(typeof Goal, "function");
  // Resolve from this file rather than process.cwd(): node --test can be invoked from anywhere.
  const root = new URL("../", import.meta.url);
  const testScript = JSON.parse(readFileSync(new URL("package.json", root), "utf8")).scripts.test;
  assert.match(testScript, /tests\/\*\.test\.ts/);
  const rootTests = readdirSync(new URL("tests", root)).filter((file: string) => file.endsWith(".test.ts"));
  // The list is asserted rather than hard-coded so a new contract test cannot be added without
  // this check noticing that it is (or is not) covered by the npm test glob above.
  assert.deepEqual(rootTests.sort(), [
    "freshness-state.test.ts",
    "goal.test.ts",
    "phase.test.ts",
    "plan.test.ts",
  ]);
});
