import { randomUUID } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import { routeAIResponse } from "../src/router/intentRouter";
import { createEmptyCanvas } from "../src/schema/canvas";
import { CanvasStore } from "../src/state/store";
import { detectCategory, planWorkspace } from "./planner";
import type { Provider } from "./provider";
import { Storage, type TrackedEvent } from "./storage";
import { trackerQueries } from "./tracker";

export interface ApiOptions {
  dataFile: string;
  provider?: Provider | null;
  now?: () => Date;
}

class HttpError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}

const MAX_BODY_BYTES = 256 * 1024;
const MAX_PROMPT_CHARS = 4000;
const WORKSPACE_ID = /^[a-z0-9][a-z0-9_-]{0,63}$/i;

function send(res: ServerResponse, status: number, body: unknown) {
  const json = JSON.stringify(body);
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  res.end(json);
}

async function readJson(req: IncomingMessage): Promise<unknown> {
  // Requiring JSON content-type forces a CORS preflight for cross-site requests, which we never approve.
  if (!/^application\/json\b/i.test(req.headers["content-type"] ?? "")) {
    throw new HttpError(415, "Content-Type must be application/json");
  }
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > MAX_BODY_BYTES) throw new HttpError(413, "Request body too large");
    chunks.push(chunk as Buffer);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new HttpError(400, "Invalid JSON body");
  }
}

function workspaceIdOf(value: unknown): string {
  const id = value === undefined ? "default" : value;
  if (typeof id !== "string" || !WORKSPACE_ID.test(id)) throw new HttpError(400, "Invalid workspaceId");
  return id;
}

export function createApi(options: ApiOptions) {
  const storage = new Storage(options.dataFile);
  const provider = options.provider ?? null;
  const now = options.now ?? (() => new Date());

  async function runPrompt(workspaceId: string, prompt: string) {
    const started = Date.now();
    const category = detectCategory(prompt);
    const source: TrackedEvent["source"] = provider ? "ai" : "template";
    const snapshot = await storage.read((db) => db.workspaces[workspaceId] ?? createEmptyCanvas(workspaceId, "dashboard"));

    const base = { workspaceId, prompt, category, source };
    const record = (db: { events: TrackedEvent[] }, event: Omit<TrackedEvent, "id" | "at" | "workspaceId" | "prompt" | "category" | "source" | "durationMs">) =>
      db.events.push({ id: randomUUID(), at: now().toISOString(), durationMs: Date.now() - started, ...base, ...event });

    let generated: unknown;
    try {
      generated = provider ? await provider.generate(prompt, snapshot) : undefined;
    } catch (e) {
      const reason = e instanceof Error ? e.message : "unknown error";
      await storage.transaction((db) => record(db, { status: "error", opsApplied: 0, blocksAdded: 0, error: reason }));
      throw new HttpError(502, `The AI provider failed: ${reason}`);
    }

    // Apply against the latest state inside the lock, so concurrent prompts cannot overwrite each other.
    const outcome = await storage.transaction((db) => {
      const current = db.workspaces[workspaceId] ?? createEmptyCanvas(workspaceId, "dashboard");
      const store = new CanvasStore(current);
      // Templates are instant, so plan against the latest state to keep generated ids collision-free.
      const result = routeAIResponse(store, provider ? generated : planWorkspace(prompt, current));
      if (!result.ok) {
        record(db, { status: "rejected", opsApplied: 0, blocksAdded: 0, error: `${result.stage}: ${result.error}`.slice(0, 300) });
        return { result } as const;
      }
      db.workspaces[workspaceId] = store.getState();
      const blocksAdded = result.response.ops.filter((o) => o.op === "add_block").length;
      record(db, { status: "applied", opsApplied: result.applied, blocksAdded });
      return { result, canvas: store.getState() } as const;
    });

    if (!outcome.result.ok) throw new HttpError(422, `The AI response was not applied (${outcome.result.stage}): ${outcome.result.error}`);
    return {
      workspaceId,
      source,
      applied: outcome.result.applied,
      message: outcome.result.response.message ?? `Applied ${outcome.result.applied} changes to your workspace.`,
      canvas: outcome.canvas,
    };
  }

  /** Returns false when the request is not an API request so the caller can serve the UI. */
  return async function handle(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
    const url = new URL(req.url ?? "/", "http://localhost");
    if (!url.pathname.startsWith("/api/")) return false;
    try {
      const method = req.method ?? "GET";
      const path = url.pathname;
      let match: RegExpExecArray | null;

      if (path === "/api/health") {
        send(res, 200, { ok: true, ai: provider ? provider.name : "built-in templates" });
      } else if (path === "/api/workspaces") {
        if (method !== "GET") throw new HttpError(405, "Method not allowed");
        const workspaces = await storage.read((db) =>
          Object.entries(db.workspaces).map(([id, w]) => ({ id, blocks: w.order.length, version: w.version })),
        );
        send(res, 200, { workspaces });
      } else if ((match = /^\/api\/workspaces\/([^/]+)$/.exec(path))) {
        if (method !== "GET") throw new HttpError(405, "Method not allowed");
        const id = workspaceIdOf(decodeURIComponent(match[1] ?? ""));
        const canvas = await storage.read((db) => db.workspaces[id] ?? createEmptyCanvas(id, "dashboard"));
        send(res, 200, { workspaceId: id, canvas });
      } else if (path === "/api/prompt") {
        if (method !== "POST") throw new HttpError(405, "Method not allowed");
        const body = (await readJson(req)) as { prompt?: unknown; workspaceId?: unknown } | null;
        const prompt = typeof body?.prompt === "string" ? body.prompt.trim() : "";
        if (!prompt) throw new HttpError(400, "A prompt is required");
        if (prompt.length > MAX_PROMPT_CHARS) throw new HttpError(400, `Prompt must be at most ${MAX_PROMPT_CHARS} characters`);
        send(res, 200, await runPrompt(workspaceIdOf(body?.workspaceId), prompt));
      } else if ((match = /^\/api\/tracker\/([^/]+)$/.exec(path))) {
        if (method !== "GET") throw new HttpError(405, "Method not allowed");
        const query = Object.hasOwn(trackerQueries, decodeURIComponent(match[1] ?? ""))
          ? trackerQueries[decodeURIComponent(match[1] ?? "")]
          : undefined;
        if (!query) throw new HttpError(404, "Unknown tracker query");
        send(res, 200, await storage.read((db) => query(db, now())));
      } else {
        throw new HttpError(404, "Not found");
      }
    } catch (e) {
      if (e instanceof HttpError) send(res, e.status, { error: e.message });
      else {
        console.error(e);
        send(res, 500, { error: "Internal server error" });
      }
    }
    return true;
  };
}
