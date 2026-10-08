#!/usr/bin/env node
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const OUT = join(
  dirname(fileURLToPath(import.meta.url)),
  "../apps/www/src/data/downloads.json",
);

const DESKTOP_REPO = process.env.DESKTOP_RELEASE_REPO ?? "Niko1221/Strata";
const DESKTOP_TAG = process.env.DESKTOP_RELEASE_TAG ?? "";

async function latestEngine() {
  const res = await fetch(`https://api.github.com/repos/Niko1221/Strata/releases/latest`, {
    headers: { Accept: "application/vnd.github+json", "User-Agent": "stratat-downloads" },
  });
  if (!res.ok) throw new Error(`engine release ${res.status}`);
  const r = await res.json();
  return {
    tag: r.tag_name,
    url: r.html_url,
    assets: (r.assets ?? []).map((a) => ({
      id: a.name.replace(/\.[^.]+$/, ""),
      name: a.name,
      platform: a.name.includes("windows") ? "windows" : "other",
      variant: a.name.includes("hip")
        ? "amd"
        : a.name.includes("cuda12")
          ? "nvidia-legacy"
          : "nvidia",
      downloadUrl: a.browser_download_url,
      sizeBytes: a.size,
    })),
  };
}

async function desktopLauncher() {
  const repo = process.env.STRATAT_DESKTOP_REPO;
  if (!repo) {
    return {
      tag: null,
      note: "Set STRATAT_DESKTOP_REPO after first GitHub desktop release",
      assets: [],
    };
  }
  const url = DESKTOP_TAG
    ? `https://api.github.com/repos/${repo}/releases/tags/${DESKTOP_TAG}`
    : `https://api.github.com/repos/${repo}/releases/latest`;
  const res = await fetch(url, {
    headers: { Accept: "application/vnd.github+json", "User-Agent": "stratat-downloads" },
  });
  if (!res.ok) return { tag: null, assets: [] };
  const r = await res.json();
  return {
    tag: r.tag_name,
    url: r.html_url,
    assets: (r.assets ?? [])
      .filter((a) => /\.(msi|exe|dmg|app\.tar\.gz|zip)$/i.test(a.name))
      .map((a) => ({
        name: a.name,
        platform: /\.dmg|app\.tar/i.test(a.name) ? "macos" : "windows",
        downloadUrl: a.browser_download_url,
        sizeBytes: a.size,
      })),
  };
}

const engine = await latestEngine();
const desktop = await desktopLauncher();

const payload = {
  syncedAt: new Date().toISOString(),
  siteUrl: "https://www.stratat.com",
  engine,
  desktop,
  macEngine: {
    method: "script",
    cloneUrl: "https://github.com/Niko1221/Strata.git",
    setupCommand: "git clone https://github.com/Niko1221/Strata.git ~/Strata && cd ~/Strata && ./setup.sh",
  },
};

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, JSON.stringify(payload, null, 2));
console.log(`downloads.json engine ${engine.tag} assets ${engine.assets.length} desktop ${desktop.assets?.length ?? 0}`);
