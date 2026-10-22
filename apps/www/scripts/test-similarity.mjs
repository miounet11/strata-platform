#!/usr/bin/env node
/**
 * Fixture tests for similarity.mjs.
 *
 *   node scripts/test-similarity.mjs        # all pass → EXIT=0
 *
 * Why: every defect this script has had was found by a fixture, not by reading it. The df pointer
 * bug made every df equal 1 and the filter a no-op while still printing `skipped_boilerplate=0`.
 * The set-vs-multiset bug reported a 9070 page and a 9070 XT page as 1.000 identical because each
 * page's cross-link block contains the other's name. The df floor of 2 deleted the only pair a
 * 6-page site had. None of those show up in a green run on a real build; all three show up here.
 *
 * Each case builds a throwaway `.next/server/app` tree, runs the real CLI as a subprocess, and
 * asserts on both the exit code and the printed lines. Asserting only the exit code is how a
 * check that always fails for the wrong reason stays green.
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT = join(dirname(fileURLToPath(import.meta.url)), "similarity.mjs");

/** Deterministic words, so a fixture can share a long block on purpose and differ elsewhere. */
const words = (seed, count) => Array.from({ length: count }, (_, i) => `${seed}w${i}`).join(" ");

const page = (title, text) =>
  `<html lang="en"><body><nav>NAV</nav><main><h1>${title}</h1><p>${text}</p></main><footer>FOOT</footer></body></html>`;

