import { memo } from "react";
import type { Block } from "../schema/canvas";
import { shallowArrayEqual, useBlock, useCanvasSelector } from "./context";
import { AppNode, DashboardGridNode, TextNode } from "./nodes";

/** Exhaustive switch: adding a block type to the schema fails compilation until handled here. */
export function renderBlock(block: Block) {
  switch (block.type) {
    case "text":
      return <TextNode block={block} />;
    case "dashboard":
      return <DashboardGridNode block={block} />;
    case "app":
      return <AppNode block={block} />;
    default: {
      const _never: never = block;
      return _never;
    }
  }
}

/** Subscribes to a single block; unaffected blocks never re-render on sibling patches. */
const BlockHost = memo(function BlockHost({ id }: { id: string }) {
  const block = useBlock(id);
  return block ? renderBlock(block) : null;
});

export function CanvasRenderer() {
  const mode = useCanvasSelector((s) => s.mode);
  const order = useCanvasSelector((s) => s.order, shallowArrayEqual);
  return (
    <main data-canvas-mode={mode}>
      {order.map((id) => (
        <BlockHost key={id} id={id} />
      ))}
    </main>
  );
}
