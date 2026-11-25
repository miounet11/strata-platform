"use client";

import { useMemo, useState } from "react";
import { Link } from "@/i18n/navigation";

export type BuildExplorerRow = {
  slug: string;
  tier: string;
  vendor: string;
  gpuModel: string;
  gpuCount: number;
  totalVramGb: number;
  systemRamGb: number;
  writingToks: number;
  readingToks: number;
  loadWatts: number;
  noiseDbA: number;
  totalPriceUsd: number;
  localCostPerMM: number | null;
  breakEvenDays: number | null;
  recommendedQuant: string;
  title: string;
  tagline: string;
};

export type BuildExplorerLabels = {
  search: string;
  searchPlaceholder: string;
  tier: string;
  vendor: string;
  minVram: string;
  maxBudget: string;
  sort: string;
  all: string;
  tiers: Record<string, string>;
  vendors: Record<string, string>;
  anyBudget: string;
  sortCost: string;
  sortSpeed: string;
  sortPrice: string;
  sortVram: string;
  sortPower: string;
  compare: string;
  compareHint: string;
  compareLimit: string;
  clearCompare: string;
  empty: string;
  price: string;
  vram: string;
  systemRam: string;
  write: string;
  read: string;
  watts: string;
  noise: string;
  costPerM: string;
  breakEven: string;
  quant: string;
  view: string;
  days: string;
  na: string;
};

const TIER_ORDER = ["budget", "sweet-spot", "dual-gpu", "workstation", "compact-unified", "flagship"] as const;
const VENDOR_ORDER = ["nvidia", "amd", "apple"] as const;
const VRAM_FLOORS = [0, 16, 24, 32, 48, 96] as const;
const BUDGET_CAPS = [0, 2500, 4000, 6500] as const;

type SortKey = "cost" | "speed" | "price" | "vram" | "power";

function money(value: number): string {
  return `$${value.toLocaleString("en-US")}`;
}

function costKey(row: BuildExplorerRow): number {
  return row.localCostPerMM ?? Number.POSITIVE_INFINITY;
}

function sortRows(list: BuildExplorerRow[], by: SortKey): BuildExplorerRow[] {
  const out = list.slice();
  const tie = (a: BuildExplorerRow, b: BuildExplorerRow) => a.slug.localeCompare(b.slug);
  out.sort((a, b) => {
    switch (by) {
      case "speed":
        return b.writingToks - a.writingToks || b.readingToks - a.readingToks || tie(a, b);
      case "price":
        return a.totalPriceUsd - b.totalPriceUsd || tie(a, b);
      case "vram":
        return b.totalVramGb - a.totalVramGb || a.totalPriceUsd - b.totalPriceUsd || tie(a, b);
      case "power":
        return a.loadWatts - b.loadWatts || tie(a, b);
      case "cost":
      default:
        return costKey(a) - costKey(b) || a.totalPriceUsd - b.totalPriceUsd || tie(a, b);
    }
  });
  return out;
}

function formatMaybe(value: number | null, na: string, digits = 3): string {
  if (value == null) return na;
  return value.toLocaleString("en-US", { maximumFractionDigits: digits });
}

/**
 * Client explorer for `/[locale]/builds`. Rows are compact summaries passed from the server
 * so the full seven-locale catalogue stays out of the browser bundle.
 */
