import { useEffect, useState } from "react";
import type { QueryResult } from "../connectors/types";
import type { DataQuery } from "../schema/canvas";
import { useCanvasEnv } from "./context";

export type QueryState =
  | { status: "idle" | "loading" }
  | { status: "ready"; data: QueryResult }
  | { status: "error"; error: string };

export function useConnectorQuery(query: DataQuery | undefined): QueryState {
  const { connectors } = useCanvasEnv();
  const [state, setState] = useState<QueryState>({ status: "idle" });
  const key = query ? JSON.stringify(query) : "";

  useEffect(() => {
    if (!query) return setState({ status: "idle" });
    const ctrl = new AbortController();
    setState({ status: "loading" });
    connectors
      .execute(query, { signal: ctrl.signal })
      .then((data) => !ctrl.signal.aborted && setState({ status: "ready", data }))
      .catch((e: unknown) => !ctrl.signal.aborted && setState({ status: "error", error: String(e) }));
    return () => ctrl.abort();
  }, [key, connectors]);

  return state;
}
