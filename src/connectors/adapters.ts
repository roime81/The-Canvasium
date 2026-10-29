import type { DataQuery } from "../schema/canvas";
import { ConnectorError, type DataConnector, type QueryContext, type QueryResult } from "./types";

/** Inject any DuckDB runtime (duckdb-wasm, node-api) as a plain function. */
export type SqlExecutor = (sql: string, params: Record<string, unknown>, ctx: QueryContext) => Promise<QueryResult>;

const READ_ONLY_SQL = /^\s*(select|with|describe|summarize|show)\b/i;
const FORBIDDEN_SQL =
  /\b(insert|update|delete|drop|alter|create|attach|detach|copy|export|import|install|load|pragma|call|set|truncate|read_(csv|parquet|json|text|blob)\w*|glob)\b/i;

/**
 * AI-authored SQL is untrusted. This guard is defence-in-depth only: the injected executor
 * MUST also run on a read-only connection with external file/network access disabled.
 */
export function assertReadOnlySql(sql: string): void {
  const stripped = sql
    .replace(/--[^\n]*/g, " ")
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/'(?:[^']|'')*'/g, "''")
    .replace(/"(?:[^"]|"")*"/g, '""')
    .trim()
    .replace(/;\s*$/, "");
  if (stripped.includes(";")) throw new ConnectorError("Multiple SQL statements are not allowed", "rejected");
  if (!READ_ONLY_SQL.test(stripped)) throw new ConnectorError("Only read-only SQL is allowed", "rejected");
  if (FORBIDDEN_SQL.test(stripped)) throw new ConnectorError("SQL contains a forbidden keyword", "rejected");
}

export class DuckDbConnector implements DataConnector {
  readonly id = "duckdb";
  constructor(private run: SqlExecutor) {}
  execute(q: DataQuery, ctx: QueryContext): Promise<QueryResult> {
    assertReadOnlySql(q.statement);
    return this.run(q.statement, q.params, ctx);
  }
}

export interface GraphOptions {
  getToken: () => Promise<string>;
  baseUrl?: string;
  /** Allowed path prefixes, e.g. ["/sites/", "/drives/"]. Defaults to SharePoint-relevant roots. */
  allowedPrefixes?: readonly string[];
  maxPages?: number;
  fetchImpl?: typeof fetch;
}

/** Read-only Microsoft Graph connector; `statement` is a Graph path such as "/sites/{id}/lists". */
export class GraphConnector implements DataConnector {
  readonly id = "graph";
  private readonly base: string;
  private readonly prefixes: readonly string[];
  private readonly maxPages: number;
  private readonly fetchImpl: typeof fetch;

  constructor(private readonly o: GraphOptions) {
    this.base = o.baseUrl ?? "https://graph.microsoft.com/v1.0";
    this.prefixes = o.allowedPrefixes ?? ["/sites/", "/drives/", "/me/drive/"];
    this.maxPages = o.maxPages ?? 5;
    this.fetchImpl = o.fetchImpl ?? ((...a) => fetch(...a));
  }

  async execute(q: DataQuery, ctx: QueryContext): Promise<QueryResult> {
    const path = q.statement;
    if (!path.startsWith("/") || path.startsWith("//") || path.includes("..") || path.includes("\\")) {
      throw new ConnectorError("Invalid Graph path", "rejected");
    }
    if (!this.prefixes.some((p) => path.startsWith(p))) throw new ConnectorError("Graph path not allowed", "rejected");

    const origin = new URL(this.base).origin;
    const rows: Record<string, unknown>[] = [];
    let url: string | undefined = this.base + path;
    for (let page = 0; url && page < this.maxPages; page++) {
      // Follow @odata.nextLink only on the same origin so the bearer token never leaks.
      if (new URL(url).origin !== origin) throw new ConnectorError("Cross-origin pagination blocked", "rejected");
      const res = await this.fetchImpl(url, {
        headers: { Authorization: `Bearer ${await this.o.getToken()}`, Accept: "application/json" },
        redirect: "error",
        signal: ctx.signal ?? null,
      });
      if (!res.ok) throw new ConnectorError(`Graph request failed: ${res.status}`, "failed");
      const body = (await res.json()) as { value?: Record<string, unknown>[]; "@odata.nextLink"?: string };
      if (Array.isArray(body.value)) rows.push(...body.value);
      else if (page === 0) rows.push(body as Record<string, unknown>);
      url = body["@odata.nextLink"];
    }
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
    const raw = q.params.topK;
    const topK = typeof raw === "number" && Number.isInteger(raw) ? Math.min(Math.max(raw, 1), 50) : 5;
    const rows = await this.index.search(q.statement, ctx.signal ? { topK, signal: ctx.signal } : { topK });
    return { columns: ["id", "score", "text"], rows };
  }
}
