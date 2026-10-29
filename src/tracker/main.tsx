import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { HttpConnector } from "../connectors/adapters";
import { ConnectorRegistry } from "../connectors/types";
import { createEmptyCanvas, type Widget } from "../schema/canvas";
import { CanvasStore } from "../state/store";
import { CanvasProvider } from "../ui/context";
import { CanvasRenderer } from "../ui/CanvasRenderer";
import "../demo/style.css";

const POLL_MS = 15_000;

const store = new CanvasStore(createEmptyCanvas("tracker", "dashboard"));
const connectors = new ConnectorRegistry().register(new HttpConnector("tracker", "/api/tracker"));

// The tracker is itself a Canvasium canvas: each widget's `statement` is a backend tracker query.
const layout = [
  { block: "kpis", widgets: [
    { id: "prompts", kind: "metric", title: "Prompts", span: 3 },
    { id: "success-rate", kind: "metric", title: "Success rate", span: 3 },
    { id: "workspaces", kind: "metric", title: "Workspaces", span: 3 },
    { id: "blocks", kind: "metric", title: "Blocks created", span: 3 },
  ] },
  { block: "trends", widgets: [
    { id: "by-day", kind: "table", title: "Last 7 days", span: 6 },
    { id: "by-category", kind: "table", title: "What people ask for", span: 6 },
  ] },
  { block: "activity", widgets: [{ id: "recent-activity", kind: "table", title: "Recent activity", span: 12 }] },
  { block: "workspace-list", widgets: [{ id: "workspace-list", kind: "table", title: "Workspaces", span: 12 }] },
] as const;

const makeWidget = (w: (typeof layout)[number]["widgets"][number], tick: number): Widget => ({
  id: w.id,
  kind: w.kind,
  title: w.title,
  span: w.span,
  query: { connector: "tracker", statement: w.id, params: { tick } },
  options: {},
});

store.dispatch(
  layout.map((group) => ({
    op: "add_block" as const,
    block: { id: group.block, type: "dashboard" as const, columns: 12, widgets: group.widgets.map((w) => makeWidget(w, 0)) },
  })),
);

// Changing a widget's query params re-runs it; the hook keeps old data visible while refreshing.
const refresh = (tick: number) =>
  store.dispatch(
    layout.flatMap((group) =>
      group.widgets.map((w) => ({ op: "upsert_widget" as const, blockId: group.block, widget: makeWidget(w, tick) })),
    ),
  );

function Tracker() {
  const [tick, setTick] = useState(0);
  const [updated, setUpdated] = useState(() => new Date());

  useEffect(() => {
    if (tick === 0) return;
    refresh(tick);
    setUpdated(new Date());
  }, [tick]);

  useEffect(() => {
    const timer = setInterval(() => setTick((t) => t + 1), POLL_MS);
    return () => clearInterval(timer);
  }, []);

  return (
    <CanvasProvider env={{ store, connectors, apps: {} }}>
      <div className="app-shell">
        <header className="topbar">
          <a className="brand" href="/" aria-label="The Canvasium home">
            <span className="brand-mark">C</span>
            <span>The Canvasium</span>
          </a>
          <nav className="topbar-nav" aria-label="Pages">
            <a href="/">Workspace</a>
            <a className="active" href="/tracker" aria-current="page">Tracker</a>
          </nav>
        </header>

        <div className="tracker-page">
          <div className="eyebrow">PRODUCTIVITY TRACKER</div>
          <h1>How your workspaces are being used</h1>
          <p className="hero-copy">Every prompt is recorded by the backend, along with whether its changes were applied. This page is rendered by Canvasium itself and refreshes automatically.</p>
          <div className="tracker-toolbar">
            <span><span className="online-dot" /> Updated {updated.toLocaleTimeString()}</span>
            <button className="mode-button" onClick={() => setTick((t) => t + 1)}>Refresh now</button>
          </div>
          <div className="canvas-surface tracker-surface">
            <CanvasRenderer />
          </div>
        </div>
      </div>
    </CanvasProvider>
  );
}

const root = document.getElementById("root");
if (!root) throw new Error('Missing element with id "root"');
createRoot(root).render(<Tracker />);
