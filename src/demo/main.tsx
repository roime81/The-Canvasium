import { useEffect, useState, type FormEvent } from "react";
import { createRoot } from "react-dom/client";
import { StaticConnector } from "../connectors/adapters";
import { ConnectorRegistry } from "../connectors/types";
import { createEmptyCanvas, type CanvasMode } from "../schema/canvas";
import { CanvasStore } from "../state/store";
import { CanvasProvider, useCanvasEnv, useCanvasSelector } from "../ui/context";
import { CanvasRenderer } from "../ui/CanvasRenderer";
import { renderBasicMarkdown } from "../ui/markdown";
import { listWorkspaces, loadWorkspace, loadWorkspaceHistory, sendPrompt, type PromptHistoryItem } from "./promptClient";
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

type ConversationMessage = { role: "you" | "canvasium"; content: string };
type DialogName = "history" | "how" | null;

const canvasModes: { mode: CanvasMode; label: string }[] = [
  { mode: "dashboard", label: "Dashboard" },
  { mode: "document", label: "Document" },
  { mode: "app", label: "App" },
];

function CanvasModePicker() {
  const { store: canvasStore } = useCanvasEnv();
  const mode = useCanvasSelector((state) => state.mode);

  return (
    <div className="mode-buttons" role="group" aria-label="Canvas mode">
      {canvasModes.map(({ mode: nextMode, label }) => (
        <button
          className="mode-button"
          key={nextMode}
          type="button"
          aria-pressed={mode === nextMode}
          onClick={() => canvasStore.dispatch([{ op: "set_mode", mode: nextMode }])}
        >
          <span className={`mode-dot ${nextMode}`} aria-hidden="true" />
          {label}
        </button>
      ))}
    </div>
  );
}

function Greeting() {
  const empty = useCanvasSelector((state) => state.order.length === 0);
  return empty ? <p className="greeting">Hi!</p> : null;
}

