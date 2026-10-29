import { createElement, Profiler } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ConnectorRegistry, CanvasProvider, CanvasRenderer, CanvasStore, createEmptyCanvas, routeAIResponse } from "../src";

const seeded = () => {
  const s = new CanvasStore(createEmptyCanvas("c1"));
  const r = routeAIResponse(s, {
    ops: [
      { op: "add_block", block: { id: "t", type: "text", content: "hi" } },
      { op: "add_block", block: { id: "d", type: "dashboard", widgets: [] } },
    ],
  });
  expect(r.ok).toBe(true);
  return s;
};

describe("router + patch", () => {
  it("applies ops with structural sharing", () => {
    const s = seeded();
    const before = s.getState();
    routeAIResponse(s, { ops: [{ op: "update_block", id: "t", changes: { content: "yo" } }] });
    const after = s.getState();
    expect(after.blocks.d).toBe(before.blocks.d);
    expect(after.blocks.t).not.toBe(before.blocks.t);
    expect(after.version).toBe(before.version + 1);
  });

  it("changes canvas mode through the store", () => {
    const s = seeded();
    s.dispatch([{ op: "set_mode", mode: "document" }]);
    expect(s.getState()).toMatchObject({ mode: "document", version: 2 });
  });

  it("is atomic on failure", () => {
    const s = seeded();
    const before = s.getState();
    const r = routeAIResponse(s, {
      ops: [{ op: "update_block", id: "t", changes: { content: "x" } }, { op: "remove_block", id: "nope" }],
    });
    expect(r).toMatchObject({ ok: false, stage: "patch" });
    expect(s.getState()).toBe(before);
  });

  it("rejects invalid schema and bad JSON, strips code fences", () => {
    const s = seeded();
    expect(routeAIResponse(s, { ops: [{ op: "bogus" }] })).toMatchObject({ ok: false, stage: "parse" });
    expect(routeAIResponse(s, "{nope")).toMatchObject({ ok: false, stage: "json" });
    expect(routeAIResponse(s, '```json\n{"ops":[{"op":"set_mode","mode":"dashboard"}]}\n```').ok).toBe(true);
    expect(s.getState().mode).toBe("dashboard");
  });

  it("rejects cross-type field changes", () => {
    const s = seeded();
    const r = routeAIResponse(s, { ops: [{ op: "update_block", id: "t", changes: { columns: 3 } }] });
    expect(r).toMatchObject({ ok: false, stage: "patch" });
  });
});

describe("renderer", () => {
  it("renders text and dashboard nodes", () => {
    const html = renderToString(
      createElement(
        CanvasProvider,
        { env: { store: seeded(), connectors: new ConnectorRegistry(), apps: {} } },
        createElement(Profiler, { id: "p", onRender: () => {} }, createElement(CanvasRenderer)),
      ),
    );
    expect(html).toContain('data-block="t"');
    expect(html).toContain('data-block="d"');
  });
});
