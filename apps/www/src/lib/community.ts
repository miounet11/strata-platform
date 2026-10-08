import communityData from "@/data/community.json";
import { readDataJson } from "@/lib/data-file";

function load() {
  return readDataJson("community.json", communityData);
}

export type CommunityIssue = (typeof communityData.issues)[number];
export type CommunityPull = (typeof communityData.pulls)[number];
export type CommunityLabel = (typeof communityData.labels)[number];

export function getCommunity() {
  return load();
}

export function getIssue(number: number): CommunityIssue | undefined {
  return load().issues.find((i) => i.number === number);
}

export function getPull(number: number): CommunityPull | undefined {
  return load().pulls.find((p) => p.number === number);
}

export function getLabel(slug: string): CommunityLabel | undefined {
  return load().labels.find((l) => l.slug === slug);
}

export function excerpt(text: string, max = 160): string {
  const flat = text.replace(/\s+/g, " ").trim();
  if (flat.length <= max) return flat;
  return `${flat.slice(0, max - 1)}…`;
}

/** Editorial hooks for GEO — links on-site docs from GitHub labels/titles. */
export function relatedLinks(item: { title: string; labels: { name: string }[] }) {
  const t = item.title.toLowerCase();
  const names = new Set(item.labels.map((l) => l.name.toLowerCase()));
  const links: { href: string; label: string }[] = [
    { href: "/install", label: "Install Strata" },
    { href: "/models", label: "Model sizes & RAM" },
    { href: "/releases", label: "Release notes" },
  ];
  if (names.has("documentation") || t.includes("doc")) {
    links.unshift({ href: "/install", label: "Setup guide" });
  }
  if (t.includes("benchmark") || t.includes("bench") || names.has("benchmark")) {
    links.unshift({ href: "/models", label: "Speed & hardware" });
  }
  if (t.includes("mcp") || t.includes("setup")) {
    links.unshift({ href: "/install", label: "AI-assisted setup" });
  }
  return links.slice(0, 4);
}
