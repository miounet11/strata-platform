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
  return name.replace(/^strata-/, "").replace(/\.zip$/, "");
}

export function engineVariantRank(name: string, variant?: string) {
  const label = engineVariantLabel(name, variant);
  if (label.startsWith("NVIDIA · CUDA 13")) return 0;
  if (label.startsWith("NVIDIA · CUDA 12")) return 1;
  if (label.startsWith("AMD")) return 2;
  return 9;
}
