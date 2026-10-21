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
  async redirects() {
    return [
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
