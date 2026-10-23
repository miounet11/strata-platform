import { Link } from "@/i18n/navigation";
import { classifyHref } from "@/lib/internal-links";
import { parseMarkdown, type Block, type Inline } from "@/lib/markdown";

/**
 * Renders an article body.
 *
 * Internal links go through the localised `Link` so a `/gpus/rtx-4090` in the text resolves to
 * the reader's language instead of bouncing through a redirect; external links are plain
 * anchors with `rel="nofollow noopener"`, because a generated article citing a spec sheet should
 * not pass authority out of the site.
 *
 * The protocol decides the branch, not the presence of "http": a body may contain `mailto:` or
 * `tel:`, which the router cannot resolve, and `javascript:`/`data:`, which must never become an
 * href. Links that classify as unsafe render as plain text — a dead link is a crawl defect, and
 * dropping the anchor keeps the sentence readable without advertising a target that does nothing.
 */
function Nodes({ inlines }: { inlines: Inline[] }) {
  return (
    <>
      {inlines.map((inline, index) => {
        if (inline.kind === "strong") return <strong key={index}>{inline.text}</strong>;
        if (inline.kind === "link") {
          const kind = classifyHref(inline.href);
          if (kind === "unsafe") return <span key={index}>{inline.text}</span>;
          if (kind === "internal") {
            return (
              <Link key={index} href={inline.href}>
                {inline.text}
              </Link>
            );
          }
          return (
            <a
              key={index}
              href={inline.href}
              rel="nofollow noopener"
              target={kind === "external" ? "_blank" : undefined}
            >
              {inline.text}
            </a>
          );
        }
        return <span key={index}>{inline.text}</span>;
      })}
    </>
  );
}

function BlockNode({ block }: { block: Block }) {
  if (block.kind === "heading") {
    return block.level === 2 ? <h2>{block.text}</h2> : <h3>{block.text}</h3>;
  }
  if (block.kind === "paragraph") {
    return (
      <p>
        <Nodes inlines={block.inlines} />
      </p>
    );
  }
  if (block.kind === "list") {
    const items = block.items.map((item, index) => (
      <li key={index}>
        <Nodes inlines={item} />
      </li>
    ));
    return block.ordered ? <ol>{items}</ol> : <ul>{items}</ul>;
  }
  return (
    <table>
      <thead>
        <tr>
          {block.head.map((cell, index) => (
            <th key={index}>{cell}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {block.rows.map((row, rowIndex) => (
          <tr key={rowIndex}>
            {row.map((cell, cellIndex) => (
              <td key={cellIndex}>{cell}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function Markdown({ source }: { source: string }) {
  return (
    <>
      {parseMarkdown(source).map((block, index) => (
        <BlockNode key={index} block={block} />
      ))}
    </>
  );
}
