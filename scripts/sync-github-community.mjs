#!/usr/bin/env node
/**
 * Sync Niko1221/Strata issues & pull requests into www static JSON for SEO pages.
 * Optional: GITHUB_TOKEN for higher rate limits.
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT_DIR = join(ROOT, "apps/www/src/data");
const REPO = "Niko1221/Strata";
const [owner, repo] = REPO.split("/");

const headers = {
  Accept: "application/vnd.github+json",
  "User-Agent": "stratat-community-sync",
  "X-GitHub-Api-Version": "2022-11-28",
};
if (process.env.GITHUB_TOKEN) {
  headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
}

async function fetchAllPages(path, maxPages = 50) {
  const items = [];
  for (let page = 1; page <= maxPages; page++) {
    const sep = path.includes("?") ? "&" : "?";
    const url = `https://api.github.com${path}${sep}per_page=100&page=${page}`;
    const res = await fetch(url, { headers });
    if (res.status === 403) {
      const reset = res.headers.get("x-ratelimit-reset");
      throw new Error(`GitHub rate limit. Retry after ${reset ? new Date(Number(reset) * 1000).toISOString() : "later"}. Set GITHUB_TOKEN.`);
    }
    if (res.status === 422) break;
    if (!res.ok) throw new Error(`${url} → ${res.status}`);
    const batch = await res.json();
    if (!Array.isArray(batch) || batch.length === 0) break;
    items.push(...batch);
    if (batch.length < 100) break;
  }
  return items;
}

function mapLabels(labels) {
  return (labels ?? []).map((l) => ({
    name: l.name,
    color: l.color,
    description: l.description ?? "",
  }));
}

const TOPIC_RULES = [
  { slug: "benchmark", name: "Benchmarks", re: /\bbench(?:mark)?\b|tok\/s|tokens\/s/i },
  { slug: "setup-install", name: "Setup & install", re: /\bsetup\b|install|START-HERE|update\.sh/i },
  { slug: "serve-api", name: "Server & API", re: /\bserve\b|\/v1\/|openai|anthropic|monitor|mcp/i },
  { slug: "multi-gpu", name: "Multi-GPU", re: /multi-?gpu|layer-split|2x |dual |4 gpu/i },
  { slug: "amd-hip", name: "AMD / HIP", re: /\bAMD\b|HIP|ROCm|gfx11|Strix Halo|gfx1151/i },
  { slug: "nvidia-cuda", name: "NVIDIA / CUDA", re: /CUDA|RTX |sm_\d|Tensor/i },
  { slug: "models-quant", name: "Models & quants", re: /IQ3|Q2_0|Coder|quant|GGUF|context/i },
  { slug: "security", name: "Security", re: /security|CVE|XSS|auth/i },
  { slug: "docs", name: "Documentation", re: /\bdocs?\b|README|typo/i },
  { slug: "windows", name: "Windows", re: /Windows|\.bat\b/i },
  { slug: "linux", name: "Linux", re: /Linux|WSL|O_DIRECT/i },
];

function inferTopics(title, body) {
  const text = `${title}\n${body ?? ""}`;
  const found = [];
  for (const rule of TOPIC_RULES) {
    if (rule.re.test(text)) {
      found.push({
        slug: rule.slug,
        name: rule.name,
        color: "0d9488",
        description: `Auto topic: ${rule.name}`,
      });
    }
  }
  return found;
}

function mapIssue(item) {
  const ghLabels = mapLabels(item.labels);
  const labels = ghLabels.length > 0 ? ghLabels : inferTopics(item.title, item.body);
  return {
    number: item.number,
    title: item.title,
    state: item.state,
    htmlUrl: item.html_url,
    createdAt: item.created_at,
    updatedAt: item.updated_at,
    comments: item.comments ?? 0,
    author: item.user?.login ?? "ghost",
    labels,
    body: (item.body ?? "").slice(0, 12000),
  };
}

function mapPull(item) {
  const ghLabels = mapLabels(item.labels);
  const labels = ghLabels.length > 0 ? ghLabels : inferTopics(item.title, item.body);
  return {
    number: item.number,
    title: item.title,
    state: item.state,
    draft: !!item.draft,
    mergedAt: item.merged_at,
    htmlUrl: item.html_url,
    createdAt: item.created_at,
    updatedAt: item.updated_at,
    comments: item.comments ?? 0,
    author: item.user?.login ?? "ghost",
    labels,
    body: (item.body ?? "").slice(0, 12000),
  };
}

function labelSlug(name) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function buildLabelIndex(issues, pulls) {
  const map = new Map();
  for (const issue of issues) {
    for (const label of issue.labels) {
      const slug = label.slug ?? labelSlug(label.name);
      if (!slug) continue;
      if (!map.has(slug)) {
        map.set(slug, { slug, name: label.name, description: label.description ?? "", issues: [], pulls: [] });
      }
      const bucket = map.get(slug);
      if (!bucket.issues.includes(issue.number)) bucket.issues.push(issue.number);
    }
  }
  for (const pr of pulls) {
    for (const label of pr.labels) {
      const slug = label.slug ?? labelSlug(label.name);
      if (!slug) continue;
      if (!map.has(slug)) {
        map.set(slug, { slug, name: label.name, description: label.description ?? "", issues: [], pulls: [] });
      }
      const bucket = map.get(slug);
      if (!bucket.pulls.includes(pr.number)) bucket.pulls.push(pr.number);
    }
  }
  return [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
}

console.log(`Syncing ${REPO} issues & pulls…`);
const rawIssues = await fetchAllPages(`/repos/${owner}/${repo}/issues?state=all`, 30);
const issues = rawIssues.filter((i) => !i.pull_request).map(mapIssue);
const pulls = (await fetchAllPages(`/repos/${owner}/${repo}/pulls?state=all`, 30)).map(mapPull);
const labels = buildLabelIndex(issues, pulls);

mkdirSync(OUT_DIR, { recursive: true });
const payload = {
  syncedAt: new Date().toISOString(),
  repo: `https://github.com/${REPO}`,
  counts: { issues: issues.length, pulls: pulls.length, labels: labels.length },
  issues,
  pulls,
  labels,
};
writeFileSync(join(OUT_DIR, "community.json"), JSON.stringify(payload, null, 2));
console.log(
  `Wrote community.json — ${issues.length} issues, ${pulls.length} PRs, ${labels.length} labels`,
);
