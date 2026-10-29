import { useState, type FormEvent } from "react";
import { createRoot } from "react-dom/client";
import { ConnectorRegistry } from "../connectors/types";
import { routeAIResponse } from "../router/intentRouter";
import { createEmptyCanvas, type DataQuery } from "../schema/canvas";
import { CanvasStore } from "../state/store";
import { CanvasProvider, useCanvasSelector } from "../ui/context";
import { CanvasRenderer } from "../ui/CanvasRenderer";
import { requestCanvasChanges } from "./promptClient";
import "./style.css";

const AI_ENDPOINT = import.meta.env.VITE_CANVASIUM_AI_ENDPOINT?.trim();
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

function Demo() {
  const [prompt, setPrompt] = useState("");
  const [messages, setMessages] = useState<ConversationMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [isError, setIsError] = useState(false);

  async function submitPrompt(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const request = prompt.trim();
    if (!request || isLoading) return;
    if (!AI_ENDPOINT) {
      setFeedback("Connect an AI backend by setting VITE_CANVASIUM_AI_ENDPOINT. See .env.example.");
      setIsError(true);
      return;
    }

    setMessages((current) => [...current, { role: "you", content: request }]);
    setFeedback("Thinking through your request…");
    setIsError(false);
    setIsLoading(true);

    try {
      const generated = await requestCanvasChanges(AI_ENDPOINT, request, store.getState());
      const result = routeAIResponse(store, generated);
      if (!result.ok) {
        setFeedback(`The AI response was not applied (${result.stage}): ${result.error}`);
        setIsError(true);
        setMessages((current) => [
          ...current,
          { role: "canvasium", content: "I couldn't apply that response. Please refine your request and try again." },
        ]);
        return;
      }

      const summary =
        result.response.message ??
        `Done — I applied ${result.applied} change${result.applied === 1 ? "" : "s"} to your workspace.`;
      setFeedback(summary);
      setIsError(false);
      setMessages((current) => [...current, { role: "canvasium", content: summary }]);
      setPrompt("");
    } catch (error) {
      const reason = error instanceof Error ? error.message : "The AI service could not be reached.";
      setFeedback(`${reason} Check your backend endpoint and try again.`);
      setIsError(true);
      setMessages((current) => [
        ...current,
        { role: "canvasium", content: "I couldn't reach the AI service. Your workspace was not changed." },
      ]);
    } finally {
      setIsLoading(false);
    }
  }

  function setMode(mode: "document" | "dashboard" | "app") {
    const result = routeAIResponse(store, { ops: [{ op: "set_mode", mode }] });
    if (!result.ok) {
      setFeedback(`${result.stage}: ${result.error}`);
      setIsError(true);
      return;
    }
    setFeedback(`Workspace view set to ${mode}.`);
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
          <span className="topbar-label">A WORKSPACE FOR YOUR WORK</span>
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

            <div className="section-label mode-label">WORKSPACE VIEW</div>
            <div className="mode-buttons" aria-label="Workspace view">
              {(["dashboard", "document", "app"] as const).map((mode) => (
                <button className="mode-button" key={mode} onClick={() => setMode(mode)}>
                  <span className={`mode-dot ${mode}`} />
                  {mode}
                </button>
              ))}
            </div>

            <a className="source-link" href="https://github.com/roime81/The-Canvasium" target="_blank" rel="noreferrer">
              Explore the source <span aria-hidden="true">↗</span>
            </a>
          </aside>

          <main className="main-column">
            <section className="prompt-section">
              <div className="eyebrow">YOUR PRODUCTIVITY, YOUR WAY</div>
              <h1>What would you like to get done?</h1>
              <p className="hero-copy">Describe a goal, a process, or a tool you wish you had. Canvasium will shape your workspace around it.</p>

              <form className="prompt-form" onSubmit={submitPrompt}>
                <label className="visually-hidden" htmlFor="goal-prompt">Describe what you want to get done</label>
                <textarea
                  id="goal-prompt"
                  value={prompt}
                  onChange={(event) => setPrompt(event.target.value)}
                  placeholder="For example: Help me organize a product launch, track the milestones, and keep my team focused on next steps."
                  rows={3}
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

              <div className="endpoint-note">
                <span className={`endpoint-dot${AI_ENDPOINT ? " connected" : ""}`} />
                {AI_ENDPOINT
                  ? "AI backend connected"
                  : <>To enable prompts, configure <code>VITE_CANVASIUM_AI_ENDPOINT</code> in your backend environment.</>}
              </div>
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
                <div><span className="online-dot" /> Your workspace</div>
                <VersionBadge />
              </div>
              <div className="canvas-surface">
                <CanvasRenderer />
              </div>
              <footer className="canvas-footer">
                <span>AI changes are validated before they reach your workspace.</span>
                <span>Built with React + TypeScript</span>
              </footer>
            </section>
          </main>
        </div>
      </div>
    </CanvasProvider>
  );
}

const root = document.getElementById("root");
if (!root) throw new Error('Missing element with id "root"');
createRoot(root).render(<Demo />);
