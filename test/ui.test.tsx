import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CanvasProvider, CanvasRenderer, CanvasStore, ConnectorRegistry, createEmptyCanvas, routeAIResponse, type CanvasEnv } from "../src";

afterEach(cleanup);

function setup(over: Partial<CanvasEnv> = {}, onBlockError?: () => void) {
  const store = new CanvasStore(createEmptyCanvas("c"));
  const connectors = new ConnectorRegistry().register({
    id: "m",
    execute: async () => ({ columns: ["n"], rows: [{ n: 42 }] }),
  });
  const env: CanvasEnv = { store, connectors, apps: {}, ...over };
  render(
    <CanvasProvider env={env}>
      <CanvasRenderer {...(onBlockError ? { onBlockError } : {})} />
    </CanvasProvider>,
  );
  return store;
}

describe("CanvasRenderer", () => {
  it("only re-renders the patched block", () => {
    const renders: string[] = [];
    const Probe = ({ block }: { block: { id: string } }) => {
      renders.push(block.id);
      return <i>{block.id}</i>;
    };
    const store = setup({ apps: { probe: Probe } });
    act(() => {
      routeAIResponse(store, {
        ops: [
          { op: "add_block", block: { id: "a", type: "app", appId: "probe", props: {} } },
          { op: "add_block", block: { id: "b", type: "text", content: "hello" } },
        ],
      });
    });
    const before = renders.length;
    act(() => {
      routeAIResponse(store, { ops: [{ op: "update_block", id: "b", changes: { content: "changed" } }] });
    });
    expect(screen.getByText("changed")).toBeTruthy();
    expect(renders.length).toBe(before);
  });

  it("renders dashboard widgets from connectors and surfaces errors", async () => {
    const store = setup();
    act(() => {
      routeAIResponse(store, {
        ops: [
          {
            op: "add_block",
            block: {
              id: "d",
              type: "dashboard",
              widgets: [
                { id: "w1", kind: "metric", title: "M", query: { connector: "m", statement: "x" } },
                { id: "w2", kind: "table", title: "Bad", query: { connector: "missing", statement: "x" } },
              ],
            },
          },
        ],
      });
    });
    await waitFor(() => expect(screen.getByText("42")).toBeTruthy());
    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("missing"));
  });

  it("shows unknown app fallback and isolates crashing blocks", () => {
    const onError = vi.fn();
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const Boom = (): never => {
      throw new Error("boom");
    };
    const store = setup({ apps: { boom: Boom } }, onError);
    act(() => {
      routeAIResponse(store, {
        ops: [
          { op: "add_block", block: { id: "a", type: "app", appId: "boom", props: {} } },
          { op: "add_block", block: { id: "b", type: "app", appId: "nope", props: {} } },
          { op: "add_block", block: { id: "c", type: "text", content: "still here" } },
        ],
      });
    });
    expect(screen.getByText("still here")).toBeTruthy();
    expect(onError).toHaveBeenCalledWith("a", expect.any(Error), expect.anything());
    expect(screen.getAllByRole("alert").length).toBe(2);
    spy.mockRestore();
  });
});
