"use client";

import { useMemo, useState } from "react";
import { Link } from "@/i18n/navigation";
import { gpuPath } from "@/lib/routes";

export type GpuRow = {
  id: string;
  slug: string;
  name: string;
  vendor: string;
  arch: string;
  vramGb: number;
  year: number;
  readingTps: number;
  support: "verified" | "supported" | "not-supported";
  evidence: "measured" | "estimated";
};

type Labels = {
  search: string;
  vendor: string;
  arch: string;
  minVram: string;
  support: string;
  sort: string;
  all: string;
  sortVram: string;
  sortSpeed: string;
  sortYear: string;
  sortName: string;
  verified: string;
  supported: string;
  notSupported: string;
  empty: string;
  detect: string;
  detectHint: string;
  detectFound: string;
  detectNone: string;
  badgeMeasured: string;
  badgeEstimated: string;
};

/**
 * Driver-site layout: vendor and architecture down the side, the model list as a filterable
 * table. Filtering happens in the browser so a visitor can narrow 49 cards instantly.
 */
export function GpuExplorer({ gpus, labels }: { gpus: GpuRow[]; labels: Labels }) {
  const [query, setQuery] = useState("");
  const [vendor, setVendor] = useState("");
  const [arch, setArch] = useState("");
  const [minVram, setMinVram] = useState("");
  const [support, setSupport] = useState("");
  const [sort, setSort] = useState<"vram" | "speed" | "year" | "name">("vram");
  const [detected, setDetected] = useState<string | null>(null);
  const [detectFailed, setDetectFailed] = useState(false);

  const vendors = useMemo(() => [...new Set(gpus.map((g) => g.vendor))], [gpus]);
  const arches = useMemo(
    () => [...new Set(gpus.filter((g) => !vendor || g.vendor === vendor).map((g) => g.arch))],
    [gpus, vendor],
  );

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = gpus.filter((gpu) => {
      if (vendor && gpu.vendor !== vendor) return false;
      if (arch && gpu.arch !== arch) return false;
      if (minVram && gpu.vramGb < Number(minVram)) return false;
      if (support && gpu.support !== support) return false;
      if (q && !`${gpu.name} ${gpu.arch} ${gpu.vendor}`.toLowerCase().includes(q)) return false;
      return true;
    });
    const sorted = [...list];
    if (sort === "vram") sorted.sort((a, b) => b.vramGb - a.vramGb || b.readingTps - a.readingTps);
    if (sort === "speed") sorted.sort((a, b) => b.readingTps - a.readingTps);
    if (sort === "year") sorted.sort((a, b) => b.year - a.year || b.vramGb - a.vramGb);
    if (sort === "name") sorted.sort((a, b) => a.name.localeCompare(b.name));
    return sorted;
  }, [gpus, query, vendor, arch, minVram, support, sort]);

  /**
   * WebGL reports a masked renderer string ("ANGLE (NVIDIA, NVIDIA GeForce RTX 4090 ...)"), so the
   * match is a substring test against the catalogue names. It only highlights a row — it never
   * claims the card is verified, because the browser cannot tell us that.
   */
  function detect() {
    setDetectFailed(false);
    setDetected(null);
    try {
      const canvas = document.createElement("canvas");
      const gl = canvas.getContext("webgl2") ?? canvas.getContext("webgl");
      if (!gl) throw new Error("no webgl");
      const ext = gl.getExtension("WEBGL_debug_renderer_info");
      const raw = String(ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER));
      const norm = raw.toLowerCase();
      const hit = gpus.find((gpu) => {
        const tokens = gpu.name.toLowerCase().match(/(rtx|rx|radeon|m\d)\s*\w*/g) ?? [];
        return tokens.some((token) => norm.includes(token.replace(/\s+/g, " ").trim()));
      });
      if (hit) setDetected(hit.slug);
      else setDetectFailed(true);
    } catch {
      setDetectFailed(true);
    }
  }

  return (
    <div className="gpu-explorer">
      <div className="gpu-filters">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={labels.search}
          aria-label={labels.search}
        />
        <select value={vendor} onChange={(e) => { setVendor(e.target.value); setArch(""); }} aria-label={labels.vendor}>
          <option value="">{labels.all} · {labels.vendor}</option>
          {vendors.map((v) => (
            <option key={v} value={v}>{v.toUpperCase()}</option>
          ))}
        </select>
        <select value={arch} onChange={(e) => setArch(e.target.value)} aria-label={labels.arch}>
          <option value="">{labels.all} · {labels.arch}</option>
          {arches.map((a) => (
            <option key={a} value={a}>{a}</option>
          ))}
        </select>
        <select value={minVram} onChange={(e) => setMinVram(e.target.value)} aria-label={labels.minVram}>
          <option value="">{labels.all} · {labels.minVram}</option>
          {[8, 12, 16, 24, 32, 48, 64].map((n) => (
            <option key={n} value={n}>{n}+ GB</option>
          ))}
        </select>
        <select value={support} onChange={(e) => setSupport(e.target.value)} aria-label={labels.support}>
          <option value="">{labels.all} · {labels.support}</option>
          <option value="verified">{labels.verified}</option>
          <option value="supported">{labels.supported}</option>
          <option value="not-supported">{labels.notSupported}</option>
        </select>
        <select value={sort} onChange={(e) => setSort(e.target.value as typeof sort)} aria-label={labels.sort}>
          <option value="vram">{labels.sortVram}</option>
          <option value="speed">{labels.sortSpeed}</option>
          <option value="year">{labels.sortYear}</option>
          <option value="name">{labels.sortName}</option>
        </select>
      </div>

      <div className="gpu-detect">
        <button type="button" className="btn" onClick={detect}>{labels.detect}</button>
        <span className="meta">{labels.detectHint}</span>
        {detectFailed && <span className="meta">{labels.detectNone}</span>}
        {detected && (
          <span className="meta">
            {labels.detectFound}: <Link href={gpuPath(detected)}>{gpus.find((g) => g.slug === detected)?.name}</Link>
          </span>
        )}
      </div>

      {rows.length === 0 ? (
        <p className="meta">{labels.empty}</p>
      ) : (
        <table className="gpu-table">
          <thead>
            <tr>
              <th>GPU</th>
              <th>{labels.arch}</th>
              <th>{labels.sortVram}</th>
              <th>{labels.sortSpeed}</th>
              <th>{labels.support}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((gpu) => (
              <tr key={gpu.id} className={detected === gpu.slug ? "gpu-row-detected" : undefined}>
                <td><Link href={gpuPath(gpu.slug)}>{gpu.name}</Link></td>
                <td>{gpu.arch}</td>
                <td>{gpu.vramGb} GB</td>
                <td>
                  {gpu.readingTps} tok/s{" "}
                  <span className="meta">
                    · {gpu.evidence === "measured" ? labels.badgeMeasured : labels.badgeEstimated}
                  </span>
                </td>
                <td>
                  {gpu.support === "not-supported"
                    ? labels.notSupported
                    : gpu.support === "verified"
                      ? labels.verified
                      : labels.supported}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
