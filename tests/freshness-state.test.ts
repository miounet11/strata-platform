import assert from "node:assert/strict";
import { test } from "node:test";
import {
  looksLikeLoss,
  releaseSetChanged,
  changelogSetChanged,
  compareState,
} from "../scripts/freshness-state.mjs";

/**
 * The watcher was stuck on v0.2.7 for eleven days because it compared *counts*: the changelog
 * feed is a sliding window, so publishing new entries dropped the count from 33 to 32, the
 * watcher called that "degraded" and skipped every rebuild. These cases pin the corrected rule.
 */

const state = (over = {}) => ({
  topTag: "v0.2.7",
  releaseCount: 30,
  changelogTop: "release-v0.2.7",
  changelogCount: 33,
  releaseTags: ["v0.2.5", "v0.2.6", "v0.2.7"],
  changelogIds: ["release-v0.2.5", "release-v0.2.6", "release-v0.2.7"],
  ...over,
});

test("条目滑动（旧条目消失、新条目进来）不算丢失", () => {
  assert.equal(
    looksLikeLoss(["a", "b", "c"], ["b", "c", "d"]),
    false,
    "有新增条目时，旧条目滑出窗口是正常的",
  );
});

test("条目消失且没有任何新增 = 真实丢失", () => {
  assert.equal(looksLikeLoss(["a", "b", "c"], ["a", "b"]), true);
  assert.equal(looksLikeLoss(["a", "b", "c"], []), true);
});

test("空的前状态不判定丢失", () => {
  assert.equal(looksLikeLoss([], ["a"]), false);
});

test("releases 是完整列表：条目集合变了就是变化", () => {
  const prev = state();
  const next = state({ releaseTags: ["v0.2.5", "v0.2.6", "v0.2.7", "v0.2.8"], releaseCount: 31 });
  assert.equal(releaseSetChanged(prev, next), true);
});

test("releases 集合相同但顺序不同不算变化", () => {
  const prev = state({ releaseTags: ["v0.2.5", "v0.2.6", "v0.2.7"] });
  const next = state({ releaseTags: ["v0.2.7", "v0.2.5", "v0.2.6"] });
  assert.equal(releaseSetChanged(prev, next), false);
});

test("旧状态文件没有 releaseTags 时回退到计数比较", () => {
  const prev = { topTag: "v0.2.7", releaseCount: 30, changelogTop: "release-v0.2.7", changelogCount: 33 };
  const same = { topTag: "v0.2.7", releaseCount: 30, changelogTop: "release-v0.2.7", changelogCount: 33 };
  const diff = { topTag: "v0.2.8", releaseCount: 31, changelogTop: "release-v0.2.8", changelogCount: 34 };
  assert.equal(releaseSetChanged(prev, same), false);
  assert.equal(releaseSetChanged(prev, diff), true);
  assert.equal(changelogSetChanged(prev, same), false);
  assert.equal(changelogSetChanged(prev, diff), true);
});

test("线上真实场景：changelog 从 33 条滑到 32 条但有新版本，不算 degraded", () => {
  // 线上 state：v0.2.7 / 33 条；实际数据：v0.2.12 / 32 条，其中多了 v0.2.8–v0.2.12。
  const prev = {
    topTag: "v0.2.7",
    releaseCount: 30,
    changelogTop: "release-v0.2.7",
    changelogCount: 33,
    releaseTags: Array.from({ length: 30 }, (_, i) => `v0.2.${i}`),
    changelogIds: Array.from({ length: 33 }, (_, i) => `release-v0.2.${i}`),
  };
  const next = {
    topTag: "v0.2.12",
    releaseCount: 30,
    changelogTop: "release-v0.2.12",
    changelogCount: 32,
    releaseTags: prev.releaseTags,
    // A genuinely new entry (v0.2.12 is already in `prev`, so it would not count as "gained")
    // plus the first 31 old ones: the window slid, one old entry aged out, one new one arrived.
    changelogIds: ["release-v0.3.0", ...prev.changelogIds.slice(0, 31)],
  };

  const verdict = compareState(prev, next);
  assert.equal(verdict.degraded, false, "条数变少但有新内容，不是回归");
  assert.equal(verdict.changed, true, "有新版本，必须触发重建");
});

test("同步真的失败：条数变少且没有新条目 = degraded", () => {
  const prev = state();
  const next = state({ changelogIds: ["release-v0.2.5"], changelogCount: 1, changelogTop: "release-v0.2.5" });
  const verdict = compareState(prev, next);
  assert.equal(verdict.degraded, true);
  assert.equal(verdict.changelogLost, true);
});

test("releases 完整列表被截断 = degraded", () => {
  const prev = state();
  const next = state({ releaseTags: ["v0.2.5"], releaseCount: 1 });
  const verdict = compareState(prev, next);
  assert.equal(verdict.degraded, true);
  assert.equal(verdict.releasesLost, true);
});

test("首次运行不算 degraded", () => {
  const verdict = compareState({}, { releaseTags: [], changelogIds: [], releaseCount: 0, changelogCount: 0 }, { firstRun: true });
  assert.equal(verdict.degraded, false);
  assert.equal(verdict.changed, true);
});
