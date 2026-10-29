# The Canvasium

## Run it

```bash
npm install
npm run dev        # serves http://localhost:5173
```

Chat on the left, live canvas on the right. Works immediately with a built-in offline assistant
(`show a sales dashboard`, `note: # Hello`, `add a counter app`, `clear`) or paste raw JSON ops.
For free-form requests open **Settings** and add an OpenAI-compatible API key (stored only in your
browser's localStorage; use a backend proxy for shared deployments). Canvas state persists across reloads.
`npm run build:app` outputs the static site to `dist-app/`.

Generative, adaptive UI canvas. Layers:

- `src/schema` – Zod schemas: `CanvasState` (normalized blocks) and AI response ops.
- `src/state` – pure atomic reducer (`applyOps`) + `CanvasStore` (structural sharing).
- `src/router` – `routeAIResponse(store, raw)` validates model output and patches state.
- `src/connectors` – `DataConnector` interface, registry, DuckDB / Graph / vector adapters.
- `src/ui` – `CanvasRenderer`; per-block subscriptions so unaffected blocks don't re-render.

Add a block type: extend `BlockSchema`, then handle it in `renderBlock` (compile-time exhaustive).

## Production notes

- **Scripts:** `npm run lint | typecheck | test:coverage | build`; CI runs all of them plus `npm audit`.
- **Untrusted model output:** every response is Zod-validated with size/ID limits (`LIMITS`), applied atomically, and failures are returned (never thrown into the UI) via `routeAIResponse`. Use `aiResponseJsonSchema()` for tool-calling.
- **Connectors:** `ConnectorRegistry` enforces timeout, abort, row cap and optional dedupe. `DuckDbConnector` rejects non-read-only SQL, but your injected executor must *also* use a read-only DuckDB with file/network access disabled. `GraphConnector` is read-only, path-allowlisted, same-origin and never follows redirects.
- **Rendering:** per-block subscriptions and error boundaries; text is rendered as text (no `dangerouslySetInnerHTML`). If you supply `renderMarkdown`, it must sanitize its output.
- **Undo/redo and telemetry:** `CanvasStore` (`undo`, `redo`, `onDispatch`), `ConnectorRegistry` (`onQuery`), `CanvasRenderer` (`onBlockError`).
- **Not included:** persistence, auth, and the LLM client itself; supply those in the host app.
