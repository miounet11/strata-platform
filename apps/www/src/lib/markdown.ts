/**
 * A small, deliberately incomplete Markdown renderer for article bodies.
 *
 * Incomplete on purpose: the bodies are machine-written to a fixed shape (front matter already
 * stripped, `##`/`###` sections, `-`/`1.` lists, pipe tables, `**bold**` and inline links), and a
 * full CommonMark parser would be a large dependency to support syntax nobody writes. What it
 * must not do is silently drop links: an unrendered `[label](/gpus/rtx-4090)` is an internal link
 * the crawler never sees, which is exactly what this file exists to fix.
 *
 * Output is a block tree rather than JSX so the shape can be asserted in a test without React.
 */

export type Inline =
  | { kind: "text"; text: string }
  | { kind: "strong"; text: string }
  | { kind: "link"; text: string; href: string };

export type Block =
  | { kind: "heading"; level: 2 | 3; text: string }
  | { kind: "paragraph"; inlines: Inline[] }
  | { kind: "list"; ordered: boolean; items: Inline[][] }
  | { kind: "table"; head: string[]; rows: string[][] };

const LINK = /\[([^\]]+)\]\(([^)\s]+)\)/g;
const STRONG = /\*\*([^*]+)\*\*/g;

/**
 * Splits one line of prose into text, bold and link runs.
 *
 * Links are scanned first because a link's own label may contain emphasis, and because the href
 * must survive verbatim — a bold span inside a URL would otherwise corrupt it.
 */
export function parseInline(source: string): Inline[] {
  const out: Inline[] = [];
  const push = (value: Inline) => {
    if (value.kind === "text" && value.text.length === 0) return;
    const last = out[out.length - 1];
    if (last?.kind === "text" && value.kind === "text") last.text += value.text;
    else out.push(value);
  };

  const withLinks = (text: string) => {
    // Emphasis is resolved inside the non-link runs only, so `**` inside a URL cannot break it.
    for (const part of splitBy(text, LINK)) {
      // `in` narrows the union: `part.link` alone leaves the `{ text }` branch possible.
      if ("link" in part) {
        push({ kind: "link", text: part.link[1], href: part.link[2] });
      } else if (part.text) {
        for (const piece of splitBy(part.text, STRONG)) {
          if ("link" in piece) push({ kind: "strong", text: piece.link[1] });
          else if (piece.text) push({ kind: "text", text: piece.text });
        }
      }
    }
  };
  withLinks(source);
  return out;
}

type Segment = { text: string } | { link: RegExpExecArray };

/** Alternates literal text and matches of a global regexp, preserving order and offsets. */
export function splitBy(source: string, pattern: RegExp): Segment[] {
  const regexp = new RegExp(pattern.source, pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`);
  const out: Segment[] = [];
  let cursor = 0;
  for (let match = regexp.exec(source); match; match = regexp.exec(source)) {
    if (match.index > cursor) out.push({ text: source.slice(cursor, match.index) });
    out.push({ link: match });
    cursor = match.index + match[0].length;
  }
  if (cursor < source.length) out.push({ text: source.slice(cursor) });
  return out;
}

const isTable = (lines: string[]) => lines.length > 0 && lines.every((line) => line.trim().startsWith("|"));
const isTableDivider = (line: string) => /^\|[\s:|-]+\|$/.test(line.trim());
const isBullet = (line: string) => /^[-*]\s+/.test(line.trim());
const isOrdered = (line: string) => /^\d+[.)]\s+/.test(line.trim());

/**
 * Turns an article body into blocks.
 *
 * A leading `# Title` is dropped: the page renders the article title as its own `<h1>`, so a body
 * heading would give every article a second H1. Lists may be mixed only in the sense that
 * bullet and numbered items in one block end the block at the change — that is what the generated
 * text actually contains.
 */
export function parseMarkdown(source: string): Block[] {
  const blocks: Block[] = [];
  const paragraphs = String(source ?? "")
    .replace(/^\uFEFF/, "")
    .split(/\n{2,}/)
    .map((chunk) => chunk.trim())
    .filter(Boolean);

  for (const chunk of paragraphs) {
    const lines = chunk.split("\n").map((line) => line.trim()).filter(Boolean);
    if (lines.length === 0) continue;

    const heading = /^(#{1,6})\s+(.*)$/.exec(lines[0]);
    if (heading) {
      const level = heading[1].length;
      const rest = lines.slice(1);
      if (level > 1) blocks.push({ kind: "heading", level: level === 2 ? 2 : 3, text: heading[2].trim() });
      const remainder = rest.join("\n").trim();
      if (remainder) blocks.push(...parseMarkdown(remainder));
      continue;
    }

    if (isTable(lines)) {
      const rows = lines
        .filter((line) => !isTableDivider(line))
        .map((line) => line.replace(/^\||\|$/g, "").split("|").map((cell) => cell.trim()));
      const [head, ...body] = rows;
      blocks.push({ kind: "table", head: head ?? [], rows: body });
      continue;
    }

    // A chunk holding a list and a trailing sentence is common ("- a\n- b\nThen …"): split at
    // the first line that is not a list item and re-enter, so the sentence is not lost.
    const listShape = lines.findIndex((line) => isBullet(line) || isOrdered(line));
    if (listShape === 0) {
      const ordered = isOrdered(lines[0]);
      const keep = (line: string) => (ordered ? isOrdered(line) : isBullet(line));
      const run: string[] = [];
      let index = 0;
      for (; index < lines.length && keep(lines[index]); index++) run.push(lines[index]);
      blocks.push({
        kind: "list",
        ordered,
        items: run.map((line) => parseInline(line.replace(/^(?:[-*]|\d+[.)])\s+/, ""))),
      });
      const remainder = lines.slice(index).join("\n").trim();
      if (remainder) blocks.push(...parseMarkdown(remainder));
      continue;
    }

    blocks.push({ kind: "paragraph", inlines: parseInline(lines.join(" ")) });
  }
  return blocks;
}

/** Every href in a body, in order — the list a crawl check needs to assert against. */
export function linksIn(source: string): string[] {
  return parseMarkdown(source).flatMap((block) => {
    if (block.kind === "paragraph") return block.inlines.flatMap((inline) => (inline.kind === "link" ? [inline.href] : []));
    if (block.kind === "list") return block.items.flatMap((item) => item.flatMap((inline) => (inline.kind === "link" ? [inline.href] : [])));
    return [];
  });
}
