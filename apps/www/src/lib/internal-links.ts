/**
 * Internal links, as data rather than markup.
 *
 * The site is crawled from the outside in, so the value of an article is not only its own text
 * but the pages it hands the reader next. Two things are computed here rather than inside each
 * page: which pages a given page should point at, and whether a link is one a crawler can
 * actually reach. Keeping both as pure functions means the rules can be tested without a build,
 * which is the only way to notice that (for example) a locale's guides never link to its GPU
 * catalogue.
 */

export type LinkItem = { href: string; title: string; note?: string };

/**
 * Path builders for detail pages.
 *
 * They live here, next to the link helpers that emit the same URLs, because a test runs this
 * file straight from source and cannot follow a bare relative import. `lib/routes` re-exports
 * them, so pages still import from one place and a segment is spelled once.
 *
 * `Link` from `@/i18n/navigation` adds the locale prefix, so these stay locale-free.
 */
export function guidePath(slug: string): string {
  return `/guides/${encodeURIComponent(slug)}`;
}

export function gpuPath(slug: string): string {
  return `/gpus/${encodeURIComponent(slug)}`;
}

/** Browsable index of one chip vendor, e.g. `/gpus/vendor/nvidia`. */
export function gpuVendorPath(vendor: string): string {
  return `/gpus/vendor/${encodeURIComponent(vendor)}`;
}

/** One marketing family inside a vendor, e.g. `/gpus/vendor/nvidia/geforce-rtx-40`. */
export function gpuSeriesPath(vendor: string, series: string): string {
  return `/gpus/vendor/${encodeURIComponent(vendor)}/${encodeURIComponent(series)}`;
}

export function rigPath(id: string): string {
  return `/benchmarks/${encodeURIComponent(id)}`;
}

export function releasePath(tag: string): string {
  return `/releases/${encodeURIComponent(tag)}`;
}

/**
 * Prefixes that must never be linked to, indexed, or listed in a sitemap.
 *
 * `/b` is the legacy board path, `/login` and `/dashboard` are account pages, and the rest are
 * framework or ops endpoints. One list means a link helper cannot turn a session URL into a
 * crawl target by accident.
 */
export const PRIVATE_PREFIXES = [
  "/b",
  "/login",
  "/register",
  "/dashboard",
  "/settings",
  "/api",
  "/_next",
  "/admin",
  "/ops",
] as const;

