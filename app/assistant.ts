import { aiResponseJsonSchema, type AIResponse, type CanvasState } from "../src";
import { DATASETS } from "./data";

export interface LlmSettings {
  apiKey: string;
  baseUrl: string;
  model: string;
}

export const DEFAULT_LLM: LlmSettings = { apiKey: "", baseUrl: "https://api.openai.com/v1", model: "gpt-4o-mini" };

const uid = (p: string) => `${p}-${Math.random().toString(36).slice(2, 8)}`;

const DATASET_HINTS: Record<string, { kind: "metric" | "chart" | "table"; title: string; span: number }> = {
  total_revenue: { kind: "metric", title: "Total revenue (k$)", span: 4 },
  total_customers: { kind: "metric", title: "Customers", span: 4 },
  churn_rate: { kind: "metric", title: "Churn %", span: 4 },
  sales_by_month: { kind: "chart", title: "Revenue by month (k$)", span: 8 },
  sales_by_region: { kind: "chart", title: "Revenue by region (k$)", span: 6 },
  top_customers: { kind: "table", title: "Top customers", span: 6 },
};

const widget = (dataset: string) => {
  const h = DATASET_HINTS[dataset] ?? { kind: "table" as const, title: dataset, span: 6 };
  return {
    id: uid("w"),
    kind: h.kind,
    title: h.title,
    span: h.span,
    query: { connector: "sample", statement: dataset, params: {} },
    options: {},
  };
};

/**
 * Keyless fallback so the app is usable immediately. Handles a few intents with keyword rules;
 * connect an LLM in Settings for open-ended requests.
 */
export function offlineAssistant(input: string, state: CanvasState): AIResponse {
  const t = input.trim();
  const l = t.toLowerCase();
  const dashId = state.order.find((id) => state.blocks[id]?.type === "dashboard");

  if (/^(clear|reset|start over)/.test(l)) {
    return { message: "Canvas cleared.", ops: state.order.map((id) => ({ op: "remove_block" as const, id })) };
  }
  const note = /^(?:add )?(?:a )?(?:note|text|paragraph|doc(?:ument)?)\s*[:\-]?\s*(.+)$/is.exec(t);
  if (note?.[1]) {
    return {
      message: "Added a text block.",
      ops: [{ op: "add_block", block: { id: uid("text"), type: "text", format: "markdown", content: note[1] } }],
    };
  }
  if (/dashboard|analytics|kpi|sales|revenue|report/.test(l)) {
    const wanted = Object.keys(DATASETS).filter((d) => d.split("_").some((w) => w.length > 3 && l.includes(w)));
    const sets = wanted.length ? wanted : ["total_revenue", "total_customers", "churn_rate", "sales_by_month", "sales_by_region", "top_customers"];
    if (dashId) {
      return { message: "Updated the dashboard.", ops: sets.map((d) => ({ op: "upsert_widget" as const, blockId: dashId, widget: widget(d) })) };
    }
    return {
      message: "Switched to dashboard mode with live widgets.",
      ops: [
        { op: "set_mode", mode: "dashboard" },
        { op: "add_block", block: { id: uid("dash"), type: "dashboard", columns: 12, widgets: sets.map(widget) } },
      ],
    };
  }
  if (/counter|app|tool|calculator/.test(l)) {
    return {
      message: "Added an interactive counter app.",
      ops: [{ op: "set_mode", mode: "app" }, { op: "add_block", block: { id: uid("app"), type: "app", appId: "counter", props: { label: "Counter" } } }],
    };
  }
  return {
    message: 'Offline mode understands: "note: …", "show a sales dashboard", "add a counter app", "clear". Add an API key in Settings for free-form requests.',
    ops: [],
  };
}

const SYSTEM_PROMPT = (schema: unknown) =>
  `You control a generative UI canvas. Reply with ONLY a JSON object matching this JSON Schema (no prose):
${JSON.stringify(schema)}

Rules:
- Use "ops" to modify the canvas. Block types: "text" (markdown content), "dashboard" (widgets), "app" (appId "counter" is available).
- Widgets must use query {"connector":"sample","statement":<dataset>,"params":{}}. Datasets: ${Object.keys(DATASETS).join(", ")}.
- Widget kinds: "metric" (single value dataset: total_revenue,total_customers,churn_rate), "chart" (label + numeric column), "table".
- Ids: letters, digits, _ . : - only. Reuse existing ids to update; never re-add an existing id.
- Set "mode" to match the content (document, dashboard, app) with a set_mode op.
- Put a short reply for the user in "message".`;

export async function llmAssistant(input: string, state: CanvasState, s: LlmSettings, feedback?: string, signal?: AbortSignal): Promise<unknown> {
  const messages = [
    { role: "system", content: SYSTEM_PROMPT(aiResponseJsonSchema()) },
    { role: "user", content: `Current canvas state:\n${JSON.stringify(state)}\n\nRequest: ${input}${feedback ? `\n\nYour previous reply was rejected: ${feedback}\nFix it.` : ""}` },
  ];
  const res = await fetch(`${s.baseUrl.replace(/\/$/, "")}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${s.apiKey}` },
    body: JSON.stringify({ model: s.model, messages, response_format: { type: "json_object" }, temperature: 0.2 }),
    signal: signal ?? null,
  });
  if (!res.ok) throw new Error(`LLM request failed (${res.status}): ${(await res.text()).slice(0, 200)}`);
  const body = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  const content = body.choices?.[0]?.message?.content;
  if (!content) throw new Error("LLM returned no content");
  return content;
}
