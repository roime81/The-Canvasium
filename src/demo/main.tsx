import { useEffect, useState, type FormEvent } from "react";
import { createRoot } from "react-dom/client";
import { StaticConnector } from "../connectors/adapters";
import { ConnectorRegistry } from "../connectors/types";
import { createEmptyCanvas, type CanvasMode } from "../schema/canvas";
import { CanvasStore } from "../state/store";
import { CanvasProvider, useCanvasEnv, useCanvasSelector } from "../ui/context";
import { CanvasRenderer } from "../ui/CanvasRenderer";
import { renderBasicMarkdown } from "../ui/markdown";
import { listWorkspaces, loadWorkspace, sendPrompt } from "./promptClient";
import "./style.css";

const WORKSPACE_KEY = "canvasium.workspace";
const readWorkspaceId = () => {
  try {
    return localStorage.getItem(WORKSPACE_KEY) || "default";
  } catch {
    return "default";
  }
};

const store = new CanvasStore(createEmptyCanvas("default", "dashboard"));
const connectors = new ConnectorRegistry().register(new StaticConnector());
const env = { store, connectors, apps: {}, renderMarkdown: renderBasicMarkdown };

const examples = [
  { title: "Plan my week", prompt: "Help me plan my week. Create a weekly planner with priorities, time blocks, and a short list of goals." },
  { title: "Track a project", prompt: "Create a project tracker for a product launch with milestones, owners, status, and next actions." },
  { title: "Organize meeting notes", prompt: "Create a meeting notes workspace with an agenda, decisions, action items, owners, and due dates." },
  { title: "Build a habit tracker", prompt: "Build a simple habit tracker with a weekly view, daily checkboxes, and a reflection section." },
  { title: "Research a topic", prompt: "Create a research brief for a topic I am exploring, with questions, sources, findings, and open items." },
  { title: "Start from scratch", prompt: "Create a workspace for my current goal. Ask me a clarifying question if you need more detail." },
];

type ConversationMessage = { role: "you" | "canvasium"; content: string };

function VersionBadge() {
  const version = useCanvasSelector((state) => state.version);
  return <span className="version-badge">v{version}</span>;
}

function EmptyHint() {
  const empty = useCanvasSelector((state) => state.order.length === 0);
  return empty ? <p className="empty-hint">Your workspace is empty. Describe a goal above or pick a starter to create your first blocks.</p> : null;
}

const canvasModes: { mode: CanvasMode; label: string }[] = [
  { mode: "dashboard", label: "Dashboard" },
  { mode: "document", label: "Document" },
  { mode: "app", label: "App" },
];

function CanvasModePicker() {
  const { store } = useCanvasEnv();
  const mode = useCanvasSelector((state) => state.mode);

  return (
    <div className="mode-buttons" role="group" aria-label="Canvas mode">
      {canvasModes.map(({ mode: nextMode, label }) => (
        <button
          className="mode-button"
          key={nextMode}
          type="button"
          aria-pressed={mode === nextMode}
          onClick={() => store.dispatch([{ op: "set_mode", mode: nextMode }])}
        >
          <span className={`mode-dot ${nextMode}`} aria-hidden="true" />
          {label}
        </button>
      ))}
    </div>
  );
}

