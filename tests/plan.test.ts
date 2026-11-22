import assert from "node:assert/strict";
import { test } from "node:test";
import { Plan, type PlanStep } from "../src/index.ts";

test("plan registers steps in order and completes only when all are done", () => {
  const plan = new Plan();
  plan.addStep("read MAP");
  plan.addStep("implement modules");
  plan.addStep("run tests");
  assert.equal(plan.isComplete(), false);
  assert.deepEqual(
    plan.steps.map((step) => step.done),
    [false, false, false],
  );
  plan.completeStep("read MAP");
  plan.completeStep("implement modules");
  assert.equal(plan.isComplete(), false);
  plan.completeStep("run tests");
  assert.equal(plan.isComplete(), true);
  assert.deepEqual(plan.steps[2], { name: "run tests", done: true });
});

test("an empty plan is not complete and unknown steps are rejected", () => {
  const plan = new Plan();
  assert.equal(plan.isComplete(), false);
  assert.throws(() => plan.completeStep("missing"), /unknown step/);
  assert.throws(() => plan.addStep(""), /must not be empty/);
});

test("duplicate step registration is rejected after trimming whitespace", () => {
  const plan = new Plan();
  plan.addStep("read MAP");
  assert.throws(() => plan.addStep("  read MAP  "), /already registered/);
});

test("step names are normalized for registration, completion and reporting", () => {
  const plan = new Plan();
  plan.addStep("  read MAP  ");
  assert.deepEqual(plan.steps, [{ name: "read MAP", done: false }]);
  plan.completeStep("  read MAP  ");
  assert.equal(plan.isComplete(), true);
  assert.deepEqual(plan.steps, [{ name: "read MAP", done: true }]);
});

test("steps is a read-only snapshot: mutating it cannot change plan state", () => {
  const plan = new Plan();
  plan.addStep("read MAP");
  const snapshot: PlanStep[] = plan.steps;
  snapshot[0].done = true;
  snapshot.push({ name: "ghost", done: true });
  assert.equal(plan.isComplete(), false);
  assert.deepEqual(plan.steps, [{ name: "read MAP", done: false }]);
});
