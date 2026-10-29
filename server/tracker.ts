import type { Database } from "./storage";

export interface TrackerResult {
  columns: string[];
  rows: Record<string, string | number>[];
}

const day = (iso: string) => iso.slice(0, 10);
const pct = (part: number, total: number) => (total ? `${Math.round((part / total) * 100)}%` : "—");

const single = (column: string, value: string | number): TrackerResult => ({ columns: [column], rows: [{ [column]: value }] });

const countByDay = (db: Database, now: Date) => {
  const days: string[] = [];
  for (let i = 6; i >= 0; i--) days.push(day(new Date(now.getTime() - i * 86_400_000).toISOString()));
  return days.map((d) => {
    const events = db.events.filter((e) => day(e.at) === d);
    return { Day: d, Prompts: events.length, Applied: events.filter((e) => e.status === "applied").length };
  });
};

/** Each statement backs one widget in the tracker dashboard (read via the HTTP connector). */
export const trackerQueries: Record<string, (db: Database, now: Date) => TrackerResult> = {
  prompts: (db) => single("Prompts", db.events.length),
  "success-rate": (db) => single("Success rate", pct(db.events.filter((e) => e.status === "applied").length, db.events.length)),
  workspaces: (db) => single("Workspaces", Object.keys(db.workspaces).length),
  blocks: (db) => single("Blocks created", Object.values(db.workspaces).reduce((n, w) => n + w.order.length, 0)),
  "recent-activity": (db) => ({
    columns: ["When", "Workspace", "Prompt", "Category", "Status", "Changes", "Time (ms)"],
    rows: db.events
      .slice(-15)
      .reverse()
      .map((e) => ({
        When: e.at.replace("T", " ").slice(0, 19),
        Workspace: e.workspaceId,
        Prompt: e.prompt.length > 80 ? `${e.prompt.slice(0, 77)}…` : e.prompt,
        Category: e.category,
        Status: e.error ? `${e.status}: ${e.error.slice(0, 60)}` : e.status,
        Changes: e.opsApplied,
        "Time (ms)": e.durationMs,
      })),
  }),
  "by-category": (db) => {
    const groups = new Map<string, { total: number; applied: number }>();
    for (const e of db.events) {
      const g = groups.get(e.category) ?? { total: 0, applied: 0 };
      g.total++;
      if (e.status === "applied") g.applied++;
      groups.set(e.category, g);
    }
    return {
      columns: ["Category", "Prompts", "Applied"],
      rows: [...groups].sort((a, b) => b[1].total - a[1].total).map(([Category, g]) => ({ Category, Prompts: g.total, Applied: g.applied })),
    };
  },
  "by-day": (db, now) => ({ columns: ["Day", "Prompts", "Applied"], rows: countByDay(db, now) }),
  "workspace-list": (db) => ({
    columns: ["Workspace", "Blocks", "Version", "Prompts", "Last activity"],
    rows: Object.entries(db.workspaces).map(([id, w]) => {
      const events = db.events.filter((e) => e.workspaceId === id);
      const last = events[events.length - 1]?.at;
      return { Workspace: id, Blocks: w.order.length, Version: w.version, Prompts: events.length, "Last activity": last ? last.replace("T", " ").slice(0, 19) : "—" };
    }),
  }),
};
