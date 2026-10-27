import test from "node:test";
import assert from "node:assert/strict";
import {
  comparePatrol,
  parseAudit,
  parseSimilarity,
  parseSitemap,
} from "../../apps/www/scripts/patrol-lib.mjs";

const AUDIT_CLEAN = "pages=43016 indexable=42987 noindex=29\naudit score=100 checks=14 EXIT=0\nOK";
const AUDIT_DIRTY = [
  "pages=43016 indexable=42987 noindex=29",
  "audit score=93 checks=14 EXIT=1",
  "failed=performance-budget count=105 detail=/en/pulls 2262889>180000",
  "failed=jsonld-coverage count=3 detail=/en/foo",
].join("\n");
const SIM_CLEAN = "pages=43016 candidates=0 verified=0\nsimilarity max=0.000 threshold=0.72 pairs=0 EXIT=0\nOK";
const SIM_DIRTY = "pages=43016 candidates=1 verified=1\nsimilarity max=1.000 threshold=0.72 pairs=1936 EXIT=1";

const healthy = {
  audit: parseAudit(AUDIT_CLEAN),
  similarity: parseSimilarity(SIM_CLEAN),
  sitemap: { urls: 43000, problems: 0 },
};

test("patrol: parsing keeps per-check failure counts, not just the score", () => {
  const audit = parseAudit(AUDIT_DIRTY);
  assert.equal(audit.score, 93);
  assert.equal(audit.checks, 14);
  assert.equal(audit.failed["performance-budget"], 105);
  assert.equal(audit.failed["jsonld-coverage"], 3);
  assert.equal(parseAudit("garbage"), null, "unparseable output must not read as a pass");

  assert.deepEqual(parseSimilarity(SIM_DIRTY), { max: 1, pairs: 1936 });
  assert.equal(parseSimilarity("nothing here"), null);
  assert.deepEqual(parseSitemap("sitemap urls: 43000\nOK", 0), { urls: 43000, problems: 0 });
  assert.equal(parseSitemap("sitemap urls: 43000", 1).problems, 1);
});

test("patrol: first run with no baseline records a floor instead of failing", () => {
  const result = comparePatrol(healthy, null);
  assert.deepEqual(result.regressions, []);
  assert.match(result.improvements[0], /becomes the floor/);
});

test("patrol: today's failures are the floor, not a fail", () => {
  // The point of the ratchet: a build that is imperfect but unchanged must deploy.
  const same = {
    audit: parseAudit(AUDIT_DIRTY),
    similarity: parseSimilarity(SIM_DIRTY),
    sitemap: { urls: 43000, problems: 0 },
  };
  const result = comparePatrol(same, same);
  assert.deepEqual(result.regressions, []);
  assert.deepEqual(result.improvements, []);
});

test("patrol: any of the four regression shapes is caught", () => {
  const base = {
    audit: parseAudit(AUDIT_DIRTY),
    similarity: parseSimilarity(SIM_DIRTY),
    sitemap: { urls: 43000, problems: 0 },
  };

  const lowerScore = comparePatrol(
    { ...base, audit: { ...base.audit, score: 86 } },
    base,
  );
  assert.match(lowerScore.regressions.join(), /audit score 93 → 86/);

  const moreFailures = comparePatrol(
    {
      ...base,
      audit: { ...base.audit, failed: { ...base.audit.failed, "performance-budget": 140 } },
    },
    base,
  );
  assert.match(moreFailures.regressions.join(), /performance-budget failures 105 → 140/);

  const newCheck = comparePatrol(
    {
      ...base,
      audit: { ...base.audit, failed: { ...base.audit.failed, "og-image-coverage": 4 } },
    },
    base,
  );
  assert.match(newCheck.regressions.join(), /new failing check: og-image-coverage/);

  const morePairs = comparePatrol(
    { ...base, similarity: { ...base.similarity, pairs: 1937 } },
    base,
  );
  assert.match(morePairs.regressions.join(), /duplicate pairs 1936 → 1937/);
});

test("patrol: improving one number while worsening another still fails", () => {
  const base = {
    audit: parseAudit(AUDIT_DIRTY),
    similarity: parseSimilarity(SIM_DIRTY),
    sitemap: { urls: 43000, problems: 0 },
  };
  const mixed = comparePatrol(
    {
      ...base,
      audit: { ...base.audit, score: 96, failed: { ...base.audit.failed, "jsonld-coverage": 0 } },
      similarity: { ...base.similarity, pairs: 2000 },
    },
    base,
  );
  assert.ok(mixed.improvements.length > 0);
  assert.match(mixed.regressions.join(), /duplicate pairs 1936 → 2000/);
});

test("patrol: a phantom or orphan sitemap URL fails even with no baseline history", () => {
  const result = comparePatrol({ ...healthy, sitemap: { urls: 43000, problems: 1 } }, healthy);
  assert.match(result.regressions.join(), /sitemap check reported problems/);
});

test("patrol: a check that could not run is a regression, never a pass", () => {
  const result = comparePatrol({ ...healthy, similarity: null }, healthy);
  assert.match(result.regressions.join(), /could not run: similarity/);
  assert.equal(result.improvements.length, 0);
});

test("patrol: pruning duplicate pages counts as an improvement", () => {
  const base = {
    audit: parseAudit(AUDIT_DIRTY),
    similarity: parseSimilarity(SIM_DIRTY),
    sitemap: { urls: 43000, problems: 0 },
  };
  const better = comparePatrol(
    {
      ...base,
      audit: { ...base.audit, score: 93, failed: { ...base.audit.failed, "performance-budget": 0 } },
      similarity: { ...base.similarity, pairs: 546 },
    },
    base,
  );
  assert.deepEqual(better.regressions, []);
  assert.match(better.improvements.join(), /performance-budget failures 105 → 0/);
  assert.match(better.improvements.join(), /duplicate pairs 1936 → 546/);
});
