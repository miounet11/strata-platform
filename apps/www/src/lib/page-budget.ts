/**
 * How many entries one list page renders.
 *
 * The mirror holds 2,031 pull requests and single labels with 1,600+ entries, and one AMD series
 * has 380 cards. Rendering every row put 2.2 MB of HTML on `/pulls` and pushed 105 pages past the
 * 180 KB budget in `scripts/audit.mjs`. Cutting the list to the newest entries keeps the page inside
 * budget; nothing becomes unreachable, because every entry keeps its own detail page and every
 * detail page is in the sitemap.
 *
 * 75, not 100: the 2026-11 production mirror carries 2,031 pulls with ~80-char titles and the
 * widest locale (`ja`) put `/issues` at 182 KB with 100 rows — over the 180 KB budget again.
 * 75 rows leaves ~13 KB of headroom. Both list pages still link to GitHub for the full set, and
 * every entry keeps its own detail page in the sitemap.
 */
export const LISTED = 75;

/**
 * Guides listed per kind on `/guides`.
 *
 * The generator had written 143–170 guides per locale by 2026-10-27, and the index rendered every
 * one of them: `/ja/guides` reached 191 KB and `/en`, `/zh` were 183 KB, all past the 180 KB budget
 * in `scripts/audit.mjs`. The page is grouped by kind, so a single flat `LISTED` cap would not
 * bound it — the corpus grows inside the groups. 12 per kind caps the page at 6 × 12 = 72 entries
 * (~92 KB at the measured ~1 KB per entry) no matter how many guides are published next month.
 *
 * Nothing becomes unreachable: every guide keeps its own page, and every guide page is in the
 * sitemap. The index states how many were held back, and the total count is still shown.
 */
export const GUIDES_LISTED = 12;

/**
 * Per-lane counts for `/pulse`. Signals are rendered twice (HTML plus the RSC payload), so the
 * page was costing roughly 1 KB per entry and landed at 229 KB with the old 35/25/30 counts.
 */
export const X_FEED = 14;
export const LANE = 10;
