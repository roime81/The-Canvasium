import type { ReactNode } from "react";

function inline(text: string): ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**")) return <strong key={i}>{part.slice(2, -2)}</strong>;
    if (part.startsWith("`") && part.endsWith("`")) return <code key={i}>{part.slice(1, -1)}</code>;
    return part;
  });
}

/** Tiny safe markdown subset (headings, bullets, bold, code). Emits React nodes only, never raw HTML. */
export function renderMarkdown(src: string): ReactNode {
  const out: ReactNode[] = [];
  let list: string[] = [];
  const flush = () => {
    if (list.length) out.push(<ul key={out.length}>{list.map((l, i) => <li key={i}>{inline(l)}</li>)}</ul>);
    list = [];
  };
  for (const line of src.split("\n")) {
    const h = /^(#{1,3})\s+(.*)$/.exec(line);
    const li = /^\s*[-*]\s+(.*)$/.exec(line);
    if (li?.[1] !== undefined) list.push(li[1]);
    else {
      flush();
      if (h?.[1] !== undefined && h[2] !== undefined) {
        const Tag = `h${h[1].length}` as "h1" | "h2" | "h3";
        out.push(<Tag key={out.length}>{inline(h[2])}</Tag>);
      } else if (line.trim()) out.push(<p key={out.length}>{inline(line)}</p>);
    }
  }
  flush();
  return out;
}
