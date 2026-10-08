"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import {
  fetchBookmarks,
  fetchDownloadHistory,
  getStoredToken,
  type BookmarkRow,
  type DownloadRow,
} from "@/lib/api";

export function DashboardPanel() {
  const t = useTranslations("dashboard");
  const [bookmarks, setBookmarks] = useState<BookmarkRow[]>([]);
  const [downloads, setDownloads] = useState<DownloadRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = getStoredToken();
    if (!token) {
      setLoading(false);
      return;
    }
    Promise.all([fetchBookmarks(token), fetchDownloadHistory(token)])
      .then(([b, d]) => {
        setBookmarks(b.bookmarks);
        setDownloads(d.downloads);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Failed"))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <p style={{ color: "var(--muted)" }}>{t("loading")}</p>;

  const token = getStoredToken();
  if (!token) {
    return (
      <p>
        {t("loginRequired")}{" "}
        <Link href="/login" className="btn btn-primary" style={{ display: "inline-block", marginLeft: 8 }}>
          {t("login")}
        </Link>
      </p>
    );
  }

  if (error) return <p style={{ color: "var(--danger)" }}>{error}</p>;

  return (
    <div style={{ display: "grid", gap: "1.5rem", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))" }}>
      <section className="card" style={{ border: "1px solid var(--border)", borderRadius: 12, padding: "1rem" }}>
        <h2 style={{ marginTop: 0, fontSize: "1.1rem" }}>{t("bookmarks")}</h2>
        {bookmarks.length === 0 ? (
          <p style={{ color: "var(--muted)" }}>{t("noBookmarks")}</p>
        ) : (
          <ul style={{ paddingLeft: "1.2rem" }}>
            {bookmarks.map((b) => (
              <li key={b.id}>
                <Link href="/models">{b.modelId}</Link>
                <span style={{ color: "var(--muted)", fontSize: "0.85rem" }}> · {b.createdAt.slice(0, 10)}</span>
              </li>
            ))}
          </ul>
        )}
        <Link href="/models" className="btn" style={{ marginTop: "0.75rem" }}>
          {t("browseModels")}
        </Link>
      </section>
      <section className="card" style={{ border: "1px solid var(--border)", borderRadius: 12, padding: "1rem" }}>
        <h2 style={{ marginTop: 0, fontSize: "1.1rem" }}>{t("downloads")}</h2>
        {downloads.length === 0 ? (
          <p style={{ color: "var(--muted)" }}>{t("noDownloads")}</p>
        ) : (
          <ul style={{ paddingLeft: "1.2rem" }}>
            {downloads.map((d) => (
              <li key={d.id}>
                {d.assetName}
                {d.releaseTag ? ` (${d.releaseTag})` : ""}
                <span style={{ color: "var(--muted)", fontSize: "0.85rem" }}> · {d.createdAt.slice(0, 10)}</span>
              </li>
            ))}
          </ul>
        )}
        <Link href="/download" className="btn" style={{ marginTop: "0.75rem" }}>
          {t("getEngine")}
        </Link>
      </section>
    </div>
  );
}
