import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { CanvasStore, HttpConnector, StaticConnector, createEmptyCanvas, renderBasicMarkdown } from "../src";

describe("StaticConnector", () => {
  it("returns inline rows and infers columns", async () => {
    const c = new StaticConnector();
    const q = { connector: "static", statement: "static" };
    await expect(c.execute({ ...q, params: { columns: ["a"], rows: [{ a: 1 }, "junk"] } })).resolves.toEqual({ columns: ["a"], rows: [{ a: 1 }] });
    await expect(c.execute({ ...q, params: { rows: [{ x: 1, y: 2 }] } })).resolves.toMatchObject({ columns: ["x", "y"] });
    await expect(c.execute({ ...q, params: {} })).resolves.toEqual({ columns: [], rows: [] });
  });
});

describe("HttpConnector", () => {
  it("fetches the encoded statement path and errors on failure", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(new Response('{"columns":["n"],"rows":[{"n":1}]}')).mockResolvedValueOnce(new Response("", { status: 500 }));
    const c = new HttpConnector("tracker", "/api/tracker", fetcher);
    await expect(c.execute({ connector: "tracker", statement: "by day", params: {} }, {})).resolves.toEqual({ columns: ["n"], rows: [{ n: 1 }] });
    expect(fetcher.mock.calls[0]?.[0]).toBe("/api/tracker/by%20day");
    await expect(c.execute({ connector: "tracker", statement: "x", params: {} }, {})).rejects.toThrow("500");
  });
});

describe("CanvasStore.replace", () => {
  it("validates and notifies", () => {
    const store = new CanvasStore(createEmptyCanvas("a"));
    const listener = vi.fn();
    store.subscribe(listener);
    store.replace({ ...createEmptyCanvas("b"), version: 3 });
    expect(store.getState()).toMatchObject({ id: "b", version: 3 });
    expect(listener).toHaveBeenCalledTimes(1);
    expect(() => store.replace({ ...createEmptyCanvas("b"), order: ["ghost"] })).toThrow();
    expect(store.getState().id).toBe("b");
  });
});

describe("renderBasicMarkdown", () => {
  const html = (src: string) => renderToStaticMarkup(createElement("div", null, renderBasicMarkdown(src)));

  it("renders headings, lists, task lists and inline emphasis", () => {
    const out = html("## Title\n\nSome **bold** and `code`.\n\n- [ ] todo\n- [x] done\n\n1. one\n2. two");
    expect(out).toContain("<h2>Title</h2>");
    expect(out).toContain("<strong>bold</strong>");
    expect(out).toContain("<code>code</code>");
    expect(out).toContain('type="checkbox"');
    expect(out).toContain("<ol>");
  });

  it("never injects raw HTML", () => {
    const out = html('<script>alert(1)</script> <img src=x onerror=alert(1)>');
    expect(out).not.toContain("<script>");
    expect(out).not.toContain("<img");
    expect(out).toContain("&lt;script&gt;");
  });
});