function Demo() {
  const [workspaceId, setWorkspaceId] = useState(readWorkspaceId);
  const [known, setKnown] = useState<string[]>([]);
  const [prompt, setPrompt] = useState("");
  const [messages, setMessages] = useState<ConversationMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [isError, setIsError] = useState(false);
  const [dialog, setDialog] = useState<DialogName>(null);
  const [history, setHistory] = useState<PromptHistoryItem[]>([]);
  const [historyError, setHistoryError] = useState("");
  const [historyLoading, setHistoryLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    try {
      localStorage.setItem(WORKSPACE_KEY, workspaceId);
    } catch {
      // The selected workspace lasts for this session when browser storage is unavailable.
    }
    loadWorkspace(workspaceId)
      .then((canvas) => !cancelled && store.replace(canvas))
      .catch((error: unknown) => {
        if (cancelled) return;
        store.replace(createEmptyCanvas(workspaceId, "dashboard"));
        setFeedback(`Could not load this workspace: ${error instanceof Error ? error.message : "server unreachable"}`);
        setIsError(true);
      });
    listWorkspaces()
      .then((list) => !cancelled && setKnown(list.map((workspace) => workspace.id)))
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [workspaceId]);

  useEffect(() => {
    if (dialog !== "history") return;
    let cancelled = false;
    setHistoryLoading(true);
    setHistoryError("");
    loadWorkspaceHistory(workspaceId)
      .then((items) => !cancelled && setHistory(items))
      .catch((error: unknown) => {
        if (!cancelled) setHistoryError(error instanceof Error ? error.message : "Could not load history.");
      })
      .finally(() => !cancelled && setHistoryLoading(false));
    return () => {
      cancelled = true;
    };
  }, [dialog, workspaceId]);

  async function submitPrompt(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const request = prompt.trim();
    if (!request || isLoading) return;

    setMessages((current) => [...current, { role: "you", content: request }]);
    setFeedback("");
    setIsError(false);
    setIsLoading(true);
    try {
      const result = await sendPrompt(workspaceId, request);
      store.replace(result.canvas);
      setMessages((current) => [...current, { role: "canvasium", content: result.message }]);
      setKnown((current) => (current.includes(workspaceId) ? current : [...current, workspaceId]));
      setPrompt("");
    } catch (error) {
      const reason = error instanceof Error ? error.message : "The server could not be reached.";
      setFeedback(reason);
      setIsError(true);
      setMessages((current) => [...current, { role: "canvasium", content: "That didn't work, and your workspace was not changed." }]);
    } finally {
      setIsLoading(false);
    }
  }

  function newWorkspace() {
    setWorkspaceId(`ws-${Date.now().toString(36)}`);
    setMessages([]);
    setFeedback("");
    setIsError(false);
  }

  const options = known.includes(workspaceId) ? known : [workspaceId, ...known];

  return (
    <CanvasProvider env={env}>
      <main className="canvasium-page">
        <section className="canvasium-panel" aria-label="The Canvasium">
          <h1>The Canvasium</h1>
          <div className="canvasium-conversation" aria-live="polite">
            {messages.length === 0 && <Greeting />}
            {messages.map((message, index) => (
              <article className={`chat-message ${message.role}`} key={`${index}-${message.content}`}>
                <span>{message.role === "you" ? "You" : "The Canvasium"}</span>
                <p>{message.content}</p>
              </article>
            ))}
            <div className="generated-canvas" aria-label="Your workspace">
              <CanvasRenderer />
            </div>
            {isLoading && <p className="chat-status">Thinking…</p>}
            {feedback && <p className={`chat-status${isError ? " error" : ""}`} role="status">{feedback}</p>}
          </div>
          <form className="canvasium-prompt" onSubmit={submitPrompt}>
            <label className="visually-hidden" htmlFor="goal-prompt">Ask The Canvasium</label>
            <textarea
              id="goal-prompt"
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              placeholder=" "
              rows={1}
              maxLength={4000}
              disabled={isLoading}
            />
            <button type="submit" aria-label="Send prompt" disabled={isLoading || !prompt.trim()}>
              <svg viewBox="0 0 28 36" aria-hidden="true"><path d="M2 2 26 18 2 34Z" /></svg>
            </button>
          </form>
          <footer className="canvasium-links">
            <button type="button" onClick={() => setDialog("history")}>My History</button>
            <button type="button" onClick={() => setDialog("how")}>How It Works</button>
          </footer>
        </section>
      </main>
      {dialog && (
        <div className="dialog-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setDialog(null); }}>
          <section className="canvasium-dialog" role="dialog" aria-modal="true" aria-labelledby="dialog-title">
            <button className="dialog-close" type="button" aria-label="Close" onClick={() => setDialog(null)}>×</button>
            {dialog === "history" ? (
              <>
                <h2 id="dialog-title">My History</h2>
                <div className="history-controls">
                  <label htmlFor="workspace-select">Workspace</label>
                  <select id="workspace-select" value={workspaceId} onChange={(event) => { setWorkspaceId(event.target.value); setMessages([]); }}>
                    {options.map((id) => <option key={id} value={id}>{id}</option>)}
                  </select>
                  <button type="button" onClick={newWorkspace}>New workspace</button>
                </div>
                {historyLoading && <p>Loading history…</p>}
                {historyError && <p className="chat-status error" role="alert">{historyError}</p>}
                {!historyLoading && !historyError && history.length === 0 && <p>No prompts in this workspace yet.</p>}
                <ol className="history-list">
                  {history.map((item) => (
                    <li key={item.id}>
                      <p>{item.prompt}</p>
                      <small>{new Date(item.at).toLocaleString()} · {item.status}</small>
                    </li>
                  ))}
                </ol>
              </>
            ) : (
              <>
                <h2 id="dialog-title">How It Works</h2>
                <p>Tell The Canvasium what you want to plan, track, organize, or build. It creates a workspace and saves your prompts in My History.</p>
                <p>Canvas mode changes how your workspace is arranged:</p>
                <CanvasModePicker />
                <p>Prompts use built-in templates unless an AI provider is configured.</p>
                <a className="tracker-link" href="/tracker">Open productivity tracker</a>
              </>
            )}
          </section>
        </div>
      )}
    </CanvasProvider>
  );
}

const root = document.getElementById("root");
if (!root) throw new Error('Missing element with id "root"');
createRoot(root).render(<Demo />);
