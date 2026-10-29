import { Component, memo, type ErrorInfo, type ReactNode } from "react";
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

interface BoundaryProps {
  blockId: string;
  onError?: (blockId: string, error: Error, info: ErrorInfo) => void;
  children: ReactNode;
}

/** Isolates a failing block so one bad AI-generated block can't blank the whole canvas. */
export class BlockErrorBoundary extends Component<BoundaryProps, { error: Error | null }> {
  override state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  override componentDidCatch(error: Error, info: ErrorInfo) {
    this.props.onError?.(this.props.blockId, error, info);
  }
  override render() {
    return this.state.error ? (
      <div role="alert" data-block-error={this.props.blockId}>
        This block failed to render.
      </div>
    ) : (
      this.props.children
    );
  }
}

/** Subscribes to a single block; unaffected blocks never re-render on sibling patches. */
const BlockHost = memo(function BlockHost({ id }: { id: string }) {
  const block = useBlock(id);
  return block ? renderBlock(block) : null;
});

export function CanvasRenderer({ onBlockError }: { onBlockError?: BoundaryProps["onError"] }) {
  const mode = useCanvasSelector((s) => s.mode);
  const order = useCanvasSelector((s) => s.order, shallowArrayEqual);
  return (
    <main data-canvas-mode={mode}>
      {order.map((id) => (
        <BlockErrorBoundary key={id} blockId={id} {...(onBlockError ? { onError: onBlockError } : {})}>
          <BlockHost id={id} />
        </BlockErrorBoundary>
      ))}
    </main>
  );
}