export function BuildExplorer({ builds, labels }: { builds: BuildExplorerRow[]; labels: BuildExplorerLabels }) {
  const [query, setQuery] = useState("");
  const [tier, setTier] = useState("all");
  const [vendor, setVendor] = useState("all");
  const [minVram, setMinVram] = useState(0);
  const [maxPrice, setMaxPrice] = useState(0);
  const [sort, setSort] = useState<SortKey>("cost");
  const [selected, setSelected] = useState<string[]>([]);
  const [limitHit, setLimitHit] = useState(false);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = builds.filter((row) => {
      if (tier !== "all" && row.tier !== tier) return false;
      if (vendor !== "all" && row.vendor !== vendor) return false;
      if (minVram > 0 && row.totalVramGb < minVram) return false;
      if (maxPrice > 0 && row.totalPriceUsd > maxPrice) return false;
      if (!q) return true;
      const hay = `${row.title} ${row.tagline} ${row.gpuModel} ${row.tier} ${row.vendor} ${row.slug}`.toLowerCase();
      return hay.includes(q);
    });
    return sortRows(filtered, sort);
  }, [builds, query, tier, vendor, minVram, maxPrice, sort]);

  const selectedRows = selected
    .map((slug) => builds.find((row) => row.slug === slug))
    .filter((row): row is BuildExplorerRow => row != null);

  function toggle(slug: string) {
    if (selected.includes(slug)) {
      setSelected(selected.filter((item) => item !== slug));
      setLimitHit(false);
      return;
    }
    if (selected.length >= 3) {
      setLimitHit(true);
      return;
    }
    setLimitHit(false);
    setSelected([...selected, slug]);
  }

  const metrics: { key: string; label: string; cell: (row: BuildExplorerRow) => string }[] = [
    { key: "price", label: labels.price, cell: (row) => money(row.totalPriceUsd) },
    { key: "vram", label: labels.vram, cell: (row) => `${row.totalVramGb} GB` },
    { key: "ram", label: labels.systemRam, cell: (row) => `${row.systemRamGb} GB` },
    { key: "write", label: labels.write, cell: (row) => `${row.writingToks}` },
    { key: "read", label: labels.read, cell: (row) => `${row.readingToks}` },
    { key: "watts", label: labels.watts, cell: (row) => `${row.loadWatts} W` },
    { key: "noise", label: labels.noise, cell: (row) => `${row.noiseDbA} dBA` },
    { key: "cost", label: labels.costPerM, cell: (row) => formatMaybe(row.localCostPerMM, labels.na) },
    {
      key: "days",
      label: labels.breakEven,
      cell: (row) => (row.breakEvenDays == null ? labels.na : `${row.breakEvenDays} ${labels.days}`),
    },
    { key: "quant", label: labels.quant, cell: (row) => row.recommendedQuant },
  ];

  return (
    <div className="build-explorer">
      <div className="build-controls">
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={labels.searchPlaceholder}
          aria-label={labels.search}
        />
        <div className="row build-filter-row" role="group" aria-label={labels.tier}>
          <button type="button" className="pill" aria-pressed={tier === "all"} onClick={() => setTier("all")}>
            {labels.all}
          </button>
          {TIER_ORDER.map((item) => (
            <button
              key={item}
              type="button"
              className="pill"
              aria-pressed={tier === item}
              onClick={() => setTier(item)}
            >
              {labels.tiers[item] ?? item}
            </button>
          ))}
        </div>
        <div className="row build-filter-row" role="group" aria-label={labels.vendor}>
          <button type="button" className="pill" aria-pressed={vendor === "all"} onClick={() => setVendor("all")}>
            {labels.all}
          </button>
          {VENDOR_ORDER.map((item) => (
            <button
              key={item}
              type="button"
              className="pill"
              aria-pressed={vendor === item}
              onClick={() => setVendor(item)}
            >
              {labels.vendors[item] ?? item}
            </button>
          ))}
        </div>
        <label className="meta">
          {labels.minVram}
          <select
            value={minVram}
            aria-label={labels.minVram}
            onChange={(event) => setMinVram(Number(event.target.value))}
          >
            {VRAM_FLOORS.map((floor) => (
              <option key={floor} value={floor}>
                {floor === 0 ? labels.all : `${floor}+ GB`}
              </option>
            ))}
          </select>
        </label>
        <label className="meta">
          {labels.maxBudget}
          <select
            value={maxPrice}
            aria-label={labels.maxBudget}
            onChange={(event) => setMaxPrice(Number(event.target.value))}
          >
            {BUDGET_CAPS.map((cap) => (
              <option key={cap} value={cap}>
                {cap === 0 ? labels.anyBudget : money(cap)}
              </option>
            ))}
          </select>
        </label>
        <label className="meta">
          {labels.sort}
          <select value={sort} aria-label={labels.sort} onChange={(event) => setSort(event.target.value as SortKey)}>
            <option value="cost">{labels.sortCost}</option>
            <option value="speed">{labels.sortSpeed}</option>
            <option value="price">{labels.sortPrice}</option>
            <option value="vram">{labels.sortVram}</option>
            <option value="power">{labels.sortPower}</option>
          </select>
        </label>
      </div>

      {rows.length === 0 ? (
        <p className="meta">{labels.empty}</p>
      ) : (
        <div className="build-grid">
          {rows.map((row) => {
            const checked = selected.includes(row.slug);
            return (
              <article key={row.slug} className="card build-card">
                <div className="row">
                  <span className="badge">{labels.tiers[row.tier] ?? row.tier}</span>
                  <span className="pill">{labels.vendors[row.vendor] ?? row.vendor}</span>
                  <span className="meta">{row.gpuCount}× · {row.totalVramGb} GB</span>
                </div>
                <h3>
                  <Link href={`/builds/${row.slug}`}>{row.title}</Link>
                </h3>
                <p>{row.tagline}</p>
                <p className="meta">
                  {row.gpuModel} · {row.writingToks} tok/s · {money(row.totalPriceUsd)}
                </p>
                <label className="meta">
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggle(row.slug)}
                  />{" "}
                  {labels.compare}
                </label>
              </article>
            );
          })}
        </div>
      )}

      {selectedRows.length > 0 && (
        <div className="build-compare-tray card">
          <div className="row">
            <strong>{labels.compare}</strong>
            <span className="meta">{labels.compareHint}</span>
            <button
              type="button"
              className="pill"
              onClick={() => {
                setSelected([]);
                setLimitHit(false);
              }}
            >
              {labels.clearCompare}
            </button>
          </div>
          {limitHit && <p className="meta">{labels.compareLimit}</p>}
          <table>
            <thead>
              <tr>
                <th />
                {selectedRows.map((row) => (
                  <th key={row.slug}>
                    <Link href={`/builds/${row.slug}`}>{row.title}</Link>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {metrics.map((metric) => (
                <tr key={metric.key}>
                  <th scope="row">{metric.label}</th>
                  {selectedRows.map((row) => (
                    <td key={row.slug}>{metric.cell(row)}</td>
                  ))}
                </tr>
              ))}
              <tr>
                <th scope="row" />
                {selectedRows.map((row) => (
                  <td key={row.slug}>
                    <Link href={`/builds/${row.slug}`}>{labels.view}</Link>
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
