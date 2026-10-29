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
  if (widget.kind === "chart") return <BarChart columns={columns} rows={rows} />;
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

/** Dependency-free SVG bar chart: first column = label, second = numeric value. */
export function BarChart({ columns, rows }: { columns: string[]; rows: Record<string, unknown>[] }) {
  const [labelCol, valueCol] = columns;
  if (!labelCol || !valueCol) return <p>No data</p>;
  const data = rows.map((r) => ({ label: String(r[labelCol] ?? ""), value: Number(r[valueCol]) || 0 }));
  const max = Math.max(1, ...data.map((d) => d.value));
  const w = 28;
  const h = 120;
  return (
    <svg role="img" aria-label={`${valueCol} by ${labelCol}`} viewBox={`0 0 ${data.length * w + 8} ${h + 20}`} width="100%" style={{ maxHeight: 200 }}>
      {data.map((d, i) => {
        const bh = (d.value / max) * h;
        return (
          <g key={i}>
            <rect x={i * w + 6} y={h - bh} width={w - 8} height={bh} fill="currentColor" opacity={0.75}>
              <title>{`${d.label}: ${d.value}`}</title>
            </rect>
            <text x={i * w + 6 + (w - 8) / 2} y={h + 12} fontSize="7" textAnchor="middle">
              {d.label.slice(0, 4)}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
