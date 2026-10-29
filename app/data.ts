import type { DataConnector, QueryResult } from "../src";

type Rows = Record<string, unknown>[];

const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const revenue = [12, 15, 14, 18, 21, 19, 24, 26, 25, 29, 31, 35];

export const DATASETS: Record<string, Rows> = {
  sales_by_month: months.map((month, i) => ({ month, revenue_k: (revenue[i] ?? 0) * 10 })),
  sales_by_region: [
    { region: "EMEA", revenue_k: 820 },
    { region: "AMER", revenue_k: 1140 },
    { region: "APAC", revenue_k: 560 },
    { region: "LATAM", revenue_k: 240 },
  ],
  top_customers: [
    { customer: "Acme Corp", revenue_k: 310, tier: "Enterprise" },
    { customer: "Globex", revenue_k: 255, tier: "Enterprise" },
    { customer: "Initech", revenue_k: 140, tier: "Mid-market" },
    { customer: "Umbrella", revenue_k: 98, tier: "Mid-market" },
    { customer: "Hooli", revenue_k: 64, tier: "SMB" },
  ],
  total_revenue: [{ total_revenue_k: revenue.reduce((a, b) => a + b, 0) * 10 }],
  total_customers: [{ customers: 1284 }],
  churn_rate: [{ churn_pct: 2.7 }],
};

/** Stand-in for DuckDB/Graph/vector connectors: serves named in-memory datasets. */
export const sampleConnector: DataConnector = {
  id: "sample",
  async execute(q): Promise<QueryResult> {
    const rows = DATASETS[q.statement.trim()];
    if (!rows) throw new Error(`Unknown dataset "${q.statement}". Available: ${Object.keys(DATASETS).join(", ")}`);
    return { columns: Object.keys(rows[0] ?? {}), rows };
  },
};
