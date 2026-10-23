import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { getLiveArticles } from "@/lib/articles";
import { pickRelated } from "@/lib/internal-links";
import { GUIDE_KINDS, guidePath } from "@/lib/routes";

export type RelatedItem = { href: string; title: string; note?: string };

/**
 * Links from a page to the pages a reader would open next.
 *
 * The ordering rules live in `pickRelated` so they can be tested without a build; this wrapper
 * only supplies the candidates. A page never links to itself and no target is listed twice, which
 * keeps a crawler moving through the cluster instead of bouncing between two hubs.
 */
export function relatedArticles(locale: string, slug: string, kind: string, limit = 4): RelatedItem[] {
  return pickRelated(
    getLiveArticles(locale).map((article) => ({
      slug: article.slug,
      kind: article.kind,
      order: article.order,
      title: article.article.title,
    })),
    { slug, kind },
    limit,
    GUIDE_KINDS,
  ).map((pick) => ({ href: guidePath(pick.slug), title: pick.title }));
}

export async function RelatedContent({ title, items }: { title?: string; items: RelatedItem[] }) {
  if (items.length === 0) return null;
  const t = await getTranslations("guides");
  return (
    <section className="section related">
      <h2>{title ?? t("related")}</h2>
      <ul className="guide-list">
        {items.map((item) => (
          <li key={item.href}>
            <Link href={item.href}>{item.title}</Link>
            {item.note ? <p>{item.note}</p> : null}
          </li>
        ))}
      </ul>
    </section>
  );
}
