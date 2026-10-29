import { memo } from "react";
import type { AppBlock, DashboardBlock, TextBlock, Widget } from "../schema/canvas";
import { useCanvasEnv } from "./context";
import { useConnectorQuery } from "./useConnectorQuery";

export const TextNode = memo(function TextNode({ block }: { block: TextBlock }) {
  const { renderMarkdown } = useCanvasEnv();
  return (
    <section data-block={block.id} style={{ whiteSpace: "pre-wrap" }}>
      {block.format === "markdown" && renderMarkdown ? renderMarkdown(block.content) : block.content}
    </section>
  );
});

const WidgetView = memo(function WidgetView({ widget }: { widget: Widget }) {
  const q = useConnectorQuery(widget.query);
  return (
    <article data-widget={widget.id} style={{ gridColumn: `span ${widget.span}` }}>
      <h3>{widget.title}</h3>
      {q.status === "loading" && <p>Loading…</p>}
      {q.status === "error" && <p role="alert">{q.error}</p>}
      {q.status === "ready" && <WidgetBody widget={widget} columns={q.data.columns} rows={q.data.rows} />}
    </article>
  );
});

function WidgetBody({ widget, columns, rows }: { widget: Widget; columns: string[]; rows: Record<string, unknown>[] }) {
  if (widget.kind === "metric") {
    const first = rows[0];
    const col = columns[0];
    return <strong>{first && col ? String(first[col]) : "—"}</strong>;
  }
  // "chart" falls back to a table until a charting component is plugged in.
  return (
    <table>
      <thead>
        <tr>{columns.map((c) => <th key={c}>{c}</th>)}</tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={i}>{columns.map((c) => <td key={c}>{String(r[c] ?? "")}</td>)}</tr>
        ))}
      </tbody>
    </table>
  );
}

export const DashboardGridNode = memo(function DashboardGridNode({ block }: { block: DashboardBlock }) {
  return (
    <div data-block={block.id} style={{ display: "grid", gridTemplateColumns: `repeat(${block.columns}, 1fr)`, gap: 12 }}>
      {block.widgets.map((w) => (
        <WidgetView key={w.id} widget={w} />
      ))}
    </div>
  );
});

export const AppNode = memo(function AppNode({ block }: { block: AppBlock }) {
  const { apps } = useCanvasEnv();
  const App = apps[block.appId];
  return App ? <App block={block} /> : <p role="alert">Unknown app "{block.appId}"</p>;
});
