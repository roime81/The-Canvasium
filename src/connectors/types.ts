import type { DataQuery } from "../schema/canvas";

export interface QueryContext {
  signal?: AbortSignal;
}

export interface QueryResult {
  columns: string[];
  rows: Record<string, unknown>[];
}

/** Implement this to attach a data source (SharePoint/Graph, DuckDB, vector search, ...). */
export interface DataConnector {
  readonly id: string;
  execute(query: DataQuery, ctx: QueryContext): Promise<QueryResult>;
}

export class ConnectorError extends Error {
  constructor(message: string, readonly code: "not_found" | "timeout" | "rejected" | "failed" | "aborted") {
    super(message);
    this.name = "ConnectorError";
  }
}

export interface RegistryOptions {
  timeoutMs?: number;
  maxRows?: number;
  /** Share one in-flight request between identical concurrent queries. */
  dedupe?: boolean;
  onQuery?: (e: { connector: string; ms: number; ok: boolean; error?: string }) => void;
}

export class ConnectorRegistry {
  private connectors = new Map<string, DataConnector>();
  private inflight = new Map<string, Promise<QueryResult>>();
  private readonly timeoutMs: number;
  private readonly maxRows: number;

  constructor(private readonly opts: RegistryOptions = {}) {
    this.timeoutMs = opts.timeoutMs ?? 15_000;
    this.maxRows = opts.maxRows ?? 10_000;
  }

  register(c: DataConnector): this {
    this.connectors.set(c.id, c);
    return this;
  }

  /** Enforces timeout, caller abort, row cap and optional in-flight dedupe for every connector. */
  execute(query: DataQuery, ctx: QueryContext = {}): Promise<QueryResult> {
    const key = this.opts.dedupe ? JSON.stringify(query) : "";
    if (key && !ctx.signal) {
      const hit = this.inflight.get(key);
      if (hit) return hit;
    }
    const p = this.run(query, ctx);
    if (key && !ctx.signal) {
      this.inflight.set(key, p);
      const clear = () => void this.inflight.delete(key);
      p.then(clear, clear);
    }
    return p;
  }

  private async run(query: DataQuery, ctx: QueryContext): Promise<QueryResult> {
    const c = this.connectors.get(query.connector);
    if (!c) throw new ConnectorError(`No connector registered for "${query.connector}"`, "not_found");
    const ctrl = new AbortController();
    const onAbort = () => ctrl.abort();
    ctx.signal?.addEventListener("abort", onAbort);
    if (ctx.signal?.aborted) ctrl.abort();
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      ctrl.abort();
    }, this.timeoutMs);
    const started = Date.now();
    try {
      const aborted = new Promise<never>((_, reject) => {
        const fail = () =>
          reject(
            timedOut
              ? new ConnectorError(`Query timed out after ${this.timeoutMs}ms`, "timeout")
              : new ConnectorError("Query aborted", "aborted"),
          );
        if (ctrl.signal.aborted) fail();
        else ctrl.signal.addEventListener("abort", fail, { once: true });
      });
      aborted.catch(() => undefined);
      const res = await Promise.race([c.execute(query, { signal: ctrl.signal }), aborted]);
      const out = res.rows.length > this.maxRows ? { ...res, rows: res.rows.slice(0, this.maxRows) } : res;
      this.opts.onQuery?.({ connector: c.id, ms: Date.now() - started, ok: true });
      return out;
    } catch (e) {
      const err = e instanceof ConnectorError ? e : new ConnectorError(e instanceof Error ? e.message : String(e), "failed");
      this.opts.onQuery?.({ connector: c.id, ms: Date.now() - started, ok: false, error: err.code });
      throw err;
    } finally {
      clearTimeout(timer);
      ctx.signal?.removeEventListener("abort", onAbort);
    }
  }
}
