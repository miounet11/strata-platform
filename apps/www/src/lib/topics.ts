import topicData from "@/data/topics.json";
import { getRigs, type BenchmarkRig } from "@/lib/benchmarks";

export type TopicFilter = {
  vendor?: string;
  memoryMax?: number;
};

export type TopicLink = {
  href: string;
  label: Record<string, string>;
};

export type Topic = {
  slug: string;
  status: "live" | "brief";
  filter?: TopicFilter | null;
  title?: Record<string, string>;
  body?: Record<string, string>;
  links?: TopicLink[];
  phrase?: string;
  kind?: string;
  decision?: string;
  behind?: string[];
  evidence?: string;
  importedAt?: string;
};

const topics = topicData.topics as Topic[];

export function getTopics(): Topic[] {
  return topics;
}

export function getLiveTopics(): Topic[] {
  return topics.filter((topic) => topic.status === "live");
}

export function getTopic(slug: string): Topic | undefined {
  return topics.find((topic) => topic.slug === slug);
}

export function topicText(record: Record<string, string> | undefined, locale: string): string {
  if (!record) return "";
  return record[locale] ?? record.en ?? "";
}

export function rigsForTopic(topic: Topic): BenchmarkRig[] {
  const filter = topic.filter;
  if (!filter) return [];
  return getRigs().filter((rig) => {
    if (filter.vendor && rig.vendor !== filter.vendor) return false;
    if (filter.memoryMax != null && rig.memory > filter.memoryMax) return false;
    return true;
  });
}
