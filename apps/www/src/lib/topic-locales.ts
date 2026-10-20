import topicData from "@/data/topics.json";
import type { Locale } from "@/i18n/routing";

type TopicRecord = { slug: string; status: string; locales?: Locale[] };

const topics = topicData.topics as TopicRecord[];

/**
 * The language switcher must not link to a topic page in a locale that never
 * published it — those URLs 404.
 */
export function localesForTopicPath(pathname: string): Locale[] | null {
  const match = pathname.match(/^\/topics\/([^/]+)$/);
  if (!match) return null;
  const topic = topics.find((item) => item.slug === match[1]);
  if (!topic) return null;
  return topic.locales ?? null;
}
