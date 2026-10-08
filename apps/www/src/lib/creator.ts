import pulse from "@/data/creator-pulse.json";
import { readDataJson } from "@/lib/data-file";

function load() {
  return readDataJson("creator-pulse.json", pulse);
}

export function getCreatorPulse() {
  return load();
}

export function getCreatorPost(id: string) {
  return load().posts.find((p) => p.id === id);
}

export function latestPosts(limit = 5) {
  return load().posts.slice(0, limit);
}

export function postHeadline(title: string, max = 140) {
  const line = title.split("\n").find((part) => part.trim()) ?? title;
  const clean = line.replace(/\s+/g, " ").trim();
  return clean.length > max ? `${clean.slice(0, max)}…` : clean;
}

/** Empty when the body repeats the title, which is how X posts are stored. */
export function postExcerpt(title: string, body: string, max = 220) {
  const cleanTitle = title.replace(/\s+/g, " ").trim();
  const cleanBody = body.replace(/\s+/g, " ").trim();
  if (!cleanBody || cleanBody === cleanTitle) return "";
  return cleanBody.length > max ? `${cleanBody.slice(0, max)}…` : cleanBody;
}
