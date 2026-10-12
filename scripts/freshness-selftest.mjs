#!/usr/bin/env node
/**
 * Offline smoke test for the freshness watcher. No network.
 *
 *   node scripts/freshness-selftest.mjs
 *
 * Decision expressions are copied from scripts/freshness-watch.mjs.
 * That module is not imported: loading it takes .freshness.lock and may
 * run the release/changelog sync.
 */
import { spawn } from "node:child_process";
import {
  appendFileSync,
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const WATCH_SRC = join(HERE, "freshness-watch.mjs");

let checks = 0;
const cleanups = [];

function cleanup() {
  while (cleanups.length) {
    try {
      cleanups.pop()();
    } catch {
      // best-effort temp removal
    }
  }
}

function check(cond, message) {
  checks += 1;
  if (!cond) {
    writeSync(2, `FAIL: ${message}\n`);
    cleanup();
    process.exit(1);
  }
}

// fingerprint() from scripts/freshness-watch.mjs, over in-memory JSON
// instead of apps/www/src/data/{releases,changelog}.json.
function fingerprint(releases, items) {
  const top = releases
    .slice()
    .sort((a, b) => String(b.publishedAt ?? "").localeCompare(String(a.publishedAt ?? "")))[0];
  return {
    topTag: top?.tag ?? "",
    releaseCount: releases.length,
    changelogTop: items[0]?.id ?? "",
    changelogCount: items.length,
  };
}

// changed / degraded from the compare block in scripts/freshness-watch.mjs
// (the block that follows `const next = fingerprint()`).
function judge(firstRun, prev, next) {
  const changed =
    firstRun ||
    prev.topTag !== next.topTag ||
    prev.releaseCount !== next.releaseCount ||
    prev.changelogTop !== next.changelogTop ||
    prev.changelogCount !== next.changelogCount;
  // data regression (sync failed → empty/shorter) is NOT new content
  const degraded =
    !firstRun &&
    (next.releaseCount < prev.releaseCount ||
      (next.releaseCount === 0 && prev.topTag !== "") ||
      next.changelogCount < prev.changelogCount);
  return { changed, degraded };
}

function testJudge() {
  const releases = [
    { tag: "v1.0.0", publishedAt: "2026-01-01T00:00:00Z" },
    { tag: "v1.1.0", publishedAt: "2026-02-01T00:00:00Z" },
    { tag: "v1.2.0", publishedAt: "2026-03-01T00:00:00Z" },
  ];
  const items = [{ id: "c3" }, { id: "c2" }, { id: "c1" }];
  const prev = fingerprint(releases, items);

  // 空 releases：列表被清空。count 下降且 topTag 变空，changed 仍为 true，
  // degraded 为 true（空列表条款 + 数量变少），重建应被降级守卫拦住。
  // 数量变少：只丢掉最旧一条，topTag 不变，count 3 → 2。
  // 真新版本：新 tag 插在中间，必须按 publishedAt 排序才认得出 v1.3.0。
  // 无变化：同一份指纹，非首次运行。
  const scenarios = [
    {
      name: "空 releases",
      next: fingerprint([], items),
      changed: true,
      degraded: true,
      topTag: "",
      releaseCount: 0,
    },
    {
      name: "数量变少",
      next: fingerprint([releases[1], releases[2]], items),
      changed: true,
      degraded: true,
      topTag: "v1.2.0",
      releaseCount: 2,
    },
    {
      name: "真新版本",
      next: fingerprint(
        [
          releases[0],
          { tag: "v1.3.0", publishedAt: "2026-04-01T00:00:00Z" },
          releases[1],
          releases[2],
        ],
        items,
      ),
      changed: true,
      degraded: false,
      topTag: "v1.3.0",
      releaseCount: 4,
    },
    {
      name: "无变化",
      next: fingerprint(releases.slice(), items.slice()),
      changed: false,
      degraded: false,
      topTag: "v1.2.0",
      releaseCount: 3,
    },
  ];

  for (const scenario of scenarios) {
    const got = judge(false, prev, scenario.next);
    check(
      got.changed === scenario.changed &&
        got.degraded === scenario.degraded &&
        scenario.next.topTag === scenario.topTag &&
        scenario.next.releaseCount === scenario.releaseCount,
      `${scenario.name}: expected changed=${scenario.changed} degraded=${scenario.degraded} topTag=${scenario.topTag} releaseCount=${scenario.releaseCount}, got changed=${got.changed} degraded=${got.degraded} topTag=${scenario.next.topTag} releaseCount=${scenario.next.releaseCount}`,
    );
  }
}

// Minimal lock contender. Winner: openSync(LOCK, "wx") then sleep 300ms and
// write pid. Loser: EEXIST → print lock-skip and exit 0, same outcome as
// freshness-watch.mjs (appendLog "lock-skip" + exit 0).
const LOCK_CHILD = `
import { openSync, writeSync, closeSync } from "node:fs";
const LOCK = process.env.FRESHNESS_TEST_LOCK;
try {
  const fd = openSync(LOCK, "wx");
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 300);
  writeSync(fd, String(process.pid));
  closeSync(fd);
} catch (err) {
  if (err && err.code === "EEXIST") {
    console.log("lock-skip");
    process.exit(0);
  }
  console.error(err && err.stack ? err.stack : err);
  process.exit(1);
}
`;

function startChild(lockPath) {
  const child = spawn(process.execPath, ["--input-type=module", "-e", LOCK_CHILD], {
    env: { ...process.env, FRESHNESS_TEST_LOCK: lockPath },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let stdout = "";
  let stderr = "";
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", (chunk) => {
    stdout += chunk;
  });
  child.stderr.on("data", (chunk) => {
    stderr += chunk;
  });
  const done = new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`child ${child.pid} timed out`));
    }, 2000);
    child.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
    // 'close' waits until stdio has flushed; 'exit' can fire early.
    child.on("close", (code, signal) => {
      clearTimeout(timer);
      resolve({ code, signal, stdout, stderr, pid: child.pid });
    });
  });
  return { child, done };
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForFile(path, timeoutMs) {
  const start = Date.now();
  while (!existsSync(path)) {
    if (Date.now() - start > timeoutMs) return false;
    await delay(5);
  }
  return true;
}

