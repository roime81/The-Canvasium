# The Canvasium

**Turn a productivity goal into a workspace.** The Canvasium is an adaptable canvas for describing what you want to get done and shaping a workspace around it. Ask for a weekly plan, project tracker, meeting notes, habit tracker, research brief, or a workflow of your own. Refine the result with follow-up prompts instead of starting from a fixed-purpose app.

The React and TypeScript canvas renders text, dashboards, and custom app blocks. An AI backend translates prompts into proposed workspace changes; Canvasium validates the changes and applies each batch atomically. Bring the AI provider and data integrations that fit your needs.

> **Current integration status:** The demo UI and provider-neutral backend contract are included. A live AI provider is not bundled or enabled by default; configure `VITE_CANVASIUM_AI_ENDPOINT` and implement a server-side adapter to use prompts. Demo dashboard data is illustrative.

## What can I make?

- **Plan and focus:** weekly plans, daily priorities, goal breakdowns, and time-blocked schedules.
- **Manage projects:** project dashboards, launch plans, milestone trackers, and next-action lists.
- **Capture and organize:** meeting notes, decision logs, research briefs, and personal knowledge spaces.
- **Build routines:** habit trackers, recurring checklists, and custom workflows.

Start with an example prompt in the demo or describe a different goal in your own words. These are starting points, not fixed templates: your backend can interpret requests and return any supported Canvasium blocks and widgets.

## Preview

The repository includes an interactive prompt-first demo with starter ideas, a workspace preview, and sample connector data:

![The Canvasium project overview showing metric cards and a recent activity table](docs/canvasium-preview.png)

## What it includes

- **Typed canvas state:** Zod schemas define the normalized canvas, block types, widgets, modes, and data queries.
- **Atomic updates:** A batch of canvas operations either applies in full or leaves the existing state untouched. Untouched blocks retain their object identity.
- **Prompt-to-workspace flow:** Sends the prompt and current workspace to your configured backend; validates proposed operations before applying them.
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

## Run in GitHub Codespaces

Open the repository on GitHub, choose **Code → Codespaces → Create codespace**, and wait for setup to finish. The dev container installs dependencies and forwards port `5173`. To connect prompting, copy `.env.example` to `.env` and set `VITE_CANVASIUM_AI_ENDPOINT` to your server-side prompt endpoint:

```sh
cp .env.example .env
npm run dev
```

Open the forwarded **The Canvasium demo** port to explore the canvas. Without an endpoint, you can still explore the UI, workspace modes, and prompt starters; submitting a prompt displays setup guidance. With an endpoint configured, describe a goal in your own words and the response is schema-validated before changes are applied.

## Connect a prompt backend

The demo sends a `POST` request to the configured `VITE_CANVASIUM_AI_ENDPOINT`. The JSON request body contains the user's prompt and the current canvas state:

```json
{
  "prompt": "Make a project tracker for a product launch",
  "canvas": {
    "id": "canvasium-demo",
    "mode": "dashboard",
    "version": 1,
    "order": [],
    "blocks": {}
  }
}
```

Return a JSON object matching the `AIResponse` schema, with an `ops` array and optional `message` or `intent` fields. For example:

```json
{
  "message": "I created a launch tracker with milestones and next actions.",
  "ops": [
    {
      "op": "add_block",
      "block": {
        "id": "launch-plan",
        "type": "text",
        "content": "## Product launch\\n\\n- Define milestones\\n- Assign owners\\n- Review next actions"
      }
    }
  ]
}
```

Implement the endpoint in your server and connect it to any model/provider you choose. Keep provider API keys and authentication on the server; do not put secrets in `VITE_` variables because those are included in browser code. The backend should instruct its model to return Canvasium operations (see `src/schema/ai.ts`) and return them as JSON. Canvasium validates the response before changing the workspace. The repository does not include an AI provider or backend.

## Run locally

The Canvasium is a source package and is not published to npm. Clone the repository and install its dependencies:

```sh
git clone https://github.com/roime81/The-Canvasium.git
cd The-Canvasium
npm ci
cp .env.example .env
# Set VITE_CANVASIUM_AI_ENDPOINT in .env to your backend URL
npm run dev
```

Vite serves the demo at `http://localhost:5173`. Natural-language prompting requires your configured server-side endpoint. To verify the checkout:

```sh
npm run typecheck
npm test
```

To use Canvasium in another application, consume the TypeScript source from this repository or include it in your workspace; the app's toolchain must support React, TypeScript, and JSX. The public API is exported from `src/index.ts`.

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
