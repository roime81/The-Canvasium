import { useState } from "react";
import { createRoot } from "react-dom/client";
import { ConnectorRegistry } from "../connectors/types";
import { routeAIResponse } from "../router/intentRouter";
import { createEmptyCanvas, type DataQuery } from "../schema/canvas";
import { CanvasStore } from "../state/store";
import { CanvasProvider, useCanvasSelector } from "../ui/context";
import { CanvasRenderer } from "../ui/CanvasRenderer";
import "./style.css";

const store = new CanvasStore(createEmptyCanvas("canvasium-demo", "dashboard"));
const connectors = new ConnectorRegistry().register({
  id: "demo",
  async execute(query: DataQuery) {
    if (query.statement === "active-projects") {
      return { columns: ["count"], rows: [{ count: 12 }] };
    }
    if (query.statement === "connected-sources") {
      return { columns: ["count"], rows: [{ count: 4 }] };
    }
    if (query.statement === "canvas-health") {
      return { columns: ["health"], rows: [{ health: "100%" }] };
    }
    return {
      columns: ["Project", "Status", "Updated"],
      rows: [
        { Project: "Canvasium core", Status: "In progress", Updated: "Just now" },
        { Project: "Connector adapters", Status: "Ready", Updated: "Today" },
        { Project: "AI operation routing", Status: "Ready", Updated: "Yesterday" },
      ],
    };
  },
});

routeAIResponse(store, {
  ops: [
    {
      op: "add_block",
      block: {
        id: "welcome",
        type: "text",
        content: "A flexible workspace for **AI-generated work**. Add blocks with validated operations, then render them as a live canvas.",
      },
    },
    {
      op: "add_block",
      block: {
        id: "overview",
        type: "dashboard",
        columns: 12,
        widgets: [
          {
            id: "active-projects",
            kind: "metric",
            title: "Active projects",
            span: 4,
            query: { connector: "demo", statement: "active-projects", params: {} },
          },
          {
            id: "connected-sources",
            kind: "metric",
            title: "Connected sources",
            span: 4,
            query: { connector: "demo", statement: "connected-sources", params: {} },
          },
          {
            id: "canvas-health",
            kind: "metric",
            title: "Canvas health",
            span: 4,
            query: { connector: "demo", statement: "canvas-health", params: {} },
          },
          {
            id: "recent-work",
            kind: "table",
            title: "Recent work",
            span: 12,
            query: { connector: "demo", statement: "recent-work", params: {} },
          },
        ],
      },
    },
  ],
});

const operationExample = JSON.stringify(
  {
    intent: "Add a note to the canvas",
    ops: [
      {
        op: "add_block",
        block: {
          id: "next-steps",
          type: "text",
          content: "## Next steps\n\nConnect your own data source and let AI operations shape this workspace.",
        },
      },
    ],
  },
  null,
  2,
);

function VersionBadge() {
  const version = useCanvasSelector((state) => state.version);
  return <span className="version-badge">v{version}</span>;
}

function Demo() {
  const [operations, setOperations] = useState(operationExample);
  const [feedback, setFeedback] = useState("Try a sample operation or switch the canvas mode.");
  const [isError, setIsError] = useState(false);

  function applyOperations() {
    const result = routeAIResponse(store, operations);
    if (!result.ok) {
      setFeedback(`${result.stage}: ${result.error}`);
      setIsError(true);
      return;
    }
    setFeedback(`Applied ${result.applied} operation${result.applied === 1 ? "" : "s"}.`);
    setIsError(false);
  }

  function setMode(mode: "document" | "dashboard" | "app") {
    const result = routeAIResponse(store, { ops: [{ op: "set_mode", mode }] });
    if (!result.ok) {
      setFeedback(`${result.stage}: ${result.error}`);
      setIsError(true);
      return;
    }
    setFeedback(`Canvas mode set to ${mode}.`);
    setIsError(false);
  }

  return (
    <CanvasProvider env={{ store, connectors, apps: {} }}>
      <div className="app-shell">
        <header className="topbar">
          <a className="brand" href="/" aria-label="The Canvasium home">
            <span className="brand-mark">C</span>
            <span>The Canvasium</span>
          </a>
          <span className="topbar-label">INTERACTIVE PLAYGROUND</span>
        </header>

        <div className="workspace">
          <aside className="sidebar">
            <div className="eyebrow">WORKSPACE</div>
            <h1>Project overview</h1>
            <p className="sidebar-copy">A live canvas powered by typed blocks, atomic updates, and pluggable data.</p>

            <div className="section-label">CANVAS MODE</div>
            <div className="mode-buttons" aria-label="Canvas mode">
              {(["dashboard", "document", "app"] as const).map((mode) => (
                <button className="mode-button" key={mode} onClick={() => setMode(mode)}>
                  <span className={`mode-dot ${mode}`} />
                  {mode}
                </button>
              ))}
            </div>

            <label className="section-label editor-label" htmlFor="operations">AI OPERATIONS</label>
            <p className="editor-hint">Edit this JSON and apply validated canvas operations.</p>
            <textarea
              id="operations"
              spellCheck={false}
              value={operations}
              onChange={(event) => setOperations(event.target.value)}
            />
            <button className="apply-button" onClick={applyOperations}>Apply operations <span aria-hidden="true">↗</span></button>
            <p className={`feedback${isError ? " error" : ""}`} role="status">{feedback}</p>
            <a className="source-link" href="https://github.com/roime81/The-Canvasium" target="_blank" rel="noreferrer">
              Explore the source <span aria-hidden="true">↗</span>
            </a>
          </aside>

          <section className="canvas-area" aria-label="Canvas preview">
            <div className="canvas-toolbar">
              <div><span className="online-dot" /> Live canvas</div>
              <VersionBadge />
            </div>
            <div className="canvas-surface">
              <CanvasRenderer />
            </div>
            <footer className="canvas-footer">
              <span>Changes are schema-validated before they reach the canvas.</span>
              <span>Built with React + TypeScript</span>
            </footer>
          </section>
        </div>
      </div>
    </CanvasProvider>
  );
}

const root = document.getElementById("root");
if (!root) throw new Error('Missing element with id "root"');
createRoot(root).render(<Demo />);