async function testLock(dir) {
  const lockPath = join(dir, "freshness.lock");
  // Start the second only after the first has created the lock. The 300ms
  // sleep keeps that hold, so "the second exits lock-skip" is deterministic.
  const first = startChild(lockPath);
  cleanups.push(() => {
    try {
      first.child.kill();
    } catch {
      // already exited
    }
  });
  const appeared = await waitForFile(lockPath, 2000);
  check(appeared, "first child did not create the lock file");

  const second = startChild(lockPath);
  cleanups.push(() => {
    try {
      second.child.kill();
    } catch {
      // already exited
    }
  });
  const secondResult = await second.done;
  const firstResult = await first.done;

  check(
    secondResult.code === 0 && secondResult.stdout.trim() === "lock-skip",
    `second child did not exit lock-skip (code=${secondResult.code} signal=${secondResult.signal} stdout=${JSON.stringify(secondResult.stdout)} stderr=${JSON.stringify(secondResult.stderr)})`,
  );
  const body = existsSync(lockPath) ? readFileSync(lockPath, "utf8") : "";
  check(
    firstResult.code === 0 && firstResult.stdout.trim() === "" && body === String(firstResult.pid),
    `first child did not hold the lock and write its pid (code=${firstResult.code} signal=${firstResult.signal} stdout=${JSON.stringify(firstResult.stdout)} body=${JSON.stringify(body)} stderr=${JSON.stringify(firstResult.stderr)})`,
  );
}

// appendLog from scripts/freshness-watch.mjs. Path is injected so the test
// writes a temp file instead of .logs/freshness.log.
function appendLog(file, event, detail) {
  try {
    mkdirSync(dirname(file), { recursive: true });
    appendFileSync(
      file,
      `${JSON.stringify({ ts: new Date().toISOString(), event, detail: String(detail ?? "") })}\n`,
    );
  } catch {
    // ignore
  }
}

function testLog(dir) {
  const file = join(dir, "logs", "freshness.log");
  const rows = [
    ["sync", "skip sync (caller already refreshed data)"],
    ["no-change", "no change (top=v1.2.0). done."],
  ];
  for (const [event, detail] of rows) appendLog(file, event, detail);

  let text = "";
  try {
    text = readFileSync(file, "utf8");
  } catch (err) {
    check(false, `log file missing (${err.message})`);
  }
  const lines = text.split("\n").filter((line) => line.length > 0);
  check(lines.length === 2, `expected 2 NDJSON lines, got ${lines.length}`);

  lines.forEach((line, i) => {
    let row = null;
    let parsed = false;
    try {
      row = JSON.parse(line);
      parsed = true;
    } catch {
      parsed = false;
    }
    const keys = row && typeof row === "object" && !Array.isArray(row) ? Object.keys(row).sort() : [];
    const [event, detail] = rows[i];
    check(
      parsed &&
        keys.length === 3 &&
        keys[0] === "detail" &&
        keys[1] === "event" &&
        keys[2] === "ts" &&
        row.event === event &&
        row.detail === detail &&
        typeof row.ts === "string" &&
        Number.isFinite(Date.parse(row.ts)),
      `line ${i + 1} is not {ts,event,detail} (${line})`,
    );
  });
}

function testBuildFailedMarker() {
  const src = readFileSync(WATCH_SRC, "utf8");
  check(src.includes(".freshness-build-failed"), "freshness-watch.mjs missing .freshness-build-failed");
  // Force-rebuild branch: unchanged data plus the marker still rebuilds.
  check(
    src.includes("priorBuildFailed") && src.includes("forcing rebuild"),
    "freshness-watch.mjs missing force-rebuild logic for .freshness-build-failed",
  );
}

async function main() {
  const dir = mkdtempSync(join(tmpdir(), "freshness-selftest-"));
  cleanups.push(() => rmSync(dir, { recursive: true, force: true }));
  try {
    testJudge();
    await testLock(dir);
    testLog(dir);
    testBuildFailedMarker();
    writeSync(1, `selftest OK (${checks} checks)\n`);
  } finally {
    cleanup();
  }
  process.exit(0);
}

main().catch((err) => {
  writeSync(2, `FAIL: ${err && err.stack ? err.stack : err}\n`);
  cleanup();
  process.exit(1);
});
