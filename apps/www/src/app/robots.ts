import type { MetadataRoute } from "next";

const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.stratat.com";

/**
 * Named AI crawlers are listed explicitly, ahead of the catch-all.
 *
 * `User-agent: *` already allows them, but a crawler that finds no group naming it treats the
 * site as unknown and may fall back to a conservative policy. A named group is an unambiguous
 * grant, and it is the documented way to be eligible for retrieval-time citation.
 *
 * The list is split by purpose:
 *  - search/answer crawlers (OAI-SearchBot, PerplexityBot, Claude-SearchBot, Claude-User) fetch
 *    pages that get cited with a link. They are the traffic this is trying to earn.
 *  - training crawlers (GPTBot, ClaudeBot, Google-Extended, CCBot) are allowed as well: the
 *    corpus is public anyway, and opting out costs citations without hiding anything.
 *
 * The private board is closed for every group. A crawler that ignores the catch-all must still
 * see `/b/` closed, which is why the disallow is repeated instead of inherited.
 */
const AI_CRAWLERS = [
  "GPTBot",
  "OAI-SearchBot",
  "ChatGPT-User",
  "ClaudeBot",
  "Claude-User",
  "Claude-SearchBot",
  "PerplexityBot",
  "Perplexity-User",
  "Google-Extended",
  "Applebot",
  "Applebot-Extended",
  "CCBot",
  "Bytespider",
  "Amazonbot",
  "YouBot",
  "MistralAI-User",
  "cohere-ai",
];

const PRIVATE = ["/b/", "/api/", "/*?q=", "/*?search="];

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      ...AI_CRAWLERS.map((userAgent) => ({
        userAgent,
        allow: "/",
        disallow: PRIVATE,
      })),
      {
        userAgent: "*",
        allow: "/",
        // Query strings the board uses for state (?e=1 after a failed sign-in) are not pages.
        disallow: PRIVATE,
      },
    ],
    sitemap: `${SITE}/sitemap.xml`,
    host: SITE,
  };
}
