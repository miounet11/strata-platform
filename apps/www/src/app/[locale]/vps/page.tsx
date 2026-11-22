import { getTranslations, setRequestLocale } from "next-intl/server";
import { jsonLdGraph, nodeId, pageLd } from "@/lib/jsonld";
import { breadcrumbJsonLd } from "@/lib/breadcrumbs";
import { siteEntityNodes } from "@/lib/site-entities";
import { SITE, siteMetadata } from "@/lib/seo";
import {
  checkoutUrl,
  formatShanghai,
  getVpsDeals,
  isAffiliate,
  loc,
  stockAvailability,
  type VpsDeal,
  type VpsFootnote,
} from "@/lib/vps";

export const revalidate = 1800;

const KEYWORDS: Record<string, string[]> = {
  zh: [
    "2026 高性价比 VPS",
    "中国大陆优化 VPS",
    "CN2 GIA",
    "CMIN2",
    "9929",
    "20美元/年 VPS",
    "大带宽 VPS",
    "本地 AI 中转",
    "节点部署",
  ],
  en: [
    "2026 budget VPS",
    "China-optimized VPS",
    "CN2 GIA",
    "CMIN2",
    "9929",
    "$20/year VPS",
    "high-bandwidth VPS",
    "local AI relay",
  ],
};

type Faq = { question: string; answer: string };

/** Flattened, single-locale view of a deal so the RSC payload does not carry all 7 languages. */
type CardDeal = {
  id: string;
  vendor: string;
  tier: string;
  name: string;
  href: string;
  outboundHref: string;
  rel: string;
  affiliate: boolean;
  price: string;
  specs: string;
  bandwidth: string;
  location: string;
  route: string;
  testIp: string;
  renewal: string;
  stock: "in-stock" | "out-of-stock" | "unknown";
  stockNote: string;
  priceLabel: string;
};

type CardNote = {
  id: string;
  title: string;
  body: string;
  testIp: string;
  href: string;
  outboundHref: string;
  rel: string;
};

function linkRel(item: { url: string; affiliateUrl?: string }): string {
  return isAffiliate(item) ? "sponsored noopener noreferrer" : "noopener noreferrer";
}

function localizeDeal(deal: VpsDeal, locale: string): CardDeal {
  return {
    id: deal.id,
    vendor: deal.vendor,
    tier: deal.tier,
    name: loc(deal.name, locale),
    href: checkoutUrl(deal),
    outboundHref: `/go/vps/${deal.id}`,
    rel: linkRel(deal),
    affiliate: isAffiliate(deal),
    price: deal.priceUsdPerYear.toFixed(2),
    specs: `${deal.cpu}C / ${deal.ram} / ${deal.disk}`,
    bandwidth: `${deal.bandwidth} · ${loc(deal.traffic, locale)}`,
    location: loc(deal.location, locale),
    route: loc(deal.route, locale),
    testIp: deal.testIp ?? "",
    renewal: loc(deal.renewal, locale),
    stock: deal.stock,
    stockNote: loc(deal.stockNote, locale),
    priceLabel: `$${deal.priceUsdPerYear.toFixed(2)}`
  };
}

function localizeNote(note: VpsFootnote, locale: string): CardNote {
  const href = note.url ? checkoutUrl({ url: note.url, affiliateUrl: note.affiliateUrl }) : "";
  return {
    id: note.id,
    title: loc(note.title, locale),
    body: loc(note.body, locale),
    testIp: note.testIp ?? "",
    href,
    outboundHref: note.url ? `/go/vps/${note.id}` : "",
    rel: note.url ? linkRel({ url: note.url, affiliateUrl: note.affiliateUrl }) : "",
  };
}

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "seo" });
  const meta = siteMetadata(locale, t("vps.title"), t("vps.description"), "/vps");
  return {
    ...meta,
    keywords: KEYWORDS[locale] ?? KEYWORDS.en,
  };
}