/** True when the path is public and therefore lawful to link, index, and list. */
export function isPublicPath(pathname: string): boolean {
  if (!pathname || !pathname.startsWith("/")) return false;
  const path = pathname.split(/[?#]/)[0];
  return !PRIVATE_PREFIXES.some((prefix) => path === prefix || path.startsWith(`${prefix}/`));
}

/** First path segment that is a language rather than a hub (`/zh/gpus/x` → `/zh`). */
function localePrefix(parts: string[]): string[] {
  if (parts.length > 1 && /^[a-z]{2}(?:-[A-Za-z]{2,4})?$/.test(parts[0])) return [parts[0]];
  return [];
}

/**
 * The hub a detail page hangs off, or undefined for a top-level page.
 *
 * The language segment is skipped rather than treated as the parent: `/zh/gpus/rtx-4090` hangs
 * off `/zh/gpus`, and a breadcrumb pointing at `/zh` would send a reader to the home page while
 * claiming to be its section.
 */
export function parentPathOf(pathname: string): string | undefined {
  const parts = pathname.split(/[?#]/)[0].split("/").filter(Boolean);
  const prefix = localePrefix(parts);
  const rest = parts.slice(prefix.length);
  return rest.length > 1 ? `/${[...prefix, rest[0]].join("/")}` : undefined;
}

/** Detail paths are `/locale/<hub>/<slug>`; hubs are the first segment after the locale. */
const HREF = /^\/(?:[a-z]{2}(?:-[A-Za-z]{2,4})?\/)?[a-z0-9]+(?:[/?][^\s#]*)?$/;

/** The private-prefix test lives with the route model; this is just the readable alias. */
const isPrivatePath = (pathname: string) => !isPublicPath(pathname);

/**
 * Whether an href is safe to emit as an internal link.
 *
 * Absolute URLs pointing at our own host count as internal: the generator writes links in that
 * form often enough that rejecting them would drop a third of the links in the corpus. Anything
 * off-site, protocol relative, or script-shaped is rejected — those are either links we must not
 * claim as internal or links a crawler will report as broken.
 */
export function isInternalHref(href: string): boolean {
  if (typeof href !== "string" || href.length === 0) return false;
  if (/^(?:mailto|tel|javascript|data):/i.test(href)) return false;
  if (href.startsWith("#")) return false;
  if (href.startsWith("//")) return false;

  let path = href;
  if (/^https?:\/\//i.test(href)) {
    let url: URL;
    try {
      url = new URL(href);
    } catch {
      return false;
    }
    const host = url.hostname.replace(/^www\./, "");
    const own = (process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.stratat.com")
      .replace(/^https?:\/\//, "")
      .replace(/^www\./, "")
      .split("/")[0];
    if (host !== own) return false;
    path = url.pathname;
  }

  if (!path.startsWith("/")) return false;
  // The home page is the one path with no segment, and it is the most-linked page on the site.
  if (path === "/") return true;
  return !isPrivatePath(path) && HREF.test(path);
}

/**
 * How a link in article prose should be rendered.
 *
 * A body is model-written text, so the protocol cannot be assumed: `mailto:` and `tel:` are real
 * links that the site router must not swallow, `javascript:` and `data:` are active content that
 * must never reach an `href` at all, and protocol-relative `//host` leaves the site without
 * looking like it does. Classifying once, here, is what lets the renderer stay a plain switch.
 */
export type HrefKind = "internal" | "external" | "contact" | "unsafe";

export function classifyHref(href: string): HrefKind {
  const value = String(href ?? "").trim();
  if (!value) return "unsafe";
  if (/^(?:javascript|data|vbscript|file):/i.test(value)) return "unsafe";
  if (/^(?:mailto|tel):/i.test(value)) return "contact";
  if (isInternalHref(value)) return "internal";
  // Anything still absolute is a normal outbound http(s) link; `//host` is outbound too, just
  // without a scheme, and is treated as external rather than silently rendered as a site path.
  return /^(?:https?:)?\/\//i.test(value) ? "external" : "unsafe";
}

/** Drops duplicates (first win), the current page, and anything that is not a usable internal link. */
export function uniqueLinks(items: LinkItem[], options: { excludeHref?: string } = {}): LinkItem[] {
  const self = options.excludeHref?.replace(/\/$/, "");
  const seen = new Set<string>();
  const out: LinkItem[] = [];
  for (const item of items) {
    if (!isInternalHref(item.href)) continue;
    const key = item.href.replace(/\/$/, "");
    if (key === self || seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

/** Siblings picked for a guide page. */
export type RelatedPick = { slug: string; href: string; title: string };

/**
 * Links to the other guides in the same language, nearest first.
 *
 * "Nearest" is the same category first, then the rest — the order a reader actually wants, and
 * the order that keeps a crawler moving through the cluster instead of bouncing between two
 * hubs. The current page is always excluded: a self link is worth nothing and shows up in every
 * crawl report as a defect.
 */
export function pickRelated(
  candidates: { slug: string; kind: string; order: number; title?: string }[],
  current: { slug: string; kind: string },
  limit = 4,
  kindOrder: readonly string[] = [],
): RelatedPick[] {
  const rank = (kind: string) => {
    const index = kindOrder.indexOf(kind);
    return index === -1 ? kindOrder.length : index;
  };
  const sorted = [...candidates]
    .filter((item) => item.slug !== current.slug)
    .sort((a, b) => {
      const kindDelta = (a.kind === current.kind ? 0 : 1) - (b.kind === current.kind ? 0 : 1);
      return kindDelta || rank(a.kind) - rank(b.kind) || a.order - b.order;
    });

  const seen = new Set<string>();
  const picked: RelatedPick[] = [];
  for (const item of sorted) {
    if (seen.has(item.slug)) continue;
    seen.add(item.slug);
    picked.push({ slug: item.slug, href: guidePath(item.slug), title: item.title ?? item.slug });
    if (picked.length >= limit) break;
  }
  return picked;
}

export type Mention = { href: string; title: string };

/**
 * Whether a card name is distinctive enough to match in prose.
 *
 * The catalogue contains legitimate cards called "300" (SiS) and "6326", and matching those
 * with word boundaries turns every number in a sentence into a GPU link — "runs at 300 tok/s"
 * would point at a 1999 SiS chip. A name needs at least one letter to be unambiguous.
 */
export function isLinkableName(name: string): boolean {
  return /[a-z]/i.test(name.trim());
}

/**
 * Hardware names a body text refers to, longest name first.
 *
 * A guide that says "the 4090 runs this at 30 tok/s" is the best possible inbound link to the
 * 4090 page, but only if something turns that mention into a link. Matching is done on the
 * display name with word boundaries, longest first, so "RTX 4070 Ti SUPER 16GB" wins over
 * "RTX 4070" and a name inside a longer name is not double-linked.
 */
export function findMentions(
  text: string,
  catalog: { name: string; slug: string }[],
  options: { limit?: number; exclude?: string[] } = {},
): Mention[] {
  const { limit = 3, exclude = [] } = options;
  if (!text) return [];
  const skip = new Set(exclude);
  const ordered = catalog
    .filter((gpu) => isLinkableName(gpu.name))
    .sort((a, b) => b.name.length - a.name.length);

  const found: Mention[] = [];
  let haystack = text;
  for (const gpu of ordered) {
    if (found.length >= limit) break;
    if (skip.has(gpu.slug)) continue;
    // Names contain regex metacharacters ("RX 7900 XTX ("): escape before building the pattern.
    const pattern = new RegExp(`(?<![\\w-])${gpu.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![\\w-])`, "i");
    const hit = pattern.exec(haystack);
    if (!hit) continue;
    found.push({ href: gpuPath(gpu.slug), title: gpu.name });
    // Blank the match out so a shorter name nested inside it cannot be picked again.
    haystack = haystack.slice(0, hit.index) + " ".repeat(hit[0].length) + haystack.slice(hit.index + hit[0].length);
  }
  return found;
}

/**
 * Rewrites the first mention of each catalogue name in a body into a link to that page.
 *
 * Only the first mention is linked: a body that says "RTX 4090" six times does not need six
 * links to the same page, and repeating them is the kind of thing that reads as keyword
 * stuffing to both readers and classifiers. Regions that are already links, code spans, or
 * headings are left alone so an existing link cannot be nested inside a new one.
 */
export function linkifyMentions(
  body: string,
  catalog: { name: string; slug: string }[],
  options: { limit?: number; exclude?: string[] } = {},
): string {
  const { limit = 3, exclude = [] } = options;
  if (!body) return body;
  const mentions = findMentions(body, catalog, { limit, exclude });
  if (mentions.length === 0) return body;

  // Protected spans: existing links, inline code, and setext/ATX headings.
  const protectedRanges: [number, number][] = [];
  for (const pattern of [/\[[^\]]*\]\([^)]*\)/g, /`[^`]*`/g, /^#{1,6} .*$/gm]) {
    for (const match of body.matchAll(pattern)) {
      protectedRanges.push([match.index, match.index + match[0].length]);
    }
  }
  const blocked = (start: number, end: number) =>
    protectedRanges.some(([from, to]) => start < to && end > from);

  let out = body;
  for (const mention of mentions) {
    const escaped = mention.title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const pattern = new RegExp(`(?<![\\w-])${escaped}(?![\\w-])`, "gi");
    // A mention that already sits inside a link or a heading is not free to link, but a later
    // occurrence in plain prose is — so keep scanning instead of giving up on the whole name.
    for (const hit of out.matchAll(pattern)) {
      const start = hit.index;
      const end = start + hit[0].length;
      if (blocked(start, end)) continue;
      out = `${out.slice(0, start)}[${hit[0]}](${mention.href})${out.slice(end)}`;
      // The insertion shifted every later range; recompute rather than tracking deltas.
      protectedRanges.length = 0;
      for (const p of [/\[[^\]]*\]\([^)]*\)/g, /`[^`]*`/g, /^#{1,6} .*$/gm]) {
        for (const range of out.matchAll(p)) protectedRanges.push([range.index, range.index + range[0].length]);
      }
      break;
    }
  }
  return out;
}

/**
 * The crawlable trail for a page: home, the hub it sits under, then the page itself.
 *
 * The leaf entry is returned too — it is not a link on the page, but the same call feeds
 * `BreadcrumbList`, and structured data that disagrees with the visible trail is worse than none.
 */
export type Crumb = { href: string; label: string; current?: boolean };

export function breadcrumbLinks(pathname: string, leafTitle?: string): Crumb[] {
  const path = (pathname.split(/[?#]/)[0] || "/").replace(/\/+$/, "") || "/";
  if (!isPublicPath(path)) return [];
  if (path === "/") return [{ href: "/", label: "Home", current: true }];

  const parent = parentPathOf(path);
  const trail: Crumb[] = [{ href: "/", label: "Home" }];
  if (parent && parent !== "/" && isPublicPath(parent)) {
    trail.push({ href: parent, label: parent.split("/").filter(Boolean).pop() ?? parent });
  }
  trail.push({
    href: path,
    label: leafTitle ?? path.split("/").filter(Boolean).pop() ?? path,
    current: true,
  });
  return trail;
}

/**
 * A locale's guides for the same topic, used to expose the language switch to crawlers: an
 * article translated into four languages should be one cluster, not four orphans.
 */
export function translationLinks(
  slug: string,
  locales: { code: string; title: string }[],
  current: string,
): LinkItem[] {
  return uniqueLinks(
    locales
      .filter((entry) => entry.code !== current)
      .map((entry) => ({ href: `/${entry.code}${guidePath(slug)}`, title: entry.title, note: entry.code })),
  );
}
