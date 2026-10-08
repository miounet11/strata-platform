import { changelogLead, getChangelog } from "@/lib/changelog";

export const revalidate = 1800;

const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.stratat.com";

function esc(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function GET() {
  const { items, syncedAt } = getChangelog();
  const rows = items.slice(0, 40).map((item) => {
    const link = item.tag?.startsWith("v") ? `${SITE}/en/releases/${item.tag}` : item.url;
    return `<item>
<title>${esc(item.title)}</title>
<link>${esc(link)}</link>
<guid isPermaLink="false">${esc(item.id)}</guid>
<pubDate>${new Date(item.publishedAt).toUTCString()}</pubDate>
<description>${esc(changelogLead(item.summary))}</description>
</item>`;
  });
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
<channel>
<title>Strata changelog</title>
<link>${SITE}/en/changelog</link>
<description>Strata engine releases mirrored on stratat.com</description>
<lastBuildDate>${new Date(syncedAt).toUTCString()}</lastBuildDate>
${rows.join("\n")}
</channel>
</rss>`;
  return new Response(xml, {
    headers: {
      "Content-Type": "application/rss+xml; charset=utf-8",
      "Cache-Control": "public, max-age=1800",
    },
  });
}
