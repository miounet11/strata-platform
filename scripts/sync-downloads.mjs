#!/usr/bin/env node
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const OUT = join(
  dirname(fileURLToPath(import.meta.url)),
  "../apps/www/src/data/downloads.json",
);

// Our own client builds, published by .github/workflows/desktop-build.yml.
const DESKTOP_REPO = process.env.DESKTOP_RELEASE_REPO ?? "miounet11/strata-platform";
const DESKTOP_TAG = process.env.DESKTOP_RELEASE_TAG ?? "";

/** A file a person can actually install. Everything else is release plumbing. */
function isInstaller(name) {
  return /\.(exe|msi|dmg|AppImage|deb|rpm|tar\.gz|zip)$/i.test(name);
}

function assetPlatform(name) {
  if (/windows/i.test(name)) return "windows";
  if (/linux/i.test(name)) return "linux";
  if (/mac|darwin|\.dmg/i.test(name)) return "macos";
  return "other";
}

function assetVariant(name) {
  if (/hip|rx7900|rx9070|strixhalo|rdna3|halo/i.test(name)) return "amd";
  if (/cuda12/i.test(name)) return "nvidia-legacy";
  if (/cuda13|cuda/i.test(name)) return "nvidia";
  if (/metal/i.test(name)) return "apple";
  return "other";
}

async function latestEngine() {
  const res = await fetch(`https://api.github.com/repos/Niko1221/Strata/releases/latest`, {
    headers: { Accept: "application/vnd.github+json", "User-Agent": "stratat-downloads" },
  });
  if (!res.ok) throw new Error(`engine release ${res.status}`);
  const r = await res.json();
  return {
    tag: r.tag_name,
    url: r.html_url,
    // Only installable artifacts belong on the page: `install.sh`, `latest.json`,
    // `SHA256SUMS.txt` and the feed files are plumbing, not downloads.
    assets: (r.assets ?? [])
      .filter((a) => isInstaller(a.name))
      .map((a) => ({
        id: a.name.replace(/\.[^.]+$/, ""),
        name: a.name,
        platform: assetPlatform(a.name),
        variant: assetVariant(a.name),
        downloadUrl: a.browser_download_url,
        sizeBytes: a.size,
      })),
  };
}

async function desktopLauncher() {
  const url = DESKTOP_TAG
    ? `https://api.github.com/repos/${DESKTOP_REPO}/releases/tags/${DESKTOP_TAG}`
    : `https://api.github.com/repos/${DESKTOP_REPO}/releases/latest`;
  const res = await fetch(url, {
    headers: { Accept: "application/vnd.github+json", "User-Agent": "stratat-downloads" },
  });
  if (!res.ok) {
    return {
      tag: null,
      repo: DESKTOP_REPO,
      note: `No Stratat desktop release yet in ${DESKTOP_REPO}`,
      assets: [],
    };
  }
  const r = await res.json();
  return {
    tag: r.tag_name,
    url: r.html_url,
    repo: DESKTOP_REPO,
    assets: (r.assets ?? [])
      .filter((a) => /\.(msi|exe|dmg|app\.tar\.gz|AppImage|zip)$/i.test(a.name))
      .map((a) => ({
        name: a.name,
        platform: /\.dmg|app\.tar/i.test(a.name)
          ? "macos"
          : /AppImage|\.deb|\.rpm/i.test(a.name)
            ? "linux"
            : "windows",
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
