import { Fragment, type ReactNode } from "react";

/** Inline: **bold**, *italic*, `code`. Everything else is rendered as plain text (no HTML is ever injected). */
function renderInline(text: string): ReactNode[] {
  const out: ReactNode[] = [];
  const pattern = /(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g;
  let last = 0;
  let key = 0;
  for (const m of text.matchAll(pattern)) {
    const at = m.index ?? 0;
    if (at > last) out.push(text.slice(last, at));
    const token = m[0];
    if (token.startsWith("**")) out.push(<strong key={key++}>{token.slice(2, -2)}</strong>);
    else if (token.startsWith("`")) out.push(<code key={key++}>{token.slice(1, -1)}</code>);
    else out.push(<em key={key++}>{token.slice(1, -1)}</em>);
    last = at + token.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

type ListItem = { text: string; checked?: boolean };

/** Minimal markdown: headings, paragraphs, bullet/numbered/task lists and inline emphasis. */
export function renderBasicMarkdown(src: string): ReactNode {
  const lines = src.split(/\r?\n/);
  const nodes: ReactNode[] = [];
  let paragraph: string[] = [];
  let list: { ordered: boolean; items: ListItem[] } | null = null;

  const flushParagraph = () => {
    if (paragraph.length) nodes.push(<p key={nodes.length}>{renderInline(paragraph.join(" "))}</p>);
    paragraph = [];
  };
  const flushList = () => {
    if (!list) return;
    const Tag = list.ordered ? "ol" : "ul";
    nodes.push(
      <Tag key={nodes.length}>
        {list.items.map((item, i) => (
          <li key={i}>
            {item.checked !== undefined && <input type="checkbox" defaultChecked={item.checked} aria-label={item.text} />}
            {renderInline(item.text)}
          </li>
        ))}
      </Tag>,
    );
    list = null;
  };

  for (const line of lines) {
    const heading = /^(#{1,3})\s+(.*)$/.exec(line);
    const task = /^\s*[-*]\s+\[([ xX])\]\s+(.*)$/.exec(line);
    const bullet = /^\s*[-*]\s+(.*)$/.exec(line);
    const numbered = /^\s*\d+[.)]\s+(.*)$/.exec(line);

    if (heading) {
      flushParagraph();
      flushList();
      const Tag = (heading[1] ?? "#").length >= 3 ? "h3" : "h2";
      nodes.push(<Tag key={nodes.length}>{renderInline(heading[2] ?? "")}</Tag>);
    } else if (task || bullet || numbered) {
      flushParagraph();
      const ordered = !task && !bullet;
      if (list && list.ordered !== ordered) flushList();
      list ??= { ordered, items: [] };
      if (task) list.items.push({ text: task[2] ?? "", checked: task[1] !== " " });
      else list.items.push({ text: (bullet?.[1] ?? numbered?.[1]) ?? "" });
    } else if (line.trim() === "") {
      flushParagraph();
      flushList();
    } else {
      flushList();
      paragraph.push(line.trim());
    }
  }
  flushParagraph();
  flushList();
  return <Fragment>{nodes}</Fragment>;
}