/** Build a temp site and run the CLI over it. `files` maps a route path to HTML. */
function run(files, args = [], { dist = ".next" } = {}) {
  const root = mkdtempSync(join(tmpdir(), "similarity-fixture-"));
  try {
    const appDir = join(root, dist, "server", "app");
    for (const [route, html] of Object.entries(files)) {
      const file = join(appDir, `${route}.html`);
      mkdirSync(dirname(file), { recursive: true });
      writeFileSync(file, html);
    }
    let stdout = "";
    let code = 0;
    try {
      stdout = execFileSync(process.execPath, [SCRIPT, ...args], {
        cwd: root,
        env: { ...process.env, SITE_DIR: root, NEXT_DIST_DIR: dist },
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      });
    } catch (error) {
      stdout = `${error.stdout ?? ""}${error.stderr ?? ""}`;
      code = error.status ?? 1;
    }
    return { code, stdout };
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

const cases = [];
const test = (name, fn) => cases.push({ name, fn });

/** Pull every reported pair, as `path ~ path`, in the order printed. */
const pairsOf = (stdout) =>
  stdout
    .split("\n")
    .filter((line) => line.startsWith("failed=similarity"))
    .map((line) => /detail=(.*) \d+\.\d+$/.exec(line)?.[1])
    .filter(Boolean);

const scoreOf = (stdout) => {
  const match = /max=(\d+\.\d+)/.exec(stdout);
  return match ? Number(match[1]) : NaN;
};

// ── 1. a byte-identical copy is 1.000, and must be reported ───────────────
test("two pages with identical text score 1.000", () => {
  const body = words("same", 120);
  // Same title on purpose: a page that is a copy of another differs in its URL only, and the URL
  // is not part of `<main>`. Titling them A and B would make the expected score 0.983 and the
  // assertion "≈1.000" would be asserting the wrong thing.
  const { code, stdout } = run({
    "en/gpus/a": page("Same", body),
    "en/gpus/b": page("Same", body),
  });
  if (code !== 1) return `expected exit 1, got ${code}`;
  const pairs = pairsOf(stdout);
  if (pairs.length !== 1) return `expected 1 pair, got ${pairs.length}: ${pairs.join(", ")}`;
  if (pairs[0] !== "/en/gpus/a ~ /en/gpus/b") return `wrong pair: ${pairs[0]}`;
  if (scoreOf(stdout) !== 1) return `expected max=1.000, got ${scoreOf(stdout)}`;
  return null;
});

// ── 1b. one differing word is still a failure, not a pass ─────────────────
test("a copy with a different h1 is reported below 1.000", () => {
  const body = words("same", 120);
  const { code, stdout } = run({
    "en/gpus/a": page("A", body),
    "en/gpus/b": page("B", body),
  });
  if (code !== 1) return `expected exit 1, got ${code}`;
  const score = scoreOf(stdout);
  if (!(score > 0.95 && score < 1)) return `expected 0.95..1, got ${score}`;
  return null;
});

// ── 2. different pages are not ────────────────────────────────────────────
test("two pages with different bodies pass", () => {
  const { code, stdout } = run({
    "en/gpus/a": page("A", words("alpha", 120)),
    "en/gpus/b": page("B", words("bravo", 120)),
  });
  if (code !== 0) return `expected exit 0, got ${code}: ${pairsOf(stdout).join(", ")}`;
  if (!stdout.includes("OK")) return "expected OK line";
  return null;
});

// ── 3. model-name-only difference must not be 1.000 ───────────────────────
// The real failure: `/gpus/amd-radeon-rx-9070-16gb` and `…-9070-xt-16gb` scored 1.000 against each
// other on the build, because each page's cross-link block lists the whole series — the 9070 page
// contains the shingle `AMD Radeon RX 9070 XT 16GB` and the XT page contains `AMD Radeon RX 9070
// 16GB`. As *sets* the pages are identical, and 1.000 is the right answer to the wrong question.
//
// Verified by regression: reverting `sortedHashes` to `uniqueSorted` turns this red.
test("pages differing only in model name do not score 1.000", () => {
  const specs = "VRAM 16 GB Memory bandwidth 645 GB s Reading speed 2560 tok s Writing speed 69.9 tok s";
  const models = ["AMD Radeon RX 9070 16GB", "AMD Radeon RX 9070 XT 16GB", "AMD Radeon RX 9060 XT 16GB"];
  // Every page lists every sibling, including itself — exactly what the built HTML does.
  const series = models.map((m) => `${m} ${specs}`).join(" ");
  const tail = "Data source estimated This card is not benchmarked yet See the benchmark table";
  const { stdout } = run({
    "en/gpus/9070": page("AMD Radeon RX 9070 16GB", `AMD Radeon RX 9070 16GB ${series} ${tail}`),
    "en/gpus/9070-xt": page("AMD Radeon RX 9070 XT 16GB", `AMD Radeon RX 9070 XT 16GB ${series} ${tail}`),
  });
  const score = scoreOf(stdout);
  if (score >= 0.999) return `cross-linked series must not score 1.000, got ${score}`;
  // It legitimately stays above the threshold — the pages really are similar. What must not happen
  // is the claim that they are identical.
  return null;
});

// ── 3b. repeats count: a page that says a block twice is not a copy ───────
// This is the assertion that actually pins the set-vs-multiset choice. Two pages whose *shingle
// sets* are equal but whose one page repeats a block read as identical under `Set` semantics
// (0.943 here) and clearly different under multiset Jaccard (0.485). Without this case, reverting
// to a `Set` would still pass test 3 — the series fixture differs in ordering, which changes the
// sets too — and the defect would come back silently.
test("a repeated block is not treated as identical text", () => {
  const block = Array.from({ length: 70 }, (_, i) => `repeatedword${i}`).join(" ");
  const { stdout } = run({
    "en/gpus/once": page("Once", block),
    "en/gpus/twice": page("Twice", `${block} ${block}`),
  });
  const score = scoreOf(stdout);
  if (score >= 0.9) return `repeats must be counted, got ${score}`;
  return null;
});

// ── 4. the df floor must not eat a two-page duplicate ─────────────────────
// A floor of 2 classifies every shingle of a two-page site as boilerplate and reports nothing.
test("a two-page duplicate survives --df=0.5", () => {
  const body = words("only", 120);
  const { code, stdout } = run(
    {
      "en/gpus/a": page("A", body),
      "en/gpus/b": page("B", body),
    },
    ["--df=0.5"],
  );
  if (code !== 1) return `expected exit 1, got ${code}: ${stdout.split("\n")[0]}`;
  if (pairsOf(stdout).length !== 1) return `expected 1 pair, got ${pairsOf(stdout).length}`;
  return null;
});

// ── 4b. df must not manufacture identity ──────────────────────────────────
// The real case this reproduces: `/en/gpus/amd-radeon-graphics-448sp-mobile-system-shared` and its
// `-2` differ only in `Board power 15 W` vs `25 W`. Both values are common across the catalog, so
// the df filter removed the differing shingles from *both* pages; what remained was identical and
// the pair was reported as 1.000, while `--df=0` gave the true 0.932.
//
// The score is therefore `min(filtered, raw)`. Without that, this fixture scores 1.000 — checked by
// reverting the line and watching this test fail.
test("df does not turn a differing page into a 1.000 duplicate", () => {
  // ~100 shingles, 90% shared, so the pair lands in the same LSH bands — the fixture has to be
  // big enough to be a candidate at all, which a short page is not.
  const head = words("common", 80);
  const tail = words("tail", 20);
  const spec = (watt) => `Card ${head} Board power ${watt} W ${tail}`;
  // The fillers must reuse the *same* tail. df counts 5-grams, not words: `Board power 15 W tailw0`
  // is a different shingle from `Board power 15 W g1w0`, so a filler with its own tail leaves the
  // differing shingles at df=1 and the filter removes nothing. With the shared tail they reach df=4
  // and get dropped, which is exactly the 448sp situation.
  const filler = (n, watt) => page(`F${n}`, `Card ${words(`f${n}`, 80)} Board power ${watt} W ${tail}`);
  const { code, stdout } = run({
    "en/gpus/card": page("Card", spec(15)),
    "en/gpus/card-2": page("Card", spec(25)),
    "en/gpus/f1": filler(1, 15),
    "en/gpus/f2": filler(2, 25),
    "en/gpus/f3": filler(3, 15),
    "en/gpus/f4": filler(4, 25),
  });
  if (code !== 1) return `expected exit 1 (the pair is similar), got ${code}`;
  const line = stdout.split("\n").find((l) => l.includes("/en/gpus/card ~ /en/gpus/card-2"));
  if (!line) return `expected the card pair in the report, got: ${stdout.trim()}`;
  const score = Number(line.trim().split(" ").pop());
  // On this fixture the filtered Jaccard is 0.952 and the raw one is 0.906; the pair must be
  // reported at the lower of the two. Asserting only `< 0.99` would pass for either number, which
  // is how the first version of this test failed to notice the `min()` being removed.
  if (score > 0.93) return `expected the raw score ~0.906 to win, got ${score} (filtered-only is 0.952)`;
  return null;
});

// ── 5. df removes a shared template block ─────────────────────────────────
// Three pages, 160 shared tokens each and 10 unique ones: 0.867 raw. Without the filter that is
// a wall of false positives; with it, nothing. This is the `/gpus/vendor/*` "Other series" case.
test("a template block shared by several pages is filtered out", () => {
  const shared = words("series", 160);
  const files = {};
  for (const suffix of ["a", "b", "c"]) {
    files[`en/gpus/tpl-${suffix}`] = page(`TPL ${suffix}`, `${shared} ${words(`u${suffix}`, 10)}`);
  }
  // A fourth page that is a genuine copy, to prove the filter does not clear the whole build.
  files["en/gpus/dup-1"] = page("D1", words("real", 120));
  files["en/gpus/dup-2"] = page("D2", words("real", 120));

  const withFilter = run(files);
  const without = run(files, ["--df=0"]);

  if (without.code !== 1) return `--df=0 should still fail, got ${without.code}`;
  const unfiltered = pairsOf(without.stdout).filter((pair) => pair.includes("tpl-"));
  if (unfiltered.length !== 3) return `--df=0 expected 3 template pairs, got ${unfiltered.length}`;

  const filtered = pairsOf(withFilter.stdout);
  if (filtered.some((pair) => pair.includes("tpl-"))) return `template pairs should be filtered: ${filtered.join(", ")}`;
  if (!filtered.some((pair) => pair.includes("/en/gpus/dup-1 ~ /en/gpus/dup-2"))) {
    return `the real duplicate must survive the filter, got: ${filtered.join(", ")}`;
  }
  return null;
});

// ── 6. locales are never compared to each other ───────────────────────────
test("identical pages in different locales are not compared", () => {
  const body = words("same", 120);
  const { code } = run({
    "en/gpus/a": page("A", body),
    "zh/gpus/a": page("A", body),
  });
  if (code !== 0) return `expected exit 0, got ${code}`;
  return null;
});

// ── 7. "could not run" is exit 2, not exit 1 ──────────────────────────────
// Exit 0 would mean "no duplicate found" on a build where nothing was read — the failure mode this
// file exists to prevent. Exit 2 separates that from a genuine finding: the deploy wrapper reports
// exit 1 as "duplicate pages, continuing" and exit 2 as a broken check, so a run that never
// happened cannot be printed as a clean result.
test("a build with only thin pages exits 2 and says why", () => {
  const { code, stdout } = run({
    "en/gpus/a": page("A", "too short to compare"),
    "en/gpus/b": page("B", "too short to compare"),
  });
  if (code !== 2) return `expected exit 2, got ${code}`;
  if (!/no page has >= 50 tokens/.test(stdout)) return `expected a "no page" message, got: ${stdout.trim()}`;
  return null;
});

test("a missing build directory exits 2", () => {
  const { code, stdout } = run({}, [], { dist: ".next-absent" });
  if (code !== 2) return `expected exit 2, got ${code}`;
  if (!/no build output/.test(stdout)) return `expected a "no build output" message, got: ${stdout.trim()}`;
  return null;
});

// ── runner ────────────────────────────────────────────────────────────────
let failed = 0;
for (const { name, fn } of cases) {
  let problem = null;
  try {
    problem = fn();
  } catch (error) {
    problem = error.message;
  }
  if (problem) {
    failed += 1;
    console.log(`  ✗ ${name}\n      ${problem}`);
  } else {
    console.log(`  ✓ ${name}`);
  }
}

console.log(`\n${cases.length - failed}/${cases.length} passed → EXIT=${failed ? 1 : 0}`);
process.exit(failed ? 1 : 0);
