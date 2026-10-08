const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8787";

export function getStoredToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("strata_token");
}

export async function apiFetch<T>(
  path: string,
  init: RequestInit & { token?: string | null } = {},
): Promise<T> {
  const token = init.token ?? getStoredToken();
  const headers = new Headers(init.headers);
  headers.set("Content-Type", "application/json");
  if (token) headers.set("Authorization", `Bearer ${token}`);
  const res = await fetch(`${API_BASE}${path}`, { ...init, headers });
  const data = (await res.json()) as T & { error?: string };
  if (!res.ok) throw new Error(data.error ?? res.statusText);
  return data;
}

export type BookmarkRow = { id: number; modelId: string; createdAt: string };
export type DownloadRow = {
  id: number;
  assetName: string;
  releaseTag: string | null;
  createdAt: string;
};

export async function fetchBookmarks(token?: string | null) {
  return apiFetch<{ bookmarks: BookmarkRow[] }>("/v1/me/bookmarks", { token });
}

export async function fetchDownloadHistory(token?: string | null) {
  return apiFetch<{ downloads: DownloadRow[] }>("/v1/me/downloads", { token });
}

export async function addBookmark(modelId: string, token?: string | null) {
  return apiFetch<{ ok: boolean }>("/v1/bookmarks", {
    method: "POST",
    body: JSON.stringify({ modelId }),
    token,
  });
}

export async function trackDownload(assetName: string, releaseTag?: string, token?: string | null) {
  return apiFetch<{ ok: boolean }>("/v1/downloads/track", {
    method: "POST",
    body: JSON.stringify({ assetName, releaseTag }),
    token,
  });
}
