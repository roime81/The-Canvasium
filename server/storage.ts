import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { CanvasState } from "../src/schema/canvas";

export type PromptStatus = "applied" | "rejected" | "error";

export interface TrackedEvent {
  id: string;
  at: string;
  workspaceId: string;
  prompt: string;
  category: string;
  source: "ai" | "template";
  status: PromptStatus;
  opsApplied: number;
  blocksAdded: number;
  durationMs: number;
  error?: string;
}

export interface Database {
  workspaces: Record<string, CanvasState>;
  events: TrackedEvent[];
}

const MAX_EVENTS = 5000;

/** JSON-file persistence. All mutations run serially so concurrent prompts never lose updates. */
export class Storage {
  private db: Database | null = null;
  private queue: Promise<unknown> = Promise.resolve();

  constructor(private file: string) {}

  private async load(): Promise<Database> {
    if (this.db) return this.db;
    try {
      const raw = JSON.parse(await readFile(this.file, "utf8")) as Partial<Database>;
      this.db = { workspaces: raw.workspaces ?? {}, events: raw.events ?? [] };
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
      this.db = { workspaces: {}, events: [] };
    }
    return this.db;
  }

  /** Read-only snapshot access (also serialized behind pending writes). */
  read<T>(fn: (db: Database) => T): Promise<T> {
    return this.enqueue(async () => fn(await this.load()));
  }

  /** Runs `fn` exclusively, then persists the database. */
  transaction<T>(fn: (db: Database) => T | Promise<T>): Promise<T> {
    return this.enqueue(async () => {
      const db = await this.load();
      const result = await fn(db);
      if (db.events.length > MAX_EVENTS) db.events.splice(0, db.events.length - MAX_EVENTS);
      await mkdir(dirname(this.file), { recursive: true });
      const tmp = `${this.file}.tmp`;
      await writeFile(tmp, JSON.stringify(db, null, 2));
      await rename(tmp, this.file);
      return result;
    });
  }

  private enqueue<T>(job: () => Promise<T>): Promise<T> {
    const run = this.queue.then(job, job);
    this.queue = run.catch(() => undefined);
    return run;
  }
}
