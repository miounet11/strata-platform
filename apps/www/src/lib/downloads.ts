import downloadsData from "@/data/downloads.json";
import { readDataJson } from "@/lib/data-file";

export function getDownloads() {
  return readDataJson("downloads.json", downloadsData);
}

export function engineVariantLabel(name: string, variant?: string) {
  const key =
    variant ??
    (name.includes("hip") ? "amd" : name.includes("cuda12") ? "nvidia-legacy" : name.includes("windows-x64") ? "nvidia" : "");
  if (key === "nvidia") return "NVIDIA · CUDA 13";
  if (key === "nvidia-legacy") return "NVIDIA · CUDA 12";
  if (key === "amd") return "AMD · HIP";
  if (key === "apple") return "Apple · Metal";
  return humanizeAsset(name);
}

/** `strata-engine-0.1.46-linux-x86_64-cuda-cuda13.tar.gz` → `Engine · x86_64 · CUDA 13`. */
function humanizeAsset(name: string) {
  const base = name
    .replace(/\.(exe|msi|dmg|AppImage|deb|rpm|zip)$/i, "")
    .replace(/\.tar\.gz$/i, "")
    .replace(/^strata-/i, "")
    .replace(/(^|-)v?\d+(\.\d+)+-?/, "$1")
    .replace(/-windows|-linux|-macos?\b/gi, "")
    .replace(/-arm64\b/gi, "-aarch64");
  if (!base) return name;

  const parts = base.split("-").filter(Boolean);
  const out: string[] = [];
  for (const part of parts) {
    const pretty = PRETTY[part.toLowerCase()] ?? part;
    if (!out.includes(pretty)) out.push(pretty);
  }
  return out.join(" · ");
}

const PRETTY: Record<string, string> = {
  x86_64: "x86_64",
  aarch64: "arm64",
  cuda: "CUDA",
  cuda12: "CUDA 12",
  cuda13: "CUDA 13",
  hip: "HIP",
  metal: "Metal",
  update: "Update",
  control: "Control",
  engine: "Engine",
  arm64: "arm64",
};

export function engineVariantRank(name: string, variant?: string) {
  const label = engineVariantLabel(name, variant);
  if (label.startsWith("NVIDIA · CUDA 13")) return 0;
  if (label.startsWith("NVIDIA · CUDA 12")) return 1;
  if (label.startsWith("AMD")) return 2;
  if (label.startsWith("Apple")) return 3;
  return 9;
}
