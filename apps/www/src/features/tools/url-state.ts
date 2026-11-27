/**
 * Deterministic URL query encode/decode shared by SSR and CSR.
 * No browser or Node globals; plain string/number/boolean/enum values only.
 */

export type UrlValue = string | number | boolean;
export type UrlParams = Record<string, UrlValue | null | undefined>;
export type UrlSchema = Record<string, UrlParamSpec>;

export type UrlParamSpec = {
  kind: "string" | "number" | "boolean" | "enum";
  default: UrlValue;
  /** Inclusive bounds; enforced after parsing finite numbers. */
  min?: number;
  max?: number;
  /** Allowed values for `kind: "enum"`. */
  values?: readonly string[];
  /** Optional key alias used in the query string (defaults to the schema key). */
  alias?: string;
};

export type UrlState<S extends UrlSchema> = {
  [K in keyof S]: S[K]["kind"] extends "number"
    ? number
    : S[K]["kind"] extends "boolean"
      ? boolean
      : S[K]["kind"] extends "enum"
        ? string
        : string;
};

function finite(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function normalizeString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function decodeNumber(raw: string | null, spec: UrlParamSpec): number {
  const fallback = finite(spec.default, 0);
  if (raw == null || raw.trim() === "") return fallback;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return fallback;
  const min = finite(spec.min, Number.NEGATIVE_INFINITY);
  const max = finite(spec.max, Number.POSITIVE_INFINITY);
  if (parsed < min) return min;
  if (parsed > max) return max;
  return parsed;
}

function decodeBoolean(raw: string | null, spec: UrlParamSpec): boolean {
  const fallback = typeof spec.default === "boolean" ? spec.default : false;
  if (raw == null) return fallback;
  const value = raw.trim().toLowerCase();
  if (value === "1" || value === "true" || value === "yes" || value === "on") return true;
  if (value === "0" || value === "false" || value === "no" || value === "off") return false;
  return fallback;
}

function decodeEnum(raw: string | null, spec: UrlParamSpec): string {
  const fallback = normalizeString(spec.default);
  const values = Array.isArray(spec.values) ? spec.values : [];
  if (values.length === 0) return fallback;
  if (raw == null) return values.includes(fallback) ? fallback : values[0] ?? "";
  return values.includes(raw) ? raw : values.includes(fallback) ? fallback : values[0] ?? "";
}

export function decodeQuery<S extends UrlSchema>(search: string, schema: S): UrlState<S> {
  let incoming: URLSearchParams;
  try {
    incoming = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  } catch {
    incoming = new URLSearchParams();
  }

  const out: Record<string, UrlValue> = {};
  const aliases = new Map<string, string>();
  for (const [key, spec] of Object.entries(schema)) aliases.set(spec.alias ?? key, key);

  for (const [alias, key] of aliases) {
    const spec = schema[key];
    if (!spec) continue;
    const raw = incoming.get(alias);
    switch (spec.kind) {
      case "number":
        out[key] = decodeNumber(raw, spec);
        break;
      case "boolean":
        out[key] = decodeBoolean(raw, spec);
        break;
      case "enum":
        out[key] = decodeEnum(raw, spec);
        break;
      case "string":
      default:
        out[key] = raw == null ? normalizeString(spec.default) : raw;
        break;
    }
  }
  return out as UrlState<S>;
}

/** Encode only values that differ from the schema default; stable key order. */
export function encodeQuery<S extends UrlSchema>(params: UrlParams, schema: S): string {
  const parts: string[] = [];
  for (const [key, spec] of Object.entries(schema)) {
    const alias = spec.alias ?? key;
    const raw = params[key];
    if (raw == null) continue;
    let encoded: string | null = null;
    switch (spec.kind) {
      case "number": {
        const value = decodeNumber(typeof raw === "number" ? String(raw) : normalizeString(raw), spec);
        encoded = value === finite(spec.default, 0) ? null : String(value);
        break;
      }
      case "boolean": {
        const value = decodeBoolean(typeof raw === "boolean" ? (raw ? "true" : "false") : normalizeString(raw), spec);
        const fallback = typeof spec.default === "boolean" ? spec.default : false;
        encoded = value === fallback ? null : value ? "1" : "0";
        break;
      }
      case "enum": {
        const value = decodeEnum(typeof raw === "string" ? raw : normalizeString(raw), spec);
        encoded = value === normalizeString(spec.default) ? null : value;
        break;
      }
      case "string":
      default: {
        const value = normalizeString(raw);
        encoded = value === normalizeString(spec.default) ? null : value;
        break;
      }
    }
    if (encoded != null) parts.push(`${encodeURIComponent(alias)}=${encodeURIComponent(encoded)}`);
  }
  return parts.length ? `?${parts.join("&")}` : "";
}

/**
 * Client-only URL synchronization helper. Kept here (not in a pure module) so
 * `node --test` never has to touch `window`.
 */
export function syncUrlState<S extends UrlSchema>(search: string, schema: S, replace = true): UrlState<S> {
  const state = decodeQuery(search, schema);
  if (typeof window !== "undefined") {
    const query = encodeQuery(state as unknown as UrlParams, schema);
    const next = `${window.location.pathname}${query}${window.location.hash}`;
    if (next !== `${window.location.pathname}${window.location.search}${window.location.hash}`) {
      if (replace) window.history.replaceState(window.history.state, "", next);
      else window.history.pushState(window.history.state, "", next);
    }
  }
  return state;
}
