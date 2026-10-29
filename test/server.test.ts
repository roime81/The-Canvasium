import { mkdtemp, rm } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createApi } from "../server/app";
import { detectCategory } from "../server/planner";
import { OpenAiCompatibleProvider, type Provider } from "../server/provider";
import { createEmptyCanvas } from "../src/schema/canvas";

let dir: string;
let server: Server;
let base: string;

async function start(provider?: Provider | null) {
  const api = createApi({ dataFile: join(dir, "db.json"), provider: provider ?? null, now: () => new Date("2026-03-04T10:00:00Z") });
  server = createServer(async (req, res) => {
    if (!(await api(req, res))) res.writeHead(404).end();
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

const post = (body: unknown, headers: Record<string, string> = { "Content-Type": "application/json" }) =>
  fetch(`${base}/api/prompt`, { method: "POST", headers, body: typeof body === "string" ? body : JSON.stringify(body) });
const tracker = async (name: string) => (await fetch(`${base}/api/tracker/${name}`)).json() as Promise<{ columns: string[]; rows: Record<string, unknown>[] }>;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "canvasium-"));
});
afterEach(async () => {
  await new Promise((resolve) => server.close(resolve));
  await rm(dir, { recursive: true, force: true });
});

describe("prompt API (built-in templates)", () => {
  it("creates a workspace, persists it, and tracks the prompt", async () => {
    await start();
    const res = await post({ workspaceId: "w1", prompt: "Create a project tracker for a product launch" });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { applied: number; source: string; canvas: { order: string[]; version: number } };
    expect(body.source).toBe("template");
    expect(body.canvas.order.length).toBeGreaterThan(2);
    expect(body.canvas.version).toBe(1);

    const stored = (await (await fetch(`${base}/api/workspaces/w1`)).json()) as { canvas: { order: string[] } };
    expect(stored.canvas.order).toEqual(body.canvas.order);
    const history = (await (await fetch(`${base}/api/workspaces/w1/history`)).json()) as { history: { prompt: string; status: string }[] };
    expect(history.history).toEqual([expect.objectContaining({ prompt: "Create a project tracker for a product launch", status: "applied" })]);

    expect((await tracker("prompts")).rows[0]).toEqual({ Prompts: 1 });
    expect((await tracker("success-rate")).rows[0]).toEqual({ "Success rate": "100%" });
    expect((await tracker("workspaces")).rows[0]).toEqual({ Workspaces: 1 });
    expect((await tracker("by-category")).rows).toEqual([{ Category: "project", Prompts: 1, Applied: 1 }]);
    const recent = (await tracker("recent-activity")).rows[0];
    expect(recent).toMatchObject({ Workspace: "w1", Category: "project", Status: "applied" });
    const byDay = (await tracker("by-day")).rows;
    expect(byDay).toHaveLength(7);
    expect(byDay[6]).toEqual({ Day: "2026-03-04", Prompts: 1, Applied: 1 });
  });

  it("keeps ids unique across repeated prompts in one workspace", async () => {
    await start();
    for (let i = 0; i < 2; i++) expect((await post({ workspaceId: "w", prompt: "plan my week" })).status).toBe(200);
    const stored = (await (await fetch(`${base}/api/workspaces/w`)).json()) as { canvas: { order: string[]; version: number } };
    expect(new Set(stored.canvas.order).size).toBe(stored.canvas.order.length);
    expect(stored.canvas.version).toBe(2);
  });

  it("validates input", async () => {
    await start();
    expect((await post({ prompt: "   " })).status).toBe(400);
    expect((await post({ prompt: "x".repeat(4001) })).status).toBe(400);
    expect((await post({ prompt: "ok", workspaceId: "../etc" })).status).toBe(400);
    expect((await post("{nope")).status).toBe(400);
    expect((await post({ prompt: "ok" }, { "Content-Type": "text/plain" })).status).toBe(415);
    expect((await fetch(`${base}/api/prompt`)).status).toBe(405);
    expect((await fetch(`${base}/api/tracker/constructor`)).status).toBe(404);
    expect((await fetch(`${base}/api/workspaces/%2e%2e%2fetc/history`)).status).toBe(400);
    expect((await fetch(`${base}/api/nope`)).status).toBe(404);
  });

  it("survives concurrent prompts without losing updates", async () => {
    await start();
    await Promise.all(Array.from({ length: 5 }, () => post({ workspaceId: "c", prompt: "meeting notes" })));
    const stored = (await (await fetch(`${base}/api/workspaces/c`)).json()) as { canvas: { version: number } };
    expect(stored.canvas.version).toBe(5);
    expect((await tracker("prompts")).rows[0]).toEqual({ Prompts: 5 });
  });
});

