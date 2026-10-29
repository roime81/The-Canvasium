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

export class ConnectorRegistry {
  private connectors = new Map<string, DataConnector>();

  register(c: DataConnector): this {
    this.connectors.set(c.id, c);
    return this;
  }

  async execute(query: DataQuery, ctx: QueryContext = {}): Promise<QueryResult> {
    const c = this.connectors.get(query.connector);
    if (!c) throw new Error(`No connector registered for "${query.connector}"`);
    return c.execute(query, ctx);
  }
}
