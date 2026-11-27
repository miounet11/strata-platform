/** Locale-neutral, deterministic formatting helpers for every tool surface. */

export function clamp(value: number, min: number, max: number, fallback = min): number {
  const low = Math.min(min, max);
  const high = Math.max(min, max);
  if (typeof value !== "number" || Number.isNaN(value)) {
    return typeof fallback === "number" && Number.isFinite(fallback)
      ? clamp(fallback, low, high, low)
      : low;
  }
  if (value === Number.POSITIVE_INFINITY) return high;
  if (value === Number.NEGATIVE_INFINITY) return low;
  if (value < low) return low;
  if (value > high) return high;
  return value;
}

function finite(value: number | null | undefined): number {
  if (value == null || typeof value !== "number" || !Number.isFinite(value)) return 0;
  return value;
}

function fixed(value: number | null | undefined, digits: number): string {
  return finite(value).toFixed(digits);
}

function grouping(value: number): string {
  const abs = Math.abs(value);
  if (abs < 1000) return fixed(value, 0);
  const rounded = Math.round(finite(value));
  const sign = rounded < 0 ? "-" : "";
  const digits = String(Math.abs(rounded));
  let out = "";
  for (let i = 0; i < digits.length; i += 1) {
    if (i > 0 && (digits.length - i) % 3 === 0) out += ",";
    out += digits[i];
  }
  return sign + out;
}

/** Integer with deterministic thousands separators. Null/NaN/Infinity → "0". */
export function fmtNum(value: number | null | undefined): string {
  return grouping(finite(value));
}

/** One-decimal number with thousands separators. */
export function fmtDecimal(value: number | null | undefined, digits = 1): string {
  const d = clamp(Math.trunc(finite(digits)), 0, 6, 1);
  const n = finite(value);
  const [whole, fraction] = fixed(n, d).split(".");
  return `${grouping(Number(whole))}${fraction ? `.${fraction}` : ""}`;
}

/** USD amount with two decimals and a dollar sign. */
export function fmtUsd(value: number | null | undefined, digits = 2): string {
  const d = clamp(Math.trunc(finite(digits)), 0, 6, 2);
  return `$${fmtDecimal(value, d)}`;
}

/** Capacity in gigabytes. */
export function fmtGb(value: number | null | undefined, digits = 0): string {
  return `${fmtDecimal(value, digits)} GB`;
}

/** Throughput in tokens per second. */
export function fmtTps(value: number | null | undefined, digits = 1): string {
  return `${fmtDecimal(value, digits)} tok/s`;
}

/** Power draw in watts. */
export function fmtWatts(value: number | null | undefined, digits = 0): string {
  return `${fmtDecimal(value, digits)} W`;
}

/** Percentage from a 0–100 value. */
export function fmtPct(value: number | null | undefined, digits = 1): string {
  return `${fmtDecimal(value, digits)}%`;
}
