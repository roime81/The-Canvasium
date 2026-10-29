import type { CanvasOp } from "../schema/ai";
import { CanvasStateSchema, type Block, type CanvasState } from "../schema/canvas";
import { applyOps } from "./patch";

type Listener = () => void;

/** Minimal external store compatible with React's useSyncExternalStore. */
export class CanvasStore {
  private state: CanvasState;
  private listeners = new Set<Listener>();

  constructor(initial: CanvasState) {
    this.state = initial;
  }

  getState = (): CanvasState => this.state;

  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  /** Atomically applies ops; throws PatchError (state unchanged) on failure. */
  dispatch = (ops: readonly CanvasOp[]): void => {
    const next = applyOps(this.state, ops);
    if (next === this.state) return;
    this.state = next;
    this.listeners.forEach((l) => l());
  };

  /** Replaces the whole state (e.g. with a server snapshot) after validating it. */
  replace = (next: CanvasState): void => {
    this.state = CanvasStateSchema.parse(next);
    this.listeners.forEach((l) => l());
  };

  getBlock = (id: string): Block | undefined => this.state.blocks[id];
}
