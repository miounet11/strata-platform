import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const cache = new Map<string, { mtimeMs: number; data: unknown }>();

/**
 * Prefer the on-disk corpus so a content sync shows up without a full rebuild.
 * STRATAT_DATA_DIR points at apps/www/src/data on the VPS. Dev falls back to cwd.
 */
export function readDataJson<T>(name: string, fallback: T): T {
  const roots = [
    process.env.STRATAT_DATA_DIR,
    join(process.cwd(), "src/data"),
    join(process.cwd(), "apps/www/src/data"),
  ].filter((root): root is string => Boolean(root));
  for (const root of roots) {
    const file = join(root, name);
    if (!existsSync(file)) continue;
    try {
      const mtimeMs = statSync(file).mtimeMs;
      const hit = cache.get(file);
      if (hit && hit.mtimeMs === mtimeMs) return hit.data as T;
      const data = JSON.parse(readFileSync(file, "utf8")) as T;
      cache.set(file, { mtimeMs, data });
      return data;
    } catch {
      /* try the next root, then the build-time copy */
    }
  }
  return fallback;
}
