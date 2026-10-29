import { describe, expect, it, vi } from "vitest";
import { createEmptyCanvas } from "../src/schema/canvas";
import { listWorkspaces, loadWorkspace, loadWorkspaceHistory, sendPrompt } from "../src/demo/promptClient";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

describe("prompt client", () => {
  it("posts the prompt and workspace id", async () => {
    const result = { workspaceId: "w", source: "template", applied: 1, message: "ok", canvas: createEmptyCanvas("w") };
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(json(result));
    await expect(sendPrompt("w", "Plan my week", fetcher)).resolves.toEqual(result);
    expect(fetcher).toHaveBeenCalledWith("/api/prompt", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ workspaceId: "w", prompt: "Plan my week" }),
    });
  });

  it("surfaces the server's error message", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(json({ error: "Provider unavailable" }, 502));
    await expect(sendPrompt("w", "x", fetcher)).rejects.toThrow("Provider unavailable");
  });

  it("falls back to the HTTP status when the error body is not JSON", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response("oops", { status: 500 }));
    await expect(sendPrompt("w", "x", fetcher)).rejects.toThrow("HTTP 500");
  });

  it("loads and lists workspaces", async () => {
    const canvas = createEmptyCanvas("a");
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async (input) =>
      String(input) === "/api/workspaces" ? json({ workspaces: [{ id: "a", blocks: 0, version: 0 }] }) : json({ workspaceId: "a", canvas }),
    );
    await expect(loadWorkspace("a", fetcher)).resolves.toEqual(canvas);
    await expect(listWorkspaces(fetcher)).resolves.toEqual([{ id: "a", blocks: 0, version: 0 }]);
  });

  it("loads workspace prompt history", async () => {
    const history = [{ id: "e1", at: "2026-03-04T10:00:00Z", prompt: "Plan my week", category: "weekly-plan", status: "applied", source: "template" }];
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(json({ history }));
    await expect(loadWorkspaceHistory("a b", fetcher)).resolves.toEqual(history);
    expect(fetcher).toHaveBeenCalledWith("/api/workspaces/a%20b/history");
  });
});
