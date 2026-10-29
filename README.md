# The Canvasium

Generative, adaptive UI canvas. Layers:

- `src/schema` – Zod schemas: `CanvasState` (normalized blocks) and AI response ops.
- `src/state` – pure atomic reducer (`applyOps`) + `CanvasStore` (structural sharing).
- `src/router` – `routeAIResponse(store, raw)` validates model output and patches state.
- `src/connectors` – `DataConnector` interface, registry, DuckDB / Graph / vector adapters.
- `src/ui` – `CanvasRenderer`; per-block subscriptions so unaffected blocks don't re-render.

Add a block type: extend `BlockSchema`, then handle it in `renderBlock` (compile-time exhaustive).
