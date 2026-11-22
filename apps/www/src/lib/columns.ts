import fallbackColumnData from "@/data/columns.json";
import { readDataJson } from "@/lib/data-file";
import { getLiveTopics, getTopics, type Topic } from "@/lib/topics";

export type Column = {
  slug: string;
  title: Record<string, string>;
  intro: Record<string, string>;
};

export type ColumnEntry = {
  column: Column;
  topics: Topic[];
};

function loadColumns(): Column[] {
  const data = readDataJson("columns.json", fallbackColumnData as unknown as { columns: Column[] });
  return Array.isArray(data.columns) ? data.columns : [];
}

export function getColumns(): Column[] {
  return loadColumns();
}

export function getColumn(slug: string): Column | undefined {
  return loadColumns().find((column) => column.slug === slug);
}

export function topicsForColumn(slug: string): Topic[] {
  return getTopics().filter((topic) => topic.column === slug);
}

/** A column is only worth listing when it has at least one live topic in the locale. */
export function liveColumns(locale: string): ColumnEntry[] {
  return loadColumns()
    .map((column) => {
      const slugs = new Set(topicsForColumn(column.slug).map((topic) => topic.slug));
      return {
        column,
        topics: getLiveTopics(locale).filter((topic) => slugs.has(topic.slug)),
      };
    })
    .filter((entry) => entry.topics.length > 0);
}
