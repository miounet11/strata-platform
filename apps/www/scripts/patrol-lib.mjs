/**
 * Pure parsing and ratchet logic for `patrol.mjs`. Kept separate so the rules can be tested
 * without a build tree: the interesting part is "which change counts as worse", not the reading
 * of stdout.
 *
 * The problem this solves: `audit.mjs` and `similarity.mjs` already measure the right things, but
 * both were wired as advisory gates because the site currently fails them (1,936 near-duplicate
 * pairs). Advisory means the log line is the only record, and nobody reads a log on a box they
 * are not logged into. Strict means every deploy is blocked today — including ones that improve
 * things. Neither is a gate.
 *
 * A ratchet is: the numbers may stay the same or get better, never worse. Today's failures become
 * the floor, so the deploy is safe to block immediately, and every improvement is locked in the
 * moment it happens. Nothing here needs a human to pick a threshold: the current build *is* the
 * threshold, and it can only move in one direction.
 */

/** `audit score=100 checks=14 EXIT=0` plus one `failed=<id> count=<n>` line per failing check. */
export function parseAudit(stdout) {
  const summary = /audit score=(\d+) checks=(\d+) EXIT=(\d+)/.exec(stdout);
  if (!summary) return null;
  const pages = /pages=(\d+)/.exec(stdout);
  const failed = {};
  for (const line of stdout.split("\n")) {
    const hit = /^failed=(\S+) count=(\d+)/.exec(line);
    if (hit) failed[hit[1]] = Number(hit[2]);
  }
  return {
    score: Number(summary[1]),
    checks: Number(summary[2]),
    pages: pages ? Number(pages[1]) : 0,
    failed,
  };
}

/** `similarity max=0.000 threshold=0.72 pairs=1936 EXIT=1` */
export function parseSimilarity(stdout) {
  const summary = /similarity max=([\d.]+) threshold=[\d.]+ pairs=(\d+) EXIT=(\d+)/.exec(stdout);
  if (!summary) return null;
  return { max: Number(summary[1]), pairs: Number(summary[2]) };
}

/** `sitemap urls: 43000` — the problem count is the exit code, not a line. */
export function parseSitemap(stdout, exitCode) {
  const urls = /sitemap urls: (\d+)/.exec(stdout);
  return { urls: urls ? Number(urls[1]) : 0, problems: exitCode === 0 ? 0 : 1 };
}

/**
 * Compare a run against the stored floor.
 *
 * "Worse" is deliberately narrow, because a gate that fires on noise gets disabled:
 *  - the score drops, or a check that passed starts failing, or a failing check gets more failures
 *  - more near-duplicate pairs than the floor
 *  - the sitemap check reports a problem at all (its floor is always zero — a phantom or orphan
 *    URL is a bug whether or not it existed yesterday)
 *  - a check could not run at all (`null`): that is a broken measurement, never a pass
 *
 * Page count, sitemap URL count and the maximum similarity score are recorded but not gated:
 * pruning duplicate pages legitimately lowers the first two, and one page getting worse while
 * the pair count falls is still an improvement overall.
 */
export function comparePatrol(current, baseline) {
  const regressions = [];
  const improvements = [];

  if (!current.audit || !current.similarity || !current.sitemap) {
    const missing = ["audit", "similarity", "sitemap"].filter((k) => !current[k]);
    return { regressions: [`check could not run: ${missing.join(", ")}`], improvements: [] };
  }
  if (!baseline || !baseline.audit || !baseline.similarity) {
    return { regressions: [], improvements: ["no baseline yet — this run becomes the floor"] };
  }

  const { audit, similarity, sitemap } = current;

  if (audit.score < baseline.audit.score) {
    regressions.push(`audit score ${baseline.audit.score} → ${audit.score}`);
  } else if (audit.score > baseline.audit.score) {
    improvements.push(`audit score ${baseline.audit.score} → ${audit.score}`);
  }

  for (const [id, previous] of Object.entries(baseline.audit.failed ?? {})) {
    const now = audit.failed[id] ?? 0;
    if (now > previous) regressions.push(`${id} failures ${previous} → ${now}`);
    else if (now < previous) improvements.push(`${id} failures ${previous} → ${now}`);
  }
  for (const [id, now] of Object.entries(audit.failed)) {
    if (!(id in (baseline.audit.failed ?? {}))) regressions.push(`new failing check: ${id} (${now})`);
  }

  if (similarity.pairs > baseline.similarity.pairs) {
    regressions.push(`duplicate pairs ${baseline.similarity.pairs} → ${similarity.pairs}`);
  } else if (similarity.pairs < baseline.similarity.pairs) {
    improvements.push(`duplicate pairs ${baseline.similarity.pairs} → ${similarity.pairs}`);
  }

  if (sitemap.problems > 0) regressions.push("sitemap check reported problems");

  return { regressions, improvements };
}
