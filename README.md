# The Canvasium

The Canvasium is a typed, React-based canvas for composing AI-generated workspaces from text, dashboards, and custom app blocks. It validates proposed changes before applying them, connects widgets to pluggable data sources, and updates only the parts of the canvas that changed.

## Preview

This example workspace is rendered with `CanvasRenderer` and demo connector data:

![The Canvasium project overview showing metric cards and a recent activity table](docs/canvasium-preview.png)

## What it includes

- **Typed canvas state:** Zod schemas define the normalized canvas, block types, widgets, modes, and data queries.
- **Atomic updates:** A batch of canvas operations either applies in full or leaves the existing state untouched. Untouched blocks retain their object identity.
- **Validated AI responses:** Accepts a decoded response or JSON text (including fenced JSON), validates its operations, and reports parse, JSON, or patch failures.
- **Reactive React renderer:** `CanvasRenderer` subscribes to canvas mode and ordering; each block subscribes to itself so sibling updates do not cause unnecessary block renders.
- **Pluggable data connectors:** A small connector interface supports injected DuckDB executors, Microsoft Graph, vector search, or your own data source.
- **Custom app blocks:** Register React components by `appId` and render them as canvas blocks.

## Project layout

| Path | Purpose |
| --- | --- |
| `src/schema` | Canvas, block, widget, query, and AI-operation schemas |
| `src/state` | Atomic operation reducer and external canvas store |
| `src/router` | AI response parsing, validation, and dispatch |
| `src/connectors` | Connector interface, registry, and DuckDB/Graph/vector adapters |
| `src/ui` | React context, renderer, block components, and connector-query hook |
| `test` | Tests for validation, patching, atomicity, and rendering |

## How to install

The Canvasium is currently a private source package and is not published to npm. Clone the repository and install its dependencies:

```sh
git clone https://github.com/roime81/The-Canvasium.git
cd The-Canvasium
npm install
```

Verify the checkout with:

```sh
npm run typecheck
npm test
```

There is no build or development-server script yet. To use Canvasium in an application, consume the TypeScript source from this repository or include it in your workspace; the app's toolchain must support React, TypeScript, and JSX. The public API is exported from `src/index.ts`.

## How to use

Create a `CanvasStore`, provide a `ConnectorRegistry` and app registry through `CanvasProvider`, then render `CanvasRenderer`. Use `routeAIResponse` to validate and apply canvas operations:

```tsx
import {
  CanvasProvider,
  CanvasRenderer,
  CanvasStore,
  ConnectorRegistry,
  createEmptyCanvas,
  routeAIResponse,
} from "./src";
import { createRoot } from "react-dom/client";

const store = new CanvasStore(createEmptyCanvas("workspace"));
const connectors = new ConnectorRegistry();

const result = routeAIResponse(store, {
  ops: [
    {
      op: "add_block",
      block: {
        id: "welcome",
        type: "text",
        content: "Welcome to your canvas.",
      },
    },
  ],
});

if (!result.ok) {
  throw new Error(result.error);
}

const root = document.getElementById("root");
if (!root) throw new Error('Missing element with id "root"');

createRoot(root).render(
  <CanvasProvider env={{ store, connectors, apps: {} }}>
    <CanvasRenderer />
  </CanvasProvider>,
);
```

`CanvasProvider` requires a `CanvasStore`, a `ConnectorRegistry`, and an app-component registry. Register data connectors for dashboard queries and React components for custom app blocks. You can optionally provide `renderMarkdown` to render markdown-formatted text blocks; without it, text is displayed as pre-wrapped text.

## Applying AI operations

`routeAIResponse(store, raw)` accepts an object or JSON string with an `ops` array. The optional `intent` and `message` fields can carry application-level context. For example:

```json
{
  "intent": "Create a project dashboard",
  "ops": [
    {
      "op": "add_block",
      "block": {
        "id": "projects",
        "type": "dashboard",
        "columns": 12,
        "widgets": [
          {
            "id": "active-projects",
            "kind": "metric",
            "title": "Active projects",
            "span": 4,
            "query": {
              "connector": "duckdb",
              "statement": "SELECT COUNT(*) AS value FROM projects",
              "params": {}
            }
          }
        ]
      }
    }
  ]
}
```

Supported operations are `add_block`, `update_block`, `remove_block`, `move_block`, `upsert_widget`, `remove_widget`, and `set_mode`. A response may contain up to 100 operations. On failure, the result has `ok: false` and a `stage` of `json`, `parse`, or `patch`; the store is not partially updated. For direct state changes, use `store.dispatch(ops)`, which throws `PatchError` if an operation cannot be applied.

## Blocks and widgets

The built-in block types are:

- **`text`** — plain or markdown-formatted content.
- **`dashboard`** — a 1–12 column grid of metric, table, or chart widgets. Metric widgets show the first value in the first returned row; table and chart widgets currently render tabular results.
- **`app`** — a custom React component selected by `appId`; the component receives its `AppBlock` as a `block` prop.

Widgets can define a `query` with a connector ID, statement, and parameters. `useConnectorQuery` runs the query, exposes loading/error/ready states, and aborts an in-flight request when its query changes or the component unmounts.

## Data connectors

Implement `DataConnector` and register it with the `ConnectorRegistry`. A connector returns column names and rows:

```ts
import { ConnectorRegistry, DuckDbConnector } from "./src";

const connectors = new ConnectorRegistry().register(
  new DuckDbConnector(async (_sql, _params) => {
    // Call your DuckDB runtime here.
    return {
      columns: ["value"],
      rows: [{ value: 42 }],
    };
  }),
);
```

Included adapters:

- **`DuckDbConnector`** delegates SQL and parameters to an injected executor; choose and initialize the DuckDB runtime in your application.
- **`GraphConnector`** calls Microsoft Graph paths with a token supplied by your application.
- **`VectorSearchConnector`** adapts an injected vector index; `params.topK` sets the result count (default `5`).

Connectors own their runtime and authentication setup. The Canvasium does not ship a database, Graph credential flow, vector index, AI model client, or markdown renderer.

## Extending the canvas

To add a block type, add it to the discriminated `BlockSchema` in `src/schema/canvas.ts` and handle it in `renderBlock` in `src/ui/CanvasRenderer.tsx`. The renderer's exhaustive switch makes an unhandled block type a TypeScript error. Update the operation schema/reducer if the new block needs additional editable fields, and add tests for its validation and rendering.

## Development

```sh
npm run typecheck
npm test
```
