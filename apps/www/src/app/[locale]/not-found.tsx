import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";

/**
 * A missing page still has to be a way back into the site: a bare 404 is a dead end for a
 * reader and a dead end for a crawler. Every public hub is listed, so an outdated inbound link
 * lands somewhere useful instead of ending the crawl.
 *
 * Rendered on the server. The client version shipped only Next's built-in "This page could not
 * be found" in the HTML — the links arrived after hydration, so a crawler following a stale URL
 * saw no way out of the 404.
 */
export default async function LocaleNotFound() {
  const t = await getTranslations("notFound");
  const nav = await getTranslations("nav");

  const hubs = [
    { href: "/install", label: nav("install") },
    { href: "/download", label: nav("download") },
    { href: "/models", label: nav("models") },
    { href: "/gpus", label: nav("gpus") },
    { href: "/gpus/vendor", label: nav("gpuBrands") },
    { href: "/benchmarks", label: nav("benchmarks") },
    { href: "/guides", label: nav("guides") },
    { href: "/topics", label: nav("topics") },
    { href: "/releases", label: nav("releases") },
    { href: "/community", label: nav("community") },
  ];

  return (
    <div className="container page">
      <h1>{t("title")}</h1>
      <p className="page-intro">{t("body")}</p>
      <ul className="grid-3" style={{ listStyle: "none", padding: 0 }}>
        {hubs.map((hub) => (
          <li key={hub.href} className="card">
            <Link href={hub.href}>
              <strong>{hub.label}</strong>
            </Link>
          </li>
        ))}
      </ul>
      <p>
        <Link href="/">{t("home")}</Link>
      </p>
    </div>
  );
}
