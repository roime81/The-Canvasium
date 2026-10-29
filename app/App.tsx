import { useRef, useState, useSyncExternalStore } from "react";
import {
  CanvasProvider,
  CanvasRenderer,
  CanvasStateSchema,
  CanvasStore,
  ConnectorRegistry,
  createEmptyCanvas,
  parseAIResponse,
  routeAIResponse,
  type AppBlock,
  type CanvasEnv,
  type CanvasState,
} from "../src";
import { DEFAULT_LLM, llmAssistant, offlineAssistant, type LlmSettings } from "./assistant";
import { sampleConnector } from "./data";
import { renderMarkdown } from "./markdown";

const STATE_KEY = "canvasium.state.v1";
const LLM_KEY = "canvasium.llm.v1";

function loadState(): CanvasState {
  try {
    const raw = localStorage.getItem(STATE_KEY);
    if (raw) {
      const parsed = CanvasStateSchema.safeParse(JSON.parse(raw));
      if (parsed.success) return parsed.data;
    }
  } catch {
    /* corrupt storage falls through to a fresh canvas */
  }
  return createEmptyCanvas("main");
}

function loadLlm(): LlmSettings {
  try {
    return { ...DEFAULT_LLM, ...(JSON.parse(localStorage.getItem(LLM_KEY) ?? "{}") as Partial<LlmSettings>) };
  } catch {
    return DEFAULT_LLM;
  }
}

function Counter({ block }: { block: AppBlock }) {
  const [n, setN] = useState(0);
  const label = typeof block.props.label === "string" ? block.props.label : "Counter";
  return (
    <div className="counter" data-block={block.id}>
      <strong>{label}</strong>
      <button onClick={() => setN(n - 1)}>−</button>
      <span>{n}</span>
      <button onClick={() => setN(n + 1)}>+</button>
    </div>
  );
}

interface Msg {
  role: "user" | "assistant" | "error";
  text: string;
}

export function App() {
  const storeRef = useRef<CanvasStore | null>(null);
  const envRef = useRef<CanvasEnv | null>(null);
  if (!storeRef.current) {
    storeRef.current = new CanvasStore(loadState());
    storeRef.current.subscribe(() => {
      try {
        localStorage.setItem(STATE_KEY, JSON.stringify(storeRef.current?.getState()));
      } catch {
        /* quota errors must not break the canvas */
      }
    });
    envRef.current = {
      store: storeRef.current,
      connectors: new ConnectorRegistry({ dedupe: true }).register(sampleConnector),
      apps: { counter: Counter },
      renderMarkdown,
    };
  }
  const store = storeRef.current;
  const env = envRef.current as CanvasEnv;
  const state = useSyncExternalStore(store.subscribe, store.getState);

  const [msgs, setMsgs] = useState<Msg[]>([
    { role: "assistant", text: 'Try: "show a sales dashboard", "note: # Hello", or "add a counter app". Paste raw JSON ops too.' },
  ]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [llm, setLlm] = useState<LlmSettings>(loadLlm);
  const [showSettings, setShowSettings] = useState(false);
  const [showJson, setShowJson] = useState(false);

  const say = (m: Msg) => setMsgs((x) => [...x, m]);

  async function submit() {
    const text = input.trim();
    if (!text || busy) return;
    setInput("");
    say({ role: "user", text });
    setBusy(true);
    try {
      if (text.startsWith("{")) {
        const r = routeAIResponse(store, text);
        say(r.ok ? { role: "assistant", text: r.response.message ?? `Applied ${r.applied} ops.` } : { role: "error", text: r.error });
      } else if (llm.apiKey) {
        let feedback: string | undefined;
        for (let attempt = 0; attempt < 2; attempt++) {
          const raw = await llmAssistant(text, store.getState(), llm, feedback);
          const r = routeAIResponse(store, raw);
          if (r.ok) {
            say({ role: "assistant", text: r.response.message ?? `Applied ${r.applied} ops.` });
            return;
          }
          feedback = r.error;
        }
        say({ role: "error", text: `The model's reply was invalid: ${feedback}` });
      } else {
        const response = offlineAssistant(text, store.getState());
        const parsed = parseAIResponse(response);
        if (!parsed.ok) throw new Error(parsed.error);
        const r = routeAIResponse(store, response);
        say(r.ok ? { role: "assistant", text: response.message ?? "Done." } : { role: "error", text: r.error });
      }
    } catch (e) {
      say({ role: "error", text: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(false);
    }
  }

  function saveLlm(next: LlmSettings) {
    setLlm(next);
    localStorage.setItem(LLM_KEY, JSON.stringify(next));
  }

  return (
    <div className="shell">
      <aside className="panel">
        <header>
          <h1>The Canvasium</h1>
          <div className="row">
            <button disabled={!store.canUndo} onClick={store.undo}>Undo</button>
            <button disabled={!store.canRedo} onClick={store.redo}>Redo</button>
            <button onClick={() => setShowSettings((v) => !v)}>Settings</button>
          </div>
          <small>{llm.apiKey ? `LLM: ${llm.model}` : "Offline assistant (no API key)"}</small>
        </header>

        {showSettings && (
          <section className="settings">
            <label>API base URL<input value={llm.baseUrl} onChange={(e) => saveLlm({ ...llm, baseUrl: e.target.value })} /></label>
            <label>Model<input value={llm.model} onChange={(e) => saveLlm({ ...llm, model: e.target.value })} /></label>
            <label>API key<input type="password" value={llm.apiKey} onChange={(e) => saveLlm({ ...llm, apiKey: e.target.value })} autoComplete="off" /></label>
            <small>Any OpenAI-compatible endpoint. The key is stored only in this browser (localStorage) and sent directly to that endpoint. For shared deployments, route through your own backend proxy instead.</small>
          </section>
        )}

        <div className="log" aria-live="polite">
          {msgs.map((m, i) => (
            <p key={i} className={`msg ${m.role}`}>{m.text}</p>
          ))}
          {busy && <p className="msg assistant">Thinking…</p>}
        </div>

        <form onSubmit={(e) => { e.preventDefault(); void submit(); }}>
          <textarea
            value={input}
            placeholder="Describe what you want on the canvas…"
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void submit(); } }}
            rows={3}
          />
          <button type="submit" disabled={busy || !input.trim()}>Send</button>
        </form>
      </aside>

      <section className="canvas">
        <div className="bar">
          <span>mode: <b>{state.mode}</b> · blocks: {state.order.length} · v{state.version}</span>
          <button onClick={() => setShowJson((v) => !v)}>{showJson ? "Hide" : "Show"} state JSON</button>
        </div>
        {state.order.length === 0 && <p className="empty">Canvas is empty. Ask for something on the left.</p>}
        <CanvasProvider env={env}>
          <CanvasRenderer onBlockError={(id, err) => say({ role: "error", text: `Block ${id} failed: ${err.message}` })} />
        </CanvasProvider>
        {showJson && <pre className="json">{JSON.stringify(state, null, 2)}</pre>}
      </section>
    </div>
  );
}