function Demo() {
  const [workspaceId, setWorkspaceId] = useState(readWorkspaceId);
  const [known, setKnown] = useState<string[]>([]);
  const [prompt, setPrompt] = useState("");
  const [messages, setMessages] = useState<ConversationMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [isError, setIsError] = useState(false);

  const fail = (text: string) => {
    setFeedback(text);
    setIsError(true);
  };

  useEffect(() => {
    let cancelled = false;
    try {
      localStorage.setItem(WORKSPACE_KEY, workspaceId);
    } catch {
      // storage may be unavailable (private mode); the workspace id then lasts for this session only
    }
    loadWorkspace(workspaceId)
      .then((canvas) => !cancelled && store.replace(canvas))
      .catch((error: unknown) => {
        if (cancelled) return;
        store.replace(createEmptyCanvas(workspaceId, "dashboard"));
        fail(`Could not load this workspace: ${error instanceof Error ? error.message : "server unreachable"}`);
      });
    listWorkspaces()
      .then((list) => !cancelled && setKnown(list.map((w) => w.id)))
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [workspaceId]);

  async function submitPrompt(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const request = prompt.trim();
    if (!request || isLoading) return;

    setMessages((current) => [...current, { role: "you", content: request }]);
    setFeedback("Thinking through your request…");
    setIsError(false);
    setIsLoading(true);
    try {
      const result = await sendPrompt(workspaceId, request);
      store.replace(result.canvas);
      setFeedback(result.message);
      setMessages((current) => [...current, { role: "canvasium", content: result.message }]);
      setKnown((current) => (current.includes(workspaceId) ? current : [...current, workspaceId]));
      setPrompt("");
    } catch (error) {
      const reason = error instanceof Error ? error.message : "The server could not be reached.";
      fail(reason);
      setMessages((current) => [...current, { role: "canvasium", content: "That didn't work, and your workspace was not changed." }]);
    } finally {
      setIsLoading(false);
    }
  }

  function newWorkspace() {
    setWorkspaceId(`ws-${Date.now().toString(36)}`);
    setMessages([]);
    setFeedback("Started a new workspace.");
    setIsError(false);
  }

  const options = known.includes(workspaceId) ? known : [workspaceId, ...known];

  return (
    <CanvasProvider env={env}>
      <div className="app-shell">
        <header className="topbar">
          <a className="brand" href="/" aria-label="The Canvasium home">
            <span className="brand-mark">C</span>
            <span>The Canvasium</span>
          </a>
          <nav className="topbar-nav" aria-label="Pages">
            <a className="active" href="/" aria-current="page">Workspace</a>
            <a href="/tracker">Tracker</a>
          </nav>
        </header>

        <div className="workspace">
          <aside className="sidebar">
            <div className="eyebrow">MAKE IT YOURS</div>
            <h2>Start with a goal</h2>
            <p className="sidebar-copy">Choose an idea or write a prompt for the work you want to get done.</p>

            <div className="section-label">TRY A STARTER</div>
            <nav className="starter-list" aria-label="Prompt examples">
              {examples.map((example) => (
                <button className="starter-button" key={example.title} onClick={() => setPrompt(example.prompt)}>
                  <span>{example.title}</span><span className="starter-arrow" aria-hidden="true">↗</span>
                </button>
              ))}
            </nav>

            <div className="section-label mode-label">CANVAS MODE</div>
            <CanvasModePicker />

            <label className="section-label mode-label" htmlFor="workspace-select">WORKSPACE</label>
            <select id="workspace-select" className="workspace-select" value={workspaceId} onChange={(e) => { setWorkspaceId(e.target.value); setMessages([]); }}>
              {options.map((id) => <option key={id} value={id}>{id}</option>)}
            </select>
            <button className="mode-button new-workspace" onClick={newWorkspace}>+ New workspace</button>

            <a className="source-link" href="https://github.com/roime81/The-Canvasium" target="_blank" rel="noreferrer">
              Explore the source <span aria-hidden="true">↗</span>
            </a>
          </aside>

          <div className="main-column">
            <section className="prompt-section">
              <div className="eyebrow">YOUR PRODUCTIVITY, YOUR WAY</div>
              <h1>What would you like to get done?</h1>
              <p className="hero-copy">Describe a goal, a process, or a tool you wish you had. Canvasium will shape your workspace around it, and your progress shows up in the tracker.</p>

              <form className="prompt-form" onSubmit={submitPrompt}>
                <label className="visually-hidden" htmlFor="goal-prompt">Describe what you want to get done</label>
                <textarea
                  id="goal-prompt"
                  value={prompt}
                  onChange={(event) => setPrompt(event.target.value)}
                  placeholder="For example: Help me organize a product launch, track the milestones, and keep my team focused on next steps."
                  rows={3}
                  maxLength={4000}
                  disabled={isLoading}
                />
                <div className="prompt-controls">
                  <span className="prompt-hint">Be specific or start broad. You can refine it as you go.</span>
                  <button className="submit-button" type="submit" disabled={isLoading || !prompt.trim()}>
                    {isLoading ? "Creating…" : "Create workspace"}
                    <span aria-hidden="true">{isLoading ? "…" : "↗"}</span>
                  </button>
                </div>
              </form>
              {feedback && <p className={`feedback${isError ? " error" : ""}`} role="status">{feedback}</p>}
            </section>

            {messages.length > 0 && (
              <section className="conversation" aria-label="Prompt history" aria-live="polite">
                {messages.slice(-4).map((message, index) => (
                  <article className={`message ${message.role}`} key={`${messages.length}-${index}`}>
                    <span className="message-label">{message.role === "you" ? "YOU" : "CANVASIUM"}</span>
                    <p>{message.content}</p>
                  </article>
                ))}
              </section>
            )}

            <section className="canvas-section" aria-label="Your productivity workspace">
              <div className="canvas-toolbar">
                <div><span className="online-dot" /> Workspace <code>{workspaceId}</code></div>
                <VersionBadge />
              </div>
              <div className="canvas-surface">
                <CanvasRenderer />
                <EmptyHint />
              </div>
              <footer className="canvas-footer">
                <span>AI changes are validated before they reach your workspace.</span>
                <span>Built with React + TypeScript</span>
              </footer>
            </section>
          </div>
        </div>
      </div>
    </CanvasProvider>
  );
}

const root = document.getElementById("root");
if (!root) throw new Error('Missing element with id "root"');
createRoot(root).render(<Demo />);
