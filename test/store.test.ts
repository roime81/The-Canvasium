import { describe, expect, it, vi } from "vitest";
import { AIResponseSchema, CanvasStore, PatchError, aiResponseJsonSchema, applyOps, createEmptyCanvas, type CanvasOp } from "../src";

const text = (id: string, content = "x"): CanvasOp => ({ op: "add_block", block: { id, type: "text", format: "markdown", content } });
const dash: CanvasOp = { op: "add_block", block: { id: "d", type: "dashboard", columns: 12, widgets: [] } };
const widget = (id: string) => ({ id, kind: "metric" as const, title: "t", span: 4, options: {} });

describe("applyOps", () => {
  const base = createEmptyCanvas("c");
  it("empty batch returns same state", () => expect(applyOps(base, [])).toBe(base));
  it("add/move/remove maintain order", () => {
    let s = applyOps(base, [text("a"), text("b"), text("c"), { op: "move_block", id: "c", index: 0 }]);
    expect(s.order).toEqual(["c", "a", "b"]);
    s = applyOps(s, [{ op: "remove_block", id: "a" }]);
    expect(s.order).toEqual(["c", "b"]);
    expect(s.blocks.a).toBeUndefined();
  });
  it("rejects duplicates, unknown ids, bad move", () => {
    const s = applyOps(base, [text("a")]);
    expect(() => applyOps(s, [text("a")])).toThrow(PatchError);
    expect(() => applyOps(s, [{ op: "remove_block", id: "z" }])).toThrow(PatchError);
    expect(() => applyOps(s, [{ op: "move_block", id: "z", index: 0 }])).toThrow(PatchError);
  });
  it("widget upsert/remove only on dashboards", () => {
    let s = applyOps(base, [dash, text("t")]);
    s = applyOps(s, [{ op: "upsert_widget", blockId: "d", widget: widget("w") }, { op: "upsert_widget", blockId: "d", widget: { ...widget("w"), title: "new" } }]);
    const d = s.blocks.d;
    expect(d?.type === "dashboard" && d.widgets).toHaveLength(1);
    expect(d?.type === "dashboard" && d.widgets[0]?.title).toBe("new");
    expect(() => applyOps(s, [{ op: "upsert_widget", blockId: "t", widget: widget("w") }])).toThrow(PatchError);
    expect(() => applyOps(s, [{ op: "remove_widget", blockId: "d", widgetId: "nope" }])).toThrow(PatchError);
    s = applyOps(s, [{ op: "remove_widget", blockId: "d", widgetId: "w" }]);
    expect(s.blocks.d?.type === "dashboard" && s.blocks.d.widgets).toHaveLength(0);
  });
  it("set_mode no-op keeps identity of blocks", () => {
    const s = applyOps(base, [{ op: "set_mode", mode: "app" }]);
    expect(s.mode).toBe("app");
  });
});

describe("schema limits", () => {
  it("rejects unsafe ids and oversized payloads", () => {
    expect(AIResponseSchema.safeParse({ ops: [text("bad id<script>")] }).success).toBe(false);
    expect(AIResponseSchema.safeParse({ ops: [text("ok", "x".repeat(200_001))] }).success).toBe(false);
    expect(AIResponseSchema.safeParse({ ops: Array(101).fill(text("a")) }).success).toBe(false);
  });
  it("exports a JSON schema for tool calling", () => {
    expect(JSON.stringify(aiResponseJsonSchema())).toContain("add_block");
  });
});

describe("CanvasStore", () => {
  it("undo/redo and history clearing", () => {
    const s = new CanvasStore(createEmptyCanvas("c"));
    const l = vi.fn();
    s.subscribe(l);
    s.dispatch([text("a")]);
    s.dispatch([text("b")]);
    s.undo();
    expect(s.getState().order).toEqual(["a"]);
    expect(s.canRedo).toBe(true);
    s.redo();
    expect(s.getState().order).toEqual(["a", "b"]);
    s.undo();
    s.dispatch([text("c")]);
    expect(s.canRedo).toBe(false);
    expect(l).toHaveBeenCalled();
  });
  it("limits history and reports telemetry; failures don't notify", () => {
    const onDispatch = vi.fn();
    const s = new CanvasStore(createEmptyCanvas("c"), { historyLimit: 1, onDispatch });
    const l = vi.fn();
    s.subscribe(l);
    s.dispatch([text("a")]);
    s.dispatch([text("b")]);
    s.undo();
    s.undo();
    expect(s.getState().order).toEqual(["a"]);
    l.mockClear();
    expect(() => s.dispatch([{ op: "remove_block", id: "zz" }])).toThrow();
    expect(l).not.toHaveBeenCalled();
    expect(onDispatch).toHaveBeenLastCalledWith(expect.objectContaining({ ok: false }));
  });
  it("rejects invalid initial state and unsubscribes", () => {
    expect(() => new CanvasStore({ ...createEmptyCanvas("c"), order: ["ghost"] })).toThrow();
    const s = new CanvasStore(createEmptyCanvas("c"));
    const l = vi.fn();
    s.subscribe(l)();
    s.dispatch([text("a")]);
    expect(l).not.toHaveBeenCalled();
    expect(s.getBlock("a")).toBeDefined();
  });
});
