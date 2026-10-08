"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { addBookmark, getStoredToken, trackDownload } from "@/lib/api";

export function ModelActions({
  modelId,
  modelName,
  hfUrl,
}: {
  modelId: string;
  modelName: string;
  hfUrl: string;
}) {
  const t = useTranslations("models");
  const [msg, setMsg] = useState<string | null>(null);

  async function onBookmark() {
    setMsg(null);
    const token = getStoredToken();
    if (!token) {
      setMsg(t("loginToBookmark"));
      return;
    }
    try {
      await addBookmark(modelId, token);
      setMsg(t("bookmarked"));
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Error");
    }
  }

  async function onTrack() {
    setMsg(null);
    try {
      await trackDownload(`model:${modelId}`, undefined, getStoredToken());
      window.open(hfUrl, "_blank", "noopener,noreferrer");
      setMsg(t("trackedOpen"));
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Error");
    }
  }

  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 8 }}>
      <button type="button" className="btn btn-primary" onClick={() => void onTrack()}>
        {t("downloadHint")}
      </button>
      <button type="button" className="btn" onClick={() => void onBookmark()}>
        {t("bookmark")}
      </button>
      {msg ? (
        <span style={{ fontSize: "0.85rem", color: "var(--muted)", alignSelf: "center" }}>{msg}</span>
      ) : null}
    </div>
  );
}