export default async function VpsDealsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("vps");
  const nav = await getTranslations("nav");
  const data = getVpsDeals();
  const pageUrl = `${SITE}/${locale}/vps`;
  const title = t("title");
  const description = t("intro");
  const verified = formatShanghai(data.updatedAt);
  const faqs = (t.raw("faqs") as Faq[]) ?? [];
  const deals = data.deals.map((deal) => {
    const card = localizeDeal(deal, locale);
    card.priceLabel = t("pricePerYear", { price: `${card.price}` });
    card.outboundHref = `/go/vps/${deal.id}`;
    return card;
  });
  const footnotes = data.footnotes.map((note) => localizeNote(note, locale));
  const primary = deals.filter((deal) => deal.tier === "primary");
  const backup = deals.filter((deal) => deal.tier !== "primary");

  const pageNode = {
    ...pageLd(SITE, locale, "/vps", title, { description, type: "CollectionPage" }),
    dateModified: data.updatedAt || undefined,
    mainEntity: { "@id": nodeId(pageUrl, "list") },
  };

  const products = deals.map((deal) => ({
    "@type": "Product",
    "@id": nodeId(pageUrl, `product-${deal.id}`),
    name: deal.name,
    brand: { "@type": "Organization", name: deal.vendor },
    category: "VPS",
    description: deal.route,
    offers: {
      "@type": "Offer",
      "@id": nodeId(pageUrl, `offer-${deal.id}`),
      url: deal.href,
      price: deal.price,
      priceCurrency: "USD",
      availability: stockAvailability(deal.stock),
      itemCondition: "https://schema.org/NewCondition",
      priceSpecification: {
        "@type": "UnitPriceSpecification",
        price: deal.price,
        priceCurrency: "USD",
        unitText: "YEAR",
        billingDuration: "P1Y",
      },
    },
  }));

  const listNode = {
    "@type": "ItemList",
    "@id": nodeId(pageUrl, "list"),
    name: title,
    numberOfItems: deals.length,
    itemListOrder: "https://schema.org/ItemListOrderAscending",
    itemListElement: deals.map((deal, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: deal.name,
      url: deal.href,
      item: { "@id": nodeId(pageUrl, `product-${deal.id}`) },
    })),
  };

  const faqNode = faqs.length
    ? {
        "@type": "FAQPage",
        "@id": nodeId(pageUrl, "faq"),
        mainEntity: faqs.map((faq, index) => ({
          "@type": "Question",
          "@id": nodeId(pageUrl, `faq-${index + 1}`),
          name: faq.question,
          acceptedAnswer: { "@type": "Answer", text: faq.answer },
        })),
      }
    : null;

  const crumbs = breadcrumbJsonLd(SITE, locale, [
    { path: "", name: nav("home") },
    { name: title, id: nodeId(pageUrl, "webpage") },
  ]);

  const labels = {
    cta: t("cta"),
    ctaAffiliate: t("ctaAffiliate"),
    ctaOfficial: t("ctaOfficial"),
    testIp: t("testIp"),
    route: t("route"),
    renewal: t("renewal"),
    stockIn: t("stockIn"),
    stockOut: t("stockOut"),
    stockUnknown: t("stockUnknown"),
    specs: t("specs"),
    bandwidth: t("bandwidth"),
    location: t("location"),
  };

  return (
    <div className="container page vps-page">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(
            jsonLdGraph([
              ...siteEntityNodes(),
              pageNode,
              crumbs,
              listNode,
              ...products,
              faqNode,
            ]),
          ),
        }}
      />

      <h1>{title}</h1>
      <p className="page-intro">{description}</p>
      {verified ? <p className="vps-verified">{t("verifiedAt", { time: verified })}</p> : null}
      <p className="meta">{t("dailyNote")}</p>

      <section className="section">
        <h2>{t("criteriaTitle")}</h2>
        <ul>
          <li>{t("criteriaBudget")}</li>
          <li>{t("criteriaBandwidth")}</li>
          <li>{t("criteriaRoute")}</li>
          <li>{t("criteriaUse")}</li>
        </ul>
      </section>

      <section className="section">
        <h2>{t("dealsTitle")}</h2>
        {primary.length ? (
          <ul className="grid-2 vps-grid">
            {primary.map((deal) => (
              <DealCard key={deal.id} deal={deal} labels={labels} />
            ))}
          </ul>
        ) : (
          <p>{t("noDeals")}</p>
        )}
      </section>

      {backup.length ? (
        <section className="section">
          <h2>{t("backupTitle")}</h2>
          <p className="meta">{t("backupIntro")}</p>
          <ul className="grid-2 vps-grid">
            {backup.map((deal) => (
              <DealCard key={deal.id} deal={deal} labels={labels} />
            ))}
          </ul>
        </section>
      ) : null}

      {footnotes.length ? (
        <section className="section">
          <h2>{t("footnotesTitle")}</h2>
          {footnotes.map((note) => (
            <article key={note.id} className="card vps-footnote">
              <h3>{note.title}</h3>
              <p>{note.body}</p>
              {note.testIp ? (
                <p className="meta">
                  {labels.testIp}: <code>{note.testIp}</code>
                </p>
              ) : null}
              {note.href ? (
                <p>
                  <a href={note.outboundHref || note.href} rel={note.rel} target="_blank">
                    {labels.cta}
                  </a>
                </p>
              ) : null}
            </article>
          ))}
        </section>
      ) : null}

      {faqs.length ? (
        <section className="section" id="faq">
          <h2>{t("faqTitle")}</h2>
          <dl className="vps-faq">
            {faqs.map((faq) => (
              <div key={faq.question}>
                <dt>{faq.question}</dt>
                <dd>{faq.answer}</dd>
              </div>
            ))}
          </dl>
        </section>
      ) : null}

      <section className="section">
        <h2>{t("disclosureTitle")}</h2>
        <p>{t("disclosure")}</p>
      </section>
    </div>
  );
}

