"use client";

import { useEffect, useState } from "react";
import { Link } from "@/i18n/navigation";

type Hit = {
  type: string;
  title: string;
  subtitle: string;
  href: string;
  badge: string;
};

type Labels = {
  placeholder: string;
  button: string;
  allTypes: string;
  guides: string;
  gpus: string;
  builds: string;
  tools: string;
  benchmarks: string;
  topics: string;
  releases: string;
  emptyPrompt: string;
  noResults: string;
  loading: string;
  popularHeading: string;
  resultCount: string;
};

const POPULAR_QUERIES = [
  "RTX 4090",
  "RTX 5090",
  "RTX 5080",
  "RX 7900 XTX",
  "Apple Silicon",
  "128k",
  "CUDA out of memory",
  "quantization",
  "dual GPU",
];

export function SearchClient({
  locale,
  initialQuery,
  labels,
}: {
  locale: string;
  initialQuery: string;
  labels: Labels;
}) {
  const [query, setQuery] = useState(initialQuery);
  const [type, setType] = useState("all");
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<Hit[]>([]);
  const [total, setTotal] = useState(0);
  const [searched, setSearched] = useState(Boolean(initialQuery));

  // Pick up `?q=` from the browser URL (e.g. from Google/AI SearchAction) without making
  // the route dynamic at build time.
  useEffect(() => {
    if (initialQuery) return;
    const param = new URLSearchParams(window.location.search).get("q")?.trim();
    if (param) setQuery(param);
  }, [initialQuery]);

  useEffect(() => {
    const q = query.trim();
    if (!q) {
      setResults([]);
      setTotal(0);
      setSearched(false);
      return;
    }
    const ctrl = new AbortController();
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(
          `/api/search?q=${encodeURIComponent(q)}&locale=${encodeURIComponent(locale)}&type=${encodeURIComponent(type)}`,
          { signal: ctrl.signal },
        );
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as { total: number; results: Hit[] };
        setResults(data.results ?? []);
        setTotal(data.total ?? 0);
        setSearched(true);
      } catch (err) {
        if ((err as Error).name !== "AbortError") {
          setResults([]);
          setTotal(0);
          setSearched(true);
        }
      } finally {
        setLoading(false);
      }
    }, 180);
    return () => {
      clearTimeout(timer);
      ctrl.abort();
    };
  }, [query, type, locale]);

  return (
    <div className="search-shell">
      <form
        className="search-bar"
        role="search"
        onSubmit={(e) => {
          e.preventDefault();
        }}
      >
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={labels.placeholder}
          aria-label={labels.placeholder}
          autoFocus
        />
        <select value={type} onChange={(e) => setType(e.target.value)} aria-label={labels.allTypes}>
          <option value="all">{labels.allTypes}</option>
          <option value="guide">{labels.guides}</option>
          <option value="gpu">{labels.gpus}</option>
          <option value="build">{labels.builds}</option>
          <option value="tool">{labels.tools}</option>
          <option value="benchmark">{labels.benchmarks}</option>
          <option value="topic">{labels.topics}</option>
          <option value="release">{labels.releases}</option>
        </select>
      </form>

      <div className="search-chips">
        <span className="meta">{labels.popularHeading}:</span>
        {POPULAR_QUERIES.map((chip) => (
          <button
            key={chip}
            type="button"
            className="btn btn-quiet search-chip"
            onClick={() => setQuery(chip)}
          >
            {chip}
          </button>
        ))}
      </div>

      {loading ? <p className="meta">{labels.loading}</p> : null}

      {!loading && !searched ? <p className="meta">{labels.emptyPrompt}</p> : null}

      {!loading && searched && results.length === 0 ? (
        <p className="meta">{labels.noResults}</p>
      ) : null}

      {results.length > 0 ? (
        <section style={{ marginTop: "1.25rem" }}>
          <p className="meta">{labels.resultCount.replace("{count}", String(total))}</p>
          <ul className="list-plain stack">
            {results.map((hit) => (
              <li key={`${hit.type}:${hit.href}`} className="card" style={{ padding: "0.95rem 1.15rem" }}>
                <div className="row" style={{ justifyContent: "space-between", gap: "0.5rem" }}>
                  <Link href={hit.href} style={{ fontWeight: 600 }}>
                    {hit.title}
                  </Link>
                  <span className="badge">{hit.badge}</span>
                </div>
                {hit.subtitle ? <p className="meta" style={{ marginTop: "0.3rem" }}>{hit.subtitle}</p> : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
