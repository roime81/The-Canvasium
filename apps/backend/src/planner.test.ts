import { describe, expect, it } from "vitest";
import { CanvasPlanSchema } from "@canvasium/types";
import { createStarterPlan } from "./planner.js";

describe("createStarterPlan", () => {
  it("creates a validated dashboard for analytics prompts", () => {
    const plan = createStarterPlan({ prompt: "Build a sales dashboard", sources: [] });

    expect(plan.activeLayoutMode).toBe("dashboard");
    expect(CanvasPlanSchema.safeParse(plan).success).toBe(true);
  });

  it("uses a ready local source instead of inventing a dataset id", () => {
    const plan = createStarterPlan({
      prompt: "Build a sales dashboard",
      sources: [{
        id: "sales-file",
        kind: "file",
        name: "sales.csv",
        fileName: "sales.csv",
        mimeType: "text/csv",
        size: 128,
        status: "ready",
        columns: [{ name: "revenue", type: "DOUBLE" }],
      }],
    });

    expect(plan.blocks.find((block) => block.type === "bi_widget")?.dataSourceId).toBe("sales-file");
  });

  it("escapes user text before it becomes editable HTML content", () => {
    const plan = createStarterPlan({ prompt: "<script>alert(1)</script>", sources: [] });
    const heading = plan.blocks[0];

    expect(plan.activeLayoutMode).toBe("document");
    expect(heading?.type).toBe("heading");
    if (heading?.type !== "heading") throw new Error("Expected a heading block");
    expect(heading.content).toContain("&lt;script&gt;");
    expect(CanvasPlanSchema.safeParse(plan).success).toBe(true);
  });
});