function DealCard({
  deal,
  labels,
}: {
  deal: CardDeal;
  labels: {
    cta: string;
    ctaAffiliate: string;
    ctaOfficial: string;
    testIp: string;
    route: string;
    renewal: string;
    stockIn: string;
    stockOut: string;
    stockUnknown: string;
    specs: string;
    bandwidth: string;
    location: string;
  };
}) {
  const stockLabel =
    deal.stock === "in-stock" ? labels.stockIn : deal.stock === "out-of-stock" ? labels.stockOut : labels.stockUnknown;
  return (
    <li className="card vps-card">
      <div className="vps-card-head">
        <p className="meta vps-vendor">{deal.vendor}</p>
        <span className={`vps-badge vps-badge-${deal.stock}`}>{stockLabel}</span>
      </div>
      <h3>{deal.name}</h3>
      <p className="vps-price">{deal.priceLabel}</p>
      <dl className="vps-specs">
        <div>
          <dt>{labels.specs}</dt>
          <dd>{deal.specs}</dd>
        </div>
        <div>
          <dt>{labels.bandwidth}</dt>
          <dd>{deal.bandwidth}</dd>
        </div>
        <div>
          <dt>{labels.location}</dt>
          <dd>{deal.location}</dd>
        </div>
        <div>
          <dt>{labels.route}</dt>
          <dd>{deal.route}</dd>
        </div>
        {deal.testIp ? (
          <div>
            <dt>{labels.testIp}</dt>
            <dd>
              <code>{deal.testIp}</code>
            </dd>
          </div>
        ) : null}
        <div>
          <dt>{labels.renewal}</dt>
          <dd>{deal.renewal}</dd>
        </div>
      </dl>
      {deal.stockNote ? <p className="meta">{deal.stockNote}</p> : null}
      <p className="vps-cta">
        <a className="btn btn-primary" href={deal.outboundHref} rel={deal.rel} target="_blank">
          {deal.affiliate ? labels.ctaAffiliate : labels.ctaOfficial}
        </a>
      </p>
    </li>
  );
}
