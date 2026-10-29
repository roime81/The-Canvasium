import type { DataQuery } from "../schema/canvas";
import type { DataConnector, QueryContext, QueryResult } from "./types";

/** Inject any DuckDB runtime (duckdb-wasm, node-api) as a plain function. */
export type SqlExecutor = (sql: string, params: Record<string, unknown>) => Promise<QueryResult>;

export class DuckDbConnector implements DataConnector {
  readonly id = "duckdb";
  constructor(private run: SqlExecutor) {}
  execute(q: DataQuery): Promise<QueryResult> {
    return this.run(q.statement, q.params);
  }
}

/** Calls Microsoft Graph; `statement` is a Graph path such as "/sites/{id}/lists". */
export class GraphConnector implements DataConnector {
  readonly id = "graph";
  constructor(
    private getToken: () => Promise<string>,
    private baseUrl = "https://graph.microsoft.com/v1.0",
  ) {}
  async execute(q: DataQuery, ctx: QueryContext): Promise<QueryResult> {
    if (!q.statement.startsWith("/")) throw new Error("Graph statement must be a path starting with '/'");
    const res = await fetch(this.baseUrl + q.statement, {
      headers: { Authorization: `Bearer ${await this.getToken()}` },
      signal: ctx.signal ?? null,
    });
    if (!res.ok) throw new Error(`Graph request failed: ${res.status}`);
    const body = (await res.json()) as { value?: Record<string, unknown>[] };
    const rows = body.value ?? [];
    return { columns: Object.keys(rows[0] ?? {}), rows };
  }
}

/** RAG over uploaded files: `statement` is the natural-language query. */
export interface VectorIndex {
  search(text: string, opts: { topK: number; signal?: AbortSignal }): Promise<{ id: string; score: number; text: string }[]>;
}

export class VectorSearchConnector implements DataConnector {
  readonly id = "vector";
  constructor(private index: VectorIndex) {}
  async execute(q: DataQuery, ctx: QueryContext): Promise<QueryResult> {
    const topK = typeof q.params.topK === "number" ? q.params.topK : 5;
    const rows = await this.index.search(q.statement, ctx.signal ? { topK, signal: ctx.signal } : { topK });
    return { columns: ["id", "score", "text"], rows };
  }
}
