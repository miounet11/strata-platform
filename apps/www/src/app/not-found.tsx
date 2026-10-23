import type { Metadata } from "next";

export const metadata: Metadata = {
  robots: { index: false, follow: true },
};

const HUBS: Array<{ href: string; label: string }> = [
  { href: "/en/install", label: "Install" },
  { href: "/en/download", label: "Download" },
  { href: "/en/models", label: "Models" },
  { href: "/en/gpus", label: "GPUs" },
  { href: "/en/gpus/vendor", label: "GPU brands" },
  { href: "/en/benchmarks", label: "Benchmarks" },
  { href: "/en/guides", label: "Guides" },
  { href: "/en/releases", label: "Releases" },
];

/**
 * The 404 that ships in the static HTML.
 *
 * `[locale]/not-found.tsx` is localized, but Next serves its built-in 404 shell for the initial
 * request and swaps in the localized version only after hydration — so a crawler following a
 * stale URL saw no links at all. This root boundary is what actually lands in the HTML, and it
 * is deliberately plain markup with real anchors: no provider, no client component.
 *
 * English labels and `/en` targets: the root layout has no locale, and a dead end that speaks
 * one language beats a dead end for every language.
 */
export default function RootNotFound() {
  return (
    <html lang="en">
      <body>
        <div className="container page">
          <h1>This page does not exist</h1>
          <p className="page-intro">The link may be outdated. Everything else is one click away.</p>
          <ul className="grid-3" style={{ listStyle: "none", padding: 0 }}>
            {HUBS.map((hub) => (
              <li key={hub.href} className="card">
                <a href={hub.href}>
                  <strong>{hub.label}</strong>
                </a>
              </li>
            ))}
          </ul>
          <p>
            <a href="/en">Back to the start</a>
          </p>
        </div>
      </body>
    </html>
  );
}
