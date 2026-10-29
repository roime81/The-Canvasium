import { describe, expect, it } from "vitest";
import { CanvasStateSchema } from "../src/index";

describe("CanvasStateSchema", () => {
  it("accepts a document canvas with attached local source metadata", () => {
    const result = CanvasStateSchema.safeParse({
      canvasId: "canvas-1",
      title: "Weekly report",
      connectedSources: [{
        id: "file-1",
        kind: "file",
        name: "sales.csv",
        fileName: "sales.csv",
        mimeType: "text/csv",
        size: 128,
        columns: [{ name: "revenue", type: "number" }],
      }],
      activeLayoutMode: "document",
      blocks: [{ id: "title", type: "heading", level: 1, content: "Weekly report" }],
    });

    expect(result.success).toBe(true);
  });

  it("rejects a dashboard widget with an invalid grid width", () => {
    const result = CanvasStateSchema.safeParse({
      canvasId: "canvas-1",
      title: "Sales",
      connectedSources: [],
      activeLayoutMode: "dashboard",
      blocks: [{
        id: "revenue",
        type: "bi_widget",
        widgetType: "bar",
        title: "Revenue",
        dataSourceId: "sales-csv",
        spec: { kind: "duckdb-sql", sql: "SELECT revenue FROM sales" },
        layout: { x: 0, y: 0, w: 0, h: 2 },
      }],
    });

    expect(result.success).toBe(false);
  });
});
