import { readDataJson } from "@/lib/data-file";

export type VpsStock = "in-stock" | "out-of-stock" | "unknown";
export type VpsTier = "primary" | "backup";
export type VpsRouteClass = "cmin2" | "direct-optimized" | "international";

export type Localized = string | Record<string, string>;

export type VpsLastCheck = {
  at: string;
  httpStatus?: number;
  result: string;
  error?: string;
};

export type VpsDeal = {
  id: string;
  vendor: string;
  tier: VpsTier;
  name: Localized;
  url: string;
  affiliateUrl?: string;
  priceUsdPerYear: number;
  cpu: number;
  ram: string;
  disk: string;
  bandwidth: string;
  bandwidthMbps: number;
  traffic: Localized;
  location: Localized;
  route: Localized;
  routeClass: VpsRouteClass;
  testIp?: string;
  renewal: Localized;
  stock: VpsStock;
  stockNote?: Localized;
  lastCheck?: VpsLastCheck;
};

export type VpsFootnote = {
  id: string;
  vendor?: string;
  url?: string;
  affiliateUrl?: string;
  priceUsdPerYear?: number;
  testIp?: string;
  title: Localized;
  body: Localized;
};

export type VpsDealsFile = {
  updatedAt: string;
  source?: string;
  criteria?: {
    budgetUsdPerYear?: number;
    minBandwidthMbps?: number;
    audience?: string;
    focus?: string[];
    budgetNote?: string;
  };
  deals: VpsDeal[];
  footnotes: VpsFootnote[];
};

const EMPTY: VpsDealsFile = { updatedAt: "", deals: [], footnotes: [] };

export function getVpsDeals(): VpsDealsFile {
  const data = readDataJson<VpsDealsFile>("vps-deals.json", EMPTY);
  return {
    updatedAt: data.updatedAt ?? "",
    source: data.source,
    criteria: data.criteria,
    deals: Array.isArray(data.deals) ? data.deals : [],
    footnotes: Array.isArray(data.footnotes) ? data.footnotes : [],
  };
}

export function loc(value: Localized | undefined, locale: string, fallback = ""): string {
  if (value == null) return fallback;
  if (typeof value === "string") return value;
  return value[locale] ?? value.en ?? value.zh ?? Object.values(value)[0] ?? fallback;
}

/** Use an affiliate link when one is configured; otherwise fall back to the official URL. */
export function checkoutUrl(item: { url: string; affiliateUrl?: string }): string {
  const affiliate = item.affiliateUrl?.trim();
  return affiliate || item.url;
}

export function isAffiliate(item: { url: string; affiliateUrl?: string }): boolean {
  const affiliate = item.affiliateUrl?.trim();
  return Boolean(affiliate && affiliate !== item.url);
}

export function formatShanghai(iso: string): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  const parts = new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const pick = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return `${pick("year")}-${pick("month")}-${pick("day")} ${pick("hour")}:${pick("minute")}`;
}

export function stockAvailability(stock: VpsStock): string {
  if (stock === "in-stock") return "https://schema.org/InStock";
  if (stock === "out-of-stock") return "https://schema.org/OutOfStock";
  return "https://schema.org/PreOrder";
}
