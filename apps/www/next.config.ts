import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";
import path from "node:path";
import { fileURLToPath } from "node:url";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "../..");

const nextConfig: NextConfig = {
  output: "standalone",
  // Deploys build into a staging directory and swap it in, so the running process never serves
  // from a partially rewritten tree. Must match NEXT_DIST_DIR in scripts/copy-standalone-assets.mjs.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  outputFileTracingRoot: root,
  poweredByHeader: false,
  experimental: {
    // Next sizes the build worker pool from `nproc - 1` (9 on the 10-core production box), and
    // every worker carries its own V8 heap. That default is what exhausted the 8 GB host and got
    // the build OOM-killed repeatedly on 2026-10-30. `cpus` is the only knob Next 15.5 actually
    // reads for this (see getNumberOfWorkers in dist/build/index.js); unset keeps the default so
    // local dev is unaffected.
    ...(process.env.NEXT_BUILD_CPUS ? { cpus: Number(process.env.NEXT_BUILD_CPUS) } : {}),
  },
  async redirects() {
    return [
      { source: "/vps", destination: "/en/vps", permanent: true },
      { source: "/vps/", destination: "/en/vps", permanent: true },
      {
        source: "/:path*",
        has: [{ type: "host", value: "stratat.com" }],
        destination: "https://www.stratat.com/:path*",
        permanent: true,
      },
      {
        source: "/:path*",
        has: [{ type: "host", value: "strata.com" }],
        destination: "https://www.stratat.com/:path*",
        permanent: true,
      },
    ];
  },
};

export default withNextIntl(nextConfig);