describe("prompt API (AI provider)", () => {
  it("applies valid provider output", async () => {
    await start({
      name: "fake",
      generate: async () =>
        '```json\n{"message":"Added a note","ops":[{"op":"add_block","block":{"id":"n","type":"text","content":"hello"}}]}\n```',
    });
    const body = (await (await post({ prompt: "add a note" })).json()) as { message: string; source: string; canvas: { order: string[] } };
    expect(body).toMatchObject({ message: "Added a note", source: "ai" });
    expect(body.canvas.order).toEqual(["n"]);
  });

  it("rejects invalid provider output without changing the workspace, and tracks it", async () => {
    await start({ name: "fake", generate: async () => ({ ops: [{ op: "remove_block", id: "missing" }] }) });
    const res = await post({ workspaceId: "w", prompt: "break it" });
    expect(res.status).toBe(422);
    const stored = (await (await fetch(`${base}/api/workspaces/w`)).json()) as { canvas: { order: string[]; version: number } };
    expect(stored.canvas).toMatchObject({ order: [], version: 0 });
    expect((await tracker("success-rate")).rows[0]).toEqual({ "Success rate": "0%" });
    expect((await tracker("recent-activity")).rows[0]?.Status).toMatch(/^rejected: patch/);
  });

  it("reports provider failures as 502 and tracks them", async () => {
    await start({ name: "fake", generate: async () => { throw new Error("provider returned HTTP 500"); } });
    const res = await post({ prompt: "hi" });
    expect(res.status).toBe(502);
    expect(((await res.json()) as { error: string }).error).toContain("provider returned HTTP 500");
    expect((await tracker("recent-activity")).rows[0]?.Status).toMatch(/^error:/);
  });
});

describe("OpenAiCompatibleProvider", () => {
  it("sends an authorized chat-completions request and returns the message content", async () => {
    let seen: { url: string; init: RequestInit } | undefined;
    const provider = new OpenAiCompatibleProvider("https://ai.example/v1/chat/completions", "secret", "m", async (url, init) => {
      seen = { url: String(url), init: init ?? {} };
      return new Response(JSON.stringify({ choices: [{ message: { content: '{"ops":[]}' } }] }));
    });
    await expect(provider.generate("plan", createEmptyCanvas("w"))).resolves.toBe('{"ops":[]}');
    expect(seen?.url).toBe("https://ai.example/v1/chat/completions");
    expect((seen?.init.headers as Record<string, string>).Authorization).toBe("Bearer secret");
    const sent = JSON.parse(String(seen?.init.body)) as { model: string; messages: { content: string }[] };
    expect(sent.model).toBe("m");
    expect(sent.messages[1]?.content).toContain("User request: plan");
  });

  it("does not echo credentials or bodies in errors", async () => {
    const provider = new OpenAiCompatibleProvider("https://ai.example", "secret", "m", async () => new Response("secret leaked", { status: 401 }));
    await expect(provider.generate("x", createEmptyCanvas("w"))).rejects.toThrow(/^provider returned HTTP 401$/);
  });
});

describe("detectCategory", () => {
  it("classifies common productivity prompts", () => {
    expect(detectCategory("Help me plan my week")).toBe("weekly-plan");
    expect(detectCategory("Create a meeting notes workspace")).toBe("meeting");
    expect(detectCategory("Build a habit tracker")).toBe("habits");
    expect(detectCategory("Research a topic")).toBe("research");
    expect(detectCategory("project tracker for a launch")).toBe("project");
    expect(detectCategory("do something")).toBe("general");
  });
});
