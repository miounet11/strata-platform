import fallbackChangelog from "@/data/changelog.json";
import { readDataJson } from "@/lib/data-file";

type ChangelogItem = {
  id: string;
  title: string;
  url: string;
  publishedAt: string;
  source?: string;
  summary?: string;
};

function tagOf(item: ChangelogItem) {
  return (
    item.url.match(/\/tag\/(v[\d.]+)/i)?.[1]?.toLowerCase() ??
    item.title.match(/v\d+(?:\.\d+)+/i)?.[0]?.toLowerCase() ??
    item.id
  );
}

/** One row per release tag. The releases.json copy wins over the Atom twin. */
export function getChangelog() {
  const data = readDataJson("changelog.json", fallbackChangelog);
  const byTag = new Map<string, ChangelogItem & { tag: string }>();
  for (const item of data.items as ChangelogItem[]) {
    const tag = tagOf(item);
    const prev = byTag.get(tag);
    if (!prev) {
      byTag.set(tag, { ...item, tag });
      continue;
    }
    const prefer = item.source === "releases-json" || prev.source !== "releases-json" ? item : prev;
    const other = prefer === item ? prev : item;
    byTag.set(tag, {
      ...prefer,
      tag,
      summary: prefer.summary || other.summary,
    });
  }
  const items = [...byTag.values()].sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
  return { ...data, items };
}

export function changelogLead(summary: string | undefined, max = 220) {
  const head = (summary ?? "").split(/\n## |\n\|/)[0] ?? "";
  const plain = head
    .replace(/<[^>]+>/g, " ")
    .replace(/[#>*`]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (plain.length <= max) return plain;
  const slice = plain.slice(0, max);
  const cut = slice.lastIndexOf(" ");
  const base = cut > 80 ? slice.slice(0, cut) : slice;
  return `${base}…`;
}
