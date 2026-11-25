import { NextResponse } from "next/server";
import { routing, type Locale } from "@/i18n/routing";
import { getLiveArticles } from "@/lib/articles";
import { getRigs } from "@/lib/benchmarks";
import { allBuilds, buildText } from "@/lib/builds";
import { allGpus, vramLabel } from "@/lib/gpus";
import { getReleases } from "@/lib/releases";
import { SCENARIOS } from "@/lib/scenarios";
import { getLiveTopics, topicText } from "@/lib/topics";
import { buildPath, gpuPath, guidePath, releasePath, rigPath } from "@/lib/routes";

export const dynamic = "force-dynamic";

export type SearchHit = {
  type: "guide" | "gpu" | "build" | "benchmark" | "topic" | "scenario" | "release";
  title: string;
  subtitle: string;
  href: string;
  badge: string;
  score: number;
};

function scoreText(needle: string, tokens: string[], title: string, extra = ""): number {
  const t = title.toLowerCase();
  const e = extra.toLowerCase();
  let score = 0;
  if (t === needle) score += 100;
  else if (t.startsWith(needle)) score += 60;
  else if (t.includes(needle)) score += 35;
  else if (e.includes(needle)) score += 15;

  let matched = 0;
  for (const tok of tokens) {
    if (t.includes(tok)) {
      score += 12;
      matched++;
    } else if (e.includes(tok)) {
      score += 5;
      matched++;
    }
  }
  if (tokens.length > 1 && matched === tokens.length) score += 20;
  return score;
}

/**
 * Lightweight full-site search API powering `/[locale]/search` and `WebSite.SearchAction`.
 * Searches live guides, topics, 9 best scenarios, 29 measured rigs, 3,200+ GPUs, and releases
 * without shipping megabytes of JSON into static HTML pages.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const rawQuery = (searchParams.get("q") ?? "").trim().slice(0, 100);
  const rawLocale = (searchParams.get("locale") ?? "en").trim().toLowerCase();
  const locale: Locale = routing.locales.includes(rawLocale as Locale) ? (rawLocale as Locale) : "en";
  const typeFilter = (searchParams.get("type") ?? "all").trim().toLowerCase();
  const limit = Math.min(40, Math.max(5, Number(searchParams.get("limit") ?? 24) || 24));

  if (!rawQuery) {
    return NextResponse.json({ query: "", locale, total: 0, results: [] });
  }

  const needle = rawQuery.toLowerCase();
  const tokens = needle.split(/\s+/).filter((t) => t.length >= 2);
  const effectiveTokens = tokens.length ? tokens : [needle];
  const hits: SearchHit[] = [];

  if (typeFilter === "all" || typeFilter === "guide") {
    for (const a of getLiveArticles(locale)) {
      const s = scoreText(
        needle,
        effectiveTokens,
        a.article.title,
        `${a.slug} ${a.kind} ${a.article.description}`,
      );
      if (s > 0) {
        hits.push({
          type: "guide",
          title: a.article.title,
          subtitle: a.article.description,
          href: guidePath(a.slug),
          badge: a.kind,
          score: s + 8,
        });
      }
    }
  }

  if (typeFilter === "all" || typeFilter === "benchmark") {
    for (const rig of getRigs()) {
      const s = scoreText(needle, effectiveTokens, rig.name, `${rig.vendor} ${rig.memory}gb ${rig.form}`);
      if (s > 0) {
        hits.push({
          type: "benchmark",
          title: rig.name,
          subtitle: `${rig.memory} GB · ${rig.writingToks} tok/s write · ${
            rig.localCostPerMM != null ? `$${rig.localCostPerMM.toFixed(3)}/M tok` : rig.form
          }`,
          href: rigPath(rig.id),
          badge: "benchmark",
          score: s + 10,
        });
      }
    }
  }

  if (typeFilter === "all" || typeFilter === "scenario") {
    for (const sc of SCENARIOS) {
      const label = sc.slug.replace(/-/g, " ");
      const s = scoreText(needle, effectiveTokens, label, `${sc.key} ${sc.rank} best gpu`);
      if (s > 0) {
        hits.push({
          type: "scenario",
          title: label,
          subtitle: `/best/${sc.slug}`,
          href: `/best/${sc.slug}`,
          badge: "best",
          score: s + 6,
        });
      }
    }
  }

  if (typeFilter === "all" || typeFilter === "topic") {
    for (const topic of getLiveTopics(locale)) {
      const title = topicText(topic.title, locale);
      const body = topicText(topic.body, locale);
      const s = scoreText(needle, effectiveTokens, title, `${topic.slug} ${body}`);
      if (s > 0) {
        hits.push({
          type: "topic",
          title,
          subtitle: body.slice(0, 140),
          href: `/topics/${topic.slug}`,
          badge: "topic",
          score: s + 7,
        });
      }
    }
  }

  if (typeFilter === "all" || typeFilter === "build") {
    for (const build of allBuilds()) {
      const title = buildText(build.title, locale);
      const tagline = buildText(build.tagline, locale);
      const parts = build.bom.map((part) => part.model).join(" ");
      const s = scoreText(
        needle,
        effectiveTokens,
        title,
        `${tagline} ${build.gpuModel} ${build.tier} ${build.vendor} ${build.totalVramGb}gb ${parts}`,
      );
      if (s > 0) {
        hits.push({
          type: "build",
          title,
          subtitle: `${build.totalVramGb} GB · ${build.writingToks} tok/s · $${build.totalPriceUsd.toLocaleString("en-US")}`,
          href: buildPath(build.slug),
          badge: build.tier,
          score: s + 11,
        });
      }
    }
  }

  if (typeFilter === "all" || typeFilter === "gpu") {
    let gpuMatches = 0;
    for (const gpu of allGpus()) {
      const s = scoreText(
        needle,
        effectiveTokens,
        gpu.name,
        `${gpu.vendor} ${gpu.series} ${gpu.arch} ${gpu.vramGb}gb ${gpu.gpuName ?? ""}`,
      );
      if (s > 0) {
        hits.push({
          type: "gpu",
          title: gpu.name,
          subtitle: [gpu.series, vramLabel(gpu, "Shared"), `${gpu.bandwidthGbs} GB/s`, gpu.support]
            .filter(Boolean)
            .join(" · "),
          href: gpuPath(gpu.slug),
          badge: gpu.runnable ? "GPU" : "GPU (legacy)",
          score: s + (gpu.runnable ? 6 : -4),
        });
        gpuMatches++;
        if (gpuMatches >= 80 && typeFilter === "all") break;
      }
    }
  }

  if (typeFilter === "all" || typeFilter === "release") {
    for (const rel of getReleases().releases.slice(0, 20)) {
      const s = scoreText(needle, effectiveTokens, `${rel.tag} ${rel.name}`, rel.body?.slice(0, 400) ?? "");
      if (s > 0) {
        hits.push({
          type: "release",
          title: rel.name || rel.tag,
          subtitle: `${rel.tag} · ${rel.publishedAt.slice(0, 10)}`,
          href: releasePath(rel.tag),
          badge: "release",
          score: s + 5,
        });
      }
    }
  }

  hits.sort((a, b) => b.score - a.score || a.title.localeCompare(b.title));

  return NextResponse.json(
    {
      query: rawQuery,
      locale,
      total: hits.length,
      results: hits.slice(0, limit),
    },
    {
      headers: {
        "cache-control": "public, max-age=60, s-maxage=300",
      },
    },
  );
}
