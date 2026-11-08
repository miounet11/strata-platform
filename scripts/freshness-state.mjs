/**
 * Pure state comparison for the freshness watcher.
 *
 * Split out of `freshness-watch.mjs` so it can be tested without running a build. The watcher
 * decides "did the data change, or did the sync break?" from these two questions, and the
 * answer has to be right in both directions: a real regression must stop the rebuild, and a
 * healthy feed that merely slid must not.
 */

/**
 * True when entries present in `prevIds` are gone from `nextIds` *and* nothing new arrived.
 *
 * A sliding window over an RSS feed drops old entries by design while adding new ones, so
 * "some are gone" alone is not a regression. Losing entries with nothing to replace them is
 * what a failed sync looks like.
 */
export function looksLikeLoss(prevIds = [], nextIds = []) {
  if (!prevIds.length) return false;
  const next = new Set(nextIds);
  const lost = prevIds.some((id) => !next.has(id));
  const gained = nextIds.some((id) => !prevIds.includes(id));
  return lost && !gained;
}

/**
 * Whether the release set changed.
 *
 * `releases.json` is a complete list, so the identity list is compared directly. An older state
 * file without `releaseTags` falls back to the count and top tag it does have.
 */
export function releaseSetChanged(prev = {}, next = {}) {
  const prevIds = Array.isArray(prev.releaseTags) ? prev.releaseTags : [];
  if (!prevIds.length) {
    return prev.releaseCount !== next.releaseCount || prev.topTag !== next.topTag;
  }
  // Compare as sets: the order in the state file is not meaningful, and an older state file
  // written before the ids were sorted would otherwise look like a change on every run.
  const a = [...prevIds].sort();
  const b = [...(next.releaseTags ?? [])].sort();
  return a.length !== b.length || a.some((id, i) => id !== b[i]);
}

/** Same rule for the changelog, whose source is a sliding window rather than a complete list. */
export function changelogSetChanged(prev = {}, next = {}) {
  const prevIds = Array.isArray(prev.changelogIds) ? prev.changelogIds : [];
  if (!prevIds.length) {
    return prev.changelogTop !== next.changelogTop || prev.changelogCount !== next.changelogCount;
  }
  const a = [...prevIds].sort();
  const b = [...(next.changelogIds ?? [])].sort();
  return a.length !== b.length || a.some((id, i) => id !== b[i]);
}

/**
 * The full verdict for one watcher run.
 *
 * @returns {{changed: boolean, degraded: boolean, releasesLost: boolean, changelogLost: boolean}}
 */
export function compareState(prev = {}, next = {}, { firstRun = false } = {}) {
  const prevReleaseIds = Array.isArray(prev.releaseTags) ? prev.releaseTags : [];
  const prevChangelogIds = Array.isArray(prev.changelogIds) ? prev.changelogIds : [];

  const releasesLost = prevReleaseIds.length
    ? looksLikeLoss(prevReleaseIds, next.releaseTags ?? [])
    : (next.releaseCount ?? 0) < (prev.releaseCount ?? 0);
  // A changelog that shrank to *nothing* is a failed feed. A smaller non-zero count is a window
  // that slid; whether that is a loss depends on whether anything new arrived.
  const changelogLost = prevChangelogIds.length
    ? looksLikeLoss(prevChangelogIds, next.changelogIds ?? [])
    : (next.changelogCount ?? 0) === 0 && (prev.changelogCount ?? 0) > 0;

  const changed =
    firstRun || releaseSetChanged(prev, next) || changelogSetChanged(prev, next);
  const degraded = !firstRun && (releasesLost || changelogLost);

  return { changed, degraded, releasesLost, changelogLost };
}
