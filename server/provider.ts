import type { CanvasState } from "../src/schema/canvas";

export interface Provider {
  readonly name: string;
  /** Returns raw model output (JSON text or object); the caller validates it. */
  generate(prompt: string, canvas: CanvasState): Promise<unknown>;
}

const SYSTEM_PROMPT = `You are the planning engine behind Canvasium, a workspace canvas for personal productivity.
Reply with ONLY a JSON object: {"message": string, "ops": Operation[]}. "message" is one friendly sentence for the user.
Operations (use at most 20):
- {"op":"add_block","block":Block,"index"?:number}
- {"op":"update_block","id":string,"changes":{...fields of that block type}}
- {"op":"remove_block","id":string}
- {"op":"move_block","id":string,"index":number}
- {"op":"upsert_widget","blockId":string,"widget":Widget} / {"op":"remove_widget","blockId":string,"widgetId":string}
- {"op":"set_mode","mode":"document"|"dashboard"|"app"}
Blocks:
- text: {"id","type":"text","format":"markdown","content":string}
- dashboard: {"id","type":"dashboard","columns":1-12,"widgets":Widget[]}
Widget: {"id","kind":"metric"|"table","title":string,"span":1-12,"query":{"connector":"static","statement":"static","params":{"columns":string[],"rows":object[]}}}
Rules: ids must be short unique kebab-case and must not collide with existing ids; put all data inline in the "static" connector rows; markdown supports headings, lists, task lists (- [ ]), **bold** and \`code\` only; metric widgets show the first column of the first row. Output nothing except the JSON object.`;

function summarize(canvas: CanvasState): string {
  const blocks = canvas.order.map((id) => {
    const b = canvas.blocks[id];
    if (!b) return { id, type: "missing" };
    return b.type === "text"
      ? { id, type: b.type, preview: b.content.slice(0, 120) }
      : b.type === "dashboard"
        ? { id, type: b.type, widgets: b.widgets.map((w) => w.id) }
        : { id, type: b.type, appId: b.appId };
  });
  return JSON.stringify({ mode: canvas.mode, blocks });
}

/** Any OpenAI-compatible chat-completions endpoint (OpenAI, Azure, Ollama, vLLM, LiteLLM, ...). */
export class OpenAiCompatibleProvider implements Provider {
  readonly name = "openai-compatible";
  constructor(
    private url: string,
    private apiKey: string | undefined,
    private model: string,
    private fetcher: typeof fetch = (...args) => fetch(...args),
  ) {}

  async generate(prompt: string, canvas: CanvasState): Promise<unknown> {
    const res = await this.fetcher(this.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(this.apiKey ? { Authorization: `Bearer ${this.apiKey}` } : {}),
      },
      body: JSON.stringify({
        model: this.model,
        temperature: 0.2,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: `Current workspace: ${summarize(canvas)}\n\nUser request: ${prompt}` },
        ],
      }),
      signal: AbortSignal.timeout(45_000),
    });
    if (!res.ok) throw new Error(`provider returned HTTP ${res.status}`);
    const body = (await res.json()) as { choices?: { message?: { content?: unknown } }[] };
    const content = body.choices?.[0]?.message?.content;
    if (typeof content !== "string") throw new Error("provider returned no message content");
    return content;
  }
}

export function providerFromEnv(env: NodeJS.ProcessEnv): Provider | null {
  const url = env.AI_API_URL?.trim();
  if (!url) return null;
  return new OpenAiCompatibleProvider(url, env.AI_API_KEY?.trim() || undefined, env.AI_MODEL?.trim() || "gpt-4o-mini");
}
