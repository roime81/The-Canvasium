import { createContext, useContext, useRef, useSyncExternalStore, type ComponentType, type ReactNode } from "react";
import type { ConnectorRegistry } from "../connectors/types";
import type { AppBlock, Block, CanvasState } from "../schema/canvas";
import type { CanvasStore } from "../state/store";

export interface CanvasEnv {
  store: CanvasStore;
  connectors: ConnectorRegistry;
  /** Custom app interfaces addressable by AppBlock.appId. */
  apps: Record<string, ComponentType<{ block: AppBlock }>>;
  /** Optional markdown renderer; defaults to plain pre-wrapped text. */
  renderMarkdown?: (src: string) => ReactNode;
}

const Ctx = createContext<CanvasEnv | null>(null);

export function CanvasProvider({ env, children }: { env: CanvasEnv; children?: ReactNode }) {
  return <Ctx.Provider value={env}>{children}</Ctx.Provider>;
}

export function useCanvasEnv(): CanvasEnv {
  const env = useContext(Ctx);
  if (!env) throw new Error("CanvasProvider missing");
  return env;
}

/** Subscribe to a derived slice; re-renders only when `equals` says the slice changed. */
export function useCanvasSelector<T>(
  selector: (s: CanvasState) => T,
  equals: (a: T, b: T) => boolean = Object.is,
): T {
  const { store } = useCanvasEnv();
  const cache = useRef<{ v: T } | null>(null);
  const getSnapshot = (): T => {
    const next = selector(store.getState());
    if (cache.current && equals(cache.current.v, next)) return cache.current.v;
    cache.current = { v: next };
    return next;
  };
  return useSyncExternalStore(store.subscribe, getSnapshot, getSnapshot);
}

export const shallowArrayEqual = (a: readonly string[], b: readonly string[]) =>
  a === b || (a.length === b.length && a.every((x, i) => x === b[i]));

/** Block objects keep identity unless patched, so Object.is is sufficient. */
export const useBlock = (id: string): Block | undefined => useCanvasSelector((s) => s.blocks[id]);
