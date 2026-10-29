import { BlockSchema, CanvasStateSchema, type Block, type CanvasState } from "../schema/canvas";
import type { CanvasOp } from "../schema/ai";

export class PatchError extends Error {
  constructor(message: string, readonly opIndex: number) {
    super(`op[${opIndex}]: ${message}`);
    this.name = "PatchError";
  }
}

const clamp = (n: number, max: number) => Math.min(Math.max(n, 0), max);

function applyOp(state: CanvasState, op: CanvasOp, i: number): CanvasState {
  switch (op.op) {
    case "add_block": {
      if (state.blocks[op.block.id]) throw new PatchError(`block "${op.block.id}" already exists`, i);
      const order = state.order.slice();
      order.splice(clamp(op.index ?? order.length, order.length), 0, op.block.id);
      return { ...state, order, blocks: { ...state.blocks, [op.block.id]: op.block } };
    }
    case "update_block": {
      const prev = state.blocks[op.id];
      if (!prev) throw new PatchError(`unknown block "${op.id}"`, i);
      const parsed = BlockSchema.safeParse({ ...prev, ...op.changes });
      if (!parsed.success) throw new PatchError(parsed.error.issues.map((x) => x.message).join("; "), i);
      const foreign = Object.keys(op.changes).filter((k) => !(k in parsed.data));
      if (foreign.length) throw new PatchError(`fields not valid for ${prev.type} block: ${foreign.join(", ")}`, i);
      return { ...state, blocks: { ...state.blocks, [op.id]: parsed.data } };
    }
    case "remove_block": {
      if (!state.blocks[op.id]) throw new PatchError(`unknown block "${op.id}"`, i);
      const { [op.id]: _removed, ...blocks } = state.blocks;
      return { ...state, blocks, order: state.order.filter((x) => x !== op.id) };
    }
    case "move_block": {
      const from = state.order.indexOf(op.id);
      if (from < 0) throw new PatchError(`unknown block "${op.id}"`, i);
      const order = state.order.slice();
      order.splice(from, 1);
      order.splice(clamp(op.index, order.length), 0, op.id);
      return { ...state, order };
    }
    case "upsert_widget":
    case "remove_widget": {
      const block = state.blocks[op.blockId];
      if (!block || block.type !== "dashboard") throw new PatchError(`"${op.blockId}" is not a dashboard block`, i);
      let widgets = block.widgets;
      if (op.op === "upsert_widget") {
        const idx = widgets.findIndex((w) => w.id === op.widget.id);
        widgets = idx < 0 ? [...widgets, op.widget] : widgets.map((w, k) => (k === idx ? op.widget : w));
      } else {
        if (!widgets.some((w) => w.id === op.widgetId)) throw new PatchError(`unknown widget "${op.widgetId}"`, i);
        widgets = widgets.filter((w) => w.id !== op.widgetId);
      }
      const next: Block = { ...block, widgets };
      return { ...state, blocks: { ...state.blocks, [block.id]: next } };
    }
    case "set_mode":
      return state.mode === op.mode ? state : { ...state, mode: op.mode };
  }
}

/**
 * Pure, atomic reducer: applies all ops or throws PatchError, leaving input untouched.
 * Untouched blocks keep reference identity (structural sharing) so subscribers can skip
 * re-rendering. Returns the same state object for empty batches.
 */
export function applyOps(state: CanvasState, ops: readonly CanvasOp[]): CanvasState {
  if (ops.length === 0) return state;
  let next = state;
  ops.forEach((op, i) => {
    next = applyOp(next, op, i);
  });
  const check = CanvasStateSchema.safeParse(next);
  if (!check.success) throw new PatchError(check.error.issues.map((x) => x.message).join("; "), ops.length - 1);
  return { ...next, version: state.version + 1 };
}
