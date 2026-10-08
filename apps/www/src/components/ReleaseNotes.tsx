import type { ReactNode } from "react";

function inline(text: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  const pattern = /(`[^`]+`)|(\*\*[^*]+\*\*)|(\[[^\]]+\]\([^)]+\))|(https?:\/\/[^\s)]+)/g;
  let last = 0;
  let key = 0;
  for (const match of text.matchAll(pattern)) {
    const start = match.index ?? 0;
    if (start > last) nodes.push(text.slice(last, start));
    const token = match[0];
    if (token.startsWith("`")) {
      nodes.push(<code key={key}>{token.slice(1, -1)}</code>);
    } else if (token.startsWith("**")) {
      nodes.push(<strong key={key}>{token.slice(2, -2)}</strong>);
    } else if (token.startsWith("[")) {
      const link = token.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
      nodes.push(
        link ? (
          <a key={key} href={link[2]} rel="noopener noreferrer">
            {link[1]}
          </a>
        ) : (
          token
        ),
      );
    } else {
      nodes.push(
        <a key={key} href={token} rel="noopener noreferrer">
          {token}
        </a>,
      );
    }
    last = start + token.length;
    key += 1;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

function htmlLink(line: string) {
  const href = line.match(/href="([^"]+)"/)?.[1];
  if (!href) return null;
  return { href, label: line.match(/alt="([^"]+)"/)?.[1] || href };
}

/** GitHub release markdown as real headings and lists, so each version page has an outline. */
export function ReleaseNotes({ body }: { body: string }) {
  const blocks: ReactNode[] = [];
  let paragraph: string[] = [];
  let list: string[] = [];
  let fence: string[] | null = null;
  let key = 0;

  function flushParagraph() {
    const text = paragraph.join(" ").trim();
    paragraph = [];
    if (text) blocks.push(<p key={key}>{inline(text)}</p>);
    key += 1;
  }

  function flushList() {
    if (!list.length) return;
    const items = list;
    list = [];
    blocks.push(
      <ul key={key}>
        {items.map((item, index) => (
          <li key={index}>{inline(item)}</li>
        ))}
      </ul>,
    );
    key += 1;
  }

  for (const raw of body.replace(/\r\n/g, "\n").split("\n")) {
    const line = raw.trim();
    if (line.startsWith("```")) {
      if (fence) {
        blocks.push(
          <pre key={key} className="copy-block">
            {fence.join("\n")}
          </pre>,
        );
        key += 1;
        fence = null;
      } else {
        flushParagraph();
        flushList();
        fence = [];
      }
      continue;
    }
    if (fence) {
      fence.push(raw);
      continue;
    }
    if (!line || line === "---") {
      flushParagraph();
      flushList();
      continue;
    }
    if (line.startsWith("<")) {
      flushParagraph();
      flushList();
      const link = htmlLink(line);
      if (link) {
        blocks.push(
          <p key={key}>
            <a href={link.href} rel="noopener noreferrer">
              {link.label}
            </a>
          </p>,
        );
        key += 1;
      }
      continue;
    }
    const heading = line.match(/^(#{2,3})\s+(.*)$/);
    if (heading) {
      flushParagraph();
      flushList();
      const text = inline(heading[2]);
      blocks.push(heading[1].length === 2 ? <h2 key={key}>{text}</h2> : <h3 key={key}>{text}</h3>);
      key += 1;
      continue;
    }
    const item = line.match(/^[-*]\s+(.*)$/);
    if (item) {
      flushParagraph();
      list.push(item[1]);
      continue;
    }
    flushList();
    paragraph.push(line);
  }
  if (fence?.length) {
    blocks.push(
      <pre key={key} className="copy-block">
        {fence.join("\n")}
      </pre>,
    );
  }
  flushParagraph();
  flushList();
  return <div>{blocks}</div>;
}
