import { describe, expect, it, vi } from "vitest";
import { createEmptyCanvas } from "../src/schema/canvas";
import { requestCanvasChanges } from "../src/demo/promptClient";

describe("requestCanvasChanges", () => {
  it("sends the prompt and current canvas to the configured endpoint", async () => {
    const response = { ops: [{ op: "set_mode", mode: "document" }] };
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify(response), { status: 200 }),
    );
    const canvas = createEmptyCanvas("workspace");

    await expect(requestCanvasChanges("/api/ai", "Plan my week", canvas, fetcher)).resolves.toEqual(response);
    expect(fetcher).toHaveBeenCalledWith("/api/ai", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt: "Plan my week", canvas }),
    });
  });

  it("surfaces non-success responses from the configured endpoint", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response("Provider unavailable", { status: 503 }));

    await expect(requestCanvasChanges("/api/ai", "Plan my week", createEmptyCanvas("workspace"), fetcher))
      .rejects.toThrow("Provider unavailable");
  });
});
