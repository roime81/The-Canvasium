import { describe, expect, it, vi } from "vitest";
import {
  ConnectorError,
  ConnectorRegistry,
  DuckDbConnector,
  GraphConnector,
  VectorSearchConnector,
  assertReadOnlySql,
  type DataConnector,
} from "../src";

const q = (connector: string, statement: string, params = {}) => ({ connector, statement, params });

describe("assertReadOnlySql", () => {
  it.each(["select 1", "WITH a AS (select 1) select * from a", "select 1;", "select 'drop table x'"])("allows %s", (s) =>
    expect(() => assertReadOnlySql(s)).not.toThrow(),
  );
  it.each([
    "drop table t",
    "select 1; drop table t",
    "select * from read_csv('/etc/passwd')",
    "copy t to 'x'",
    "select 1 /* x */; attach 'a'",
    "install httpfs",
  ])("rejects %s", (s) => expect(() => assertReadOnlySql(s)).toThrow(ConnectorError));
});

describe("ConnectorRegistry", () => {
  const slow: DataConnector = { id: "slow", execute: (_q, ctx) => new Promise((_, rej) => ctx.signal?.addEventListener("abort", () => rej(new Error("x")))) };

  it("errors on unknown connector", async () => {
    await expect(new ConnectorRegistry().execute(q("nope", "x"))).rejects.toMatchObject({ code: "not_found" });
  });
  it("times out", async () => {
    const r = new ConnectorRegistry({ timeoutMs: 10 }).register(slow);
    await expect(r.execute(q("slow", "x"))).rejects.toMatchObject({ code: "timeout" });
  });
  it("honours caller abort, including pre-aborted", async () => {
    const r = new ConnectorRegistry().register(slow);
    const c = new AbortController();
    const p = r.execute(q("slow", "x"), { signal: c.signal });
    c.abort();
    await expect(p).rejects.toMatchObject({ code: "aborted" });
    await expect(r.execute(q("slow", "x"), { signal: c.signal })).rejects.toMatchObject({ code: "aborted" });
  });
  it("caps rows and dedupes in-flight queries", async () => {
    const execute = vi.fn(async () => ({ columns: ["a"], rows: [{ a: 1 }, { a: 2 }, { a: 3 }] }));
    const r = new ConnectorRegistry({ maxRows: 2, dedupe: true }).register({ id: "m", execute });
    const [a, b] = await Promise.all([r.execute(q("m", "x")), r.execute(q("m", "x"))]);
    expect(a.rows).toHaveLength(2);
    expect(b).toBe(a);
    expect(execute).toHaveBeenCalledTimes(1);
  });
  it("reports telemetry", async () => {
    const onQuery = vi.fn();
    const r = new ConnectorRegistry({ onQuery }).register({ id: "m", execute: async () => ({ columns: [], rows: [] }) });
    await r.execute(q("m", "x"));
    expect(onQuery).toHaveBeenCalledWith(expect.objectContaining({ connector: "m", ok: true }));
  });
});

describe("adapters", () => {
  it("duckdb rejects writes before executing", async () => {
    const run = vi.fn(async () => ({ columns: [], rows: [] }));
    const c = new DuckDbConnector(run);
    expect(() => c.execute(q("duckdb", "drop table x"), {})).toThrow();
    await c.execute(q("duckdb", "select 1"), {});
    expect(run).toHaveBeenCalledTimes(1);
  });

  it("graph validates paths and paginates same-origin only", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ value: [{ a: 1 }], "@odata.nextLink": "https://graph.microsoft.com/v1.0/sites/x?p=2" })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ value: [{ a: 2 }] })));
    const g = new GraphConnector({ getToken: async () => "t", fetchImpl });
    const res = await g.execute(q("graph", "/sites/x/lists"), {});
    expect(res.rows).toEqual([{ a: 1 }, { a: 2 }]);
    expect(fetchImpl.mock.calls[0]?.[1]).toMatchObject({ redirect: "error" });
    for (const bad of ["//evil.com", "/users/x", "/sites/../me", "sites/x"]) {
      await expect(g.execute(q("graph", bad), {})).rejects.toMatchObject({ code: "rejected" });
    }
  });

  it("graph blocks cross-origin nextLink and surfaces HTTP errors", async () => {
    const evil = vi.fn().mockResolvedValue(new Response(JSON.stringify({ value: [], "@odata.nextLink": "https://evil.com/x" })));
    await expect(new GraphConnector({ getToken: async () => "t", fetchImpl: evil }).execute(q("graph", "/sites/x"), {})).rejects.toMatchObject({ code: "rejected" });
    expect(evil).toHaveBeenCalledTimes(1);
    const bad = vi.fn().mockResolvedValue(new Response("", { status: 403 }));
    await expect(new GraphConnector({ getToken: async () => "t", fetchImpl: bad }).execute(q("graph", "/sites/x"), {})).rejects.toMatchObject({ code: "failed" });
  });

  it("vector clamps topK", async () => {
    const search = vi.fn(async () => []);
    const c = new VectorSearchConnector({ search });
    await c.execute(q("vector", "hello", { topK: 9999 }), {});
    await c.execute(q("vector", "hello", { topK: "x" }), {});
    expect(search.mock.calls.map((x: unknown[]) => (x[1] as { topK: number }).topK)).toEqual([50, 5]);
  });
});
