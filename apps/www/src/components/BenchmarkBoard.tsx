"use client";

import { useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import {
  computeEconomics,
  defaultWorkload,
  getBenchmarks,
  getRig,
  getRigs,
  type BenchmarkRig,
  type Economics,
  type Workload,
} from "@/lib/benchmarks";

type SortKey =
  | "catalog"
  | "memory"
  | "reading"
  | "writing"
  | "power"
  | "rig"
  | "capacity"
  | "local"
  | "energy"
  | "api"
  | "breakEven";

const catalogIndex = new Map(getRigs().map((rig, index) => [rig.id, index]));

export function BenchmarkBoard({ focusId }: { focusId?: string }) {
  const t = useTranslations("benchmarks");
  const locale = useLocale();
  const data = getBenchmarks();
  const focus = focusId ? getRig(focusId) : undefined;
  const [workload, setWorkload] = useState<Workload>(defaultWorkload);
  const [sortKey, setSortKey] = useState<SortKey>("catalog");
  const [sortAsc, setSortAsc] = useState(true);
  const [selectedId, setSelectedId] = useState(focus?.id ?? data.rigs[0]?.id ?? "");

  const rows = useMemo(() => {
    const list = focus ? [focus] : data.rigs;
    const scored = list.map((rig) => ({ rig, econ: computeEconomics(rig, workload) }));
    if (focus) return scored;
    const dir = sortAsc ? 1 : -1;
    return scored.sort((a, b) => dir * compareRows(a, b, sortKey));
  }, [data.rigs, focus, sortAsc, sortKey, workload]);

  const selected = rows.find((row) => row.rig.id === selectedId) ?? rows[0];

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortAsc((v) => !v);
    else {
      setSortKey(key);
      setSortAsc(key === "local" || key === "breakEven" || key === "energy");
    }
  }

  return (
    <div>
      <div className="bench-controls">
        <p style={{ fontWeight: 600, margin: 0, gridColumn: "1 / -1" }}>{t("workload")}</p>
        <label>
          <span>
            {t("reading")} <strong>{Math.round(workload.readingShare * 100)}%</strong>
            {" · "}
            {t("writing")} <strong>{Math.round((1 - workload.readingShare) * 100)}%</strong>
          </span>
          <input
            type="range"
            min={0}
            max={100}
            value={Math.round(workload.readingShare * 100)}
            onChange={(e) =>
              setWorkload({ ...workload, readingShare: Number(e.target.value) / 100 })
            }
          />
        </label>
        <label>
          <span>
            {t("dailyRuntime")}{" "}
            <strong>
              {workload.activeHours} {t("hoursUnit")}
            </strong>
          </span>
          <input
            type="range"
            min={1}
            max={24}
            value={workload.activeHours}
            onChange={(e) => setWorkload({ ...workload, activeHours: Number(e.target.value) })}
          />
        </label>
        <label>
          {t("electricity")} ({t("perKwh")})
          <input
            type="number"
            min={0}
            step={0.01}
            value={workload.electricityPerKwh}
            onChange={(e) =>
              setWorkload({ ...workload, electricityPerKwh: Number(e.target.value) })
            }
          />
        </label>
        <label>
          {t("hardwareLife")} ({t("years")})
          <input
            type="number"
            min={1}
            max={10}
            step={1}
            value={workload.hardwareLifeYears}
            onChange={(e) =>
              setWorkload({ ...workload, hardwareLifeYears: Number(e.target.value) })
            }
          />
        </label>
        <label>
          {t("apiReading")} ({t("perMM")})
          <input
            type="number"
            min={0}
            step={0.01}
            value={workload.apiReadingPerMM}
            onChange={(e) =>
              setWorkload({ ...workload, apiReadingPerMM: Number(e.target.value) })
            }
          />
        </label>
        <label>
          {t("apiWriting")} ({t("perMM")})
          <input
            type="number"
            min={0}
            step={0.01}
            value={workload.apiWritingPerMM}
            onChange={(e) =>
              setWorkload({ ...workload, apiWritingPerMM: Number(e.target.value) })
            }
          />
        </label>
        <div>
          <button type="button" className="btn" onClick={() => setWorkload(defaultWorkload())}>
            {t("reset")}
          </button>
        </div>
      </div>

      {!focus && (
        <p style={{ color: "var(--muted)", marginTop: 0 }}>
          {t("listed", { count: data.rigs.length })}
          {" · "}
          {t("dualNote")}
        </p>
      )}

      <div className="table-scroll">
        <table className="table">
          <thead>
            <tr>
              <th>
                <SortButton label={t("colHardware")} active={sortKey === "catalog"} onClick={() => toggleSort("catalog")} />
              </th>
              <Th label={t("colMemory")} k="memory" sortKey={sortKey} onSort={toggleSort} />
              <Th label={t("colReading")} k="reading" sortKey={sortKey} onSort={toggleSort} />
              <Th label={t("colWriting")} k="writing" sortKey={sortKey} onSort={toggleSort} />
              <th>{t("colFit")}</th>
              <Th label={t("colPower")} k="power" sortKey={sortKey} onSort={toggleSort} />
              <Th label={t("colRig")} k="rig" sortKey={sortKey} onSort={toggleSort} />
              <Th label={t("colCapacity")} k="capacity" sortKey={sortKey} onSort={toggleSort} />
              <Th label={t("colLocal")} k="local" sortKey={sortKey} onSort={toggleSort} />
              <Th label={t("colEnergy")} k="energy" sortKey={sortKey} onSort={toggleSort} />
              <Th label={t("colApi")} k="api" sortKey={sortKey} onSort={toggleSort} />
              <Th label={t("colBreakEven")} k="breakEven" sortKey={sortKey} onSort={toggleSort} />
              <th>{t("colEvidence")}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ rig, econ }) => (
              <tr
                key={rig.id}
                className={rig.id === selected?.rig.id ? "is-selected" : undefined}
                onClick={() => setSelectedId(rig.id)}
              >
                <td>
                  <Link href={`/benchmarks/${rig.id}`}>
                    <strong>{rig.name}</strong>
                  </Link>
                  <div style={{ color: "var(--muted)", fontSize: "0.8rem" }}>{rig.form}</div>
                </td>
                <td className="num">{rig.memory} GB</td>
                <td className="num">{approx(rig, formatTok(rig.readingToks, locale))}</td>
                <td className="num">{approx(rig, formatTok(rig.writingToks, locale))}</td>
                <td>{rig.fit === "Tight" ? t("fitTight") : t("fitGood")}</td>
                <td className="num">
                  {approx(rig, String(rig.powerWatts))} W
                </td>
                <td className="num">{usd(rig.rigTotal, 0, locale)}</td>
                <td className="num">{num(econ.capacityMTokDay, 1, locale)}</td>
                <td className="num">{usd(econ.localCostPerMM, 3, locale)}</td>
                <td className="num">{usd(econ.energyPerDay, 2, locale)}</td>
                <td className="num">{usd(econ.apiValuePerDay, 2, locale)}</td>
                <td className="num">
                  {econ.breakEvenDays == null ? "—" : `${num(econ.breakEvenDays, 0, locale)} ${t("daysShort")}`}
                </td>
                <td>
                  {rig.evidence === "estimate" ? (
                    <span className="badge">{t("evidenceEstimate")}</span>
                  ) : (
                    <a href={rig.evidenceUrl} rel="noopener noreferrer">
                      {t("evidenceMedian")}
                    </a>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {selected && (
        <section className="card" style={{ marginTop: "1.25rem" }}>
          <p style={{ color: "var(--muted)", margin: 0 }}>{t("selected")}</p>
          <h2 style={{ margin: "0.2rem 0 0.4rem" }}>{selected.rig.name}</h2>
          <p style={{ color: "var(--muted)", marginTop: 0 }}>
            {selected.rig.memory} GB · {selected.rig.form}
            {selected.rig.note ? ` · ${selected.rig.note}` : ""}
          </p>
          <div className="stat-row">
            <Stat label={t("colReading")} value={approx(selected.rig, formatTok(selected.rig.readingToks, locale))} />
            <Stat label={t("colWriting")} value={approx(selected.rig, formatTok(selected.rig.writingToks, locale))} />
            <Stat label={t("colPower")} value={`${approx(selected.rig, String(selected.rig.powerWatts))} W`} />
            <Stat label={t("colCapacity")} value={num(selected.econ.capacityMTokDay, 1, locale)} />
            <Stat label={t("colLocal")} value={usd(selected.econ.localCostPerMM, 3, locale)} />
            <Stat label={t("colEnergy")} value={usd(selected.econ.energyPerDay, 2, locale)} />
            <Stat label={t("colApi")} value={usd(selected.econ.apiValuePerDay, 2, locale)} />
            <Stat
              label={t("colBreakEven")}
              value={
                selected.econ.breakEvenDays == null
                  ? "—"
                  : `${num(selected.econ.breakEvenDays, 0, locale)} ${t("daysShort")}`
              }
            />
          </div>
          <p>
            <Link href={`/benchmarks/${selected.rig.id}`}>{t("viewDetail")}</Link>
            {" · "}
            <a href={selected.rig.evidenceUrl} rel="noopener noreferrer">
              {t("evidenceLink")}
            </a>
            {selected.rig.rigTotal == null ? ` · ${t("pending")}` : ""}
          </p>
        </section>
      )}
    </div>
  );
}

function Th({
  label,
  k,
  sortKey,
  onSort,
}: {
  label: string;
  k: SortKey;
  sortKey: SortKey;
  onSort: (key: SortKey) => void;
}) {
  return (
    <th className="num">
      <SortButton label={label} active={sortKey === k} onClick={() => onSort(k)} />
    </th>
  );
}

function SortButton({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button type="button" className="sort-btn" onClick={onClick} aria-pressed={active}>
      {label}
      {active ? " •" : ""}
    </button>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div style={{ color: "var(--muted)", fontSize: "0.8rem" }}>{label}</div>
      <strong>{value}</strong>
    </div>
  );
}

function compareRows(
  a: { rig: BenchmarkRig; econ: Economics },
  b: { rig: BenchmarkRig; econ: Economics },
  key: SortKey,
): number {
  const value = (row: { rig: BenchmarkRig; econ: Economics }) => {
    switch (key) {
      case "memory":
        return row.rig.memory;
      case "reading":
        return row.rig.readingToks;
      case "writing":
        return row.rig.writingToks;
      case "power":
        return row.rig.powerWatts;
      case "rig":
        return row.rig.rigTotal;
      case "capacity":
        return row.econ.capacityMTokDay;
      case "local":
        return row.econ.localCostPerMM;
      case "energy":
        return row.econ.energyPerDay;
      case "api":
        return row.econ.apiValuePerDay;
      case "breakEven":
        return row.econ.breakEvenDays;
      default:
        return catalogIndex.get(row.rig.id) ?? 0;
    }
  };
  const av = value(a);
  const bv = value(b);
  if (av == null && bv == null) return 0;
  if (av == null) return 1;
  if (bv == null) return -1;
  return av - bv;
}

function approx(rig: BenchmarkRig, text: string) {
  return rig.evidence === "estimate" ? `~${text}` : text;
}

function formatTok(n: number, locale: string) {
  const digits = Number.isInteger(n) ? 0 : 1;
  return num(n, digits, locale);
}

function num(n: number | null, digits: number, locale: string) {
  if (n == null || !Number.isFinite(n)) return "—";
  return n.toLocaleString(locale, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

function usd(n: number | null, digits: number, locale: string) {
  if (n == null || !Number.isFinite(n)) return "—";
  return `$${num(n, digits, locale)}`;
}
