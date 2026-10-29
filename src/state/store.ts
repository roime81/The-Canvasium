import type { CanvasOp } from "../schema/ai";
import { CanvasStateSchema, type Block, type CanvasState } from "../schema/canvas";
import { applyOps } from "./patch";

type Listener = () => void;

export interface StoreOptions {
  /** Max undo entries retained. */
  historyLimit?: number;
  /** Observability hook, called after every successful or failed dispatch. */
  onDispatch?: (e: { ok: boolean; ops: readonly CanvasOp[]; error?: Error; version: number }) => void;
}

/** Minimal external store compatible with React's useSyncExternalStore. */
export class CanvasStore {
  private state: CanvasState;
  private listeners = new Set<Listener>();
  private past: CanvasState[] = [];
  private future: CanvasState[] = [];
  private readonly historyLimit: number;

  constructor(initial: CanvasState, private readonly opts: StoreOptions = {}) {
    this.state = CanvasStateSchema.parse(initial);
    this.historyLimit = opts.historyLimit ?? 100;
  }

  getState = (): CanvasState => this.state;

  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  /** Atomically applies ops; throws PatchError (state unchanged) on failure. */
  dispatch = (ops: readonly CanvasOp[]): void => {
    let next: CanvasState;
    try {
      next = applyOps(this.state, ops);
    } catch (e) {
      this.opts.onDispatch?.({ ok: false, ops, error: e as Error, version: this.state.version });
      throw e;
    }
    if (next === this.state) return;
    this.past.push(this.state);
    if (this.past.length > this.historyLimit) this.past.shift();
    this.future = [];
    this.commit(next);
    this.opts.onDispatch?.({ ok: true, ops, version: next.version });
  };

  get canUndo(): boolean {
    return this.past.length > 0;
  }
  get canRedo(): boolean {
    return this.future.length > 0;
  }

  undo = (): void => {
    const prev = this.past.pop();
    if (!prev) return;
    this.future.push(this.state);
    this.commit(prev);
  };

  redo = (): void => {
    const next = this.future.pop();
    if (!next) return;
    this.past.push(this.state);
    this.commit(next);
  };

  getBlock = (id: string): Block | undefined => this.state.blocks[id];

  private commit(next: CanvasState): void {
    this.state = next;
    // Snapshot so a listener that unsubscribes during notification can't skip others.
    [...this.listeners].forEach((l) => l());
  }
}
