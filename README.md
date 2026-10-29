# The Canvasium

The Canvasium is a natural-language productivity canvas. The repository now includes a Turborepo + pnpm monorepo foundation for an AI-native Next.js workspace, a Fastify API, and shared Zod schemas. The earlier Vite/React prototype remains available through `legacy:*` scripts while the new app is scaffolded.

## Canvas renderer preview

The Next.js workspace after a visual prompt, with a rendered local preview and floating command bar:

![The Canvasium workspace showing a generated visual preview and floating prompt bar](docs/canvasium-preview.png)

## Monorepo foundation

| Path | Purpose |
| --- | --- |
| `apps/web` | Next.js App Router UI, Tailwind, Zustand canvas state, Tiptap text blocks, and React Grid Layout |
| `apps/backend` | Fastify API with a validated starter planner endpoint |
| `packages/types` | Shared Zod schemas and TypeScript types for canvas state, content blocks, data sources, and plans |

The starter UI reacts to prompts with document, dashboard, or visual-workspace blocks. Document blocks flow as an editable page, while dashboard and visual blocks use a draggable/resizable grid. Visual prompts such as “Craft me a duck” display a deterministic local SVG preview, so they remain useful without an image-provider key. It includes editable Tiptap text and in-browser DuckDB schema inspection for CSV/Parquet files (PDFs retain metadata only). Fastify uses a deterministic planner by default; setting `AI_API_KEY` enables Vercel AI SDK structured planning through OpenAI with source schemas as context. File contents remain in the browser; live chart queries, PDF extraction, provider-backed image generation, and SharePoint/Datalake connectors remain follow-up work.

The typed Vite canvas library and tracker described below remain available as a working prototype.

## Prototype capabilities

- **Typed canvas state:** Zod schemas define the normalized canvas, block types, widgets, modes, and data queries.
- **Atomic updates:** A batch of canvas operations either applies in full or leaves the existing state untouched. Untouched blocks retain their object identity.
- **Validated AI responses:** Accepts a decoded response or JSON text (including fenced JSON), validates its operations, and reports parse, JSON, or patch failures.
- **Reactive React renderer:** `CanvasRenderer` subscribes to canvas mode and ordering; each block subscribes to itself so sibling updates do not cause unnecessary block renders.
- **Pluggable data connectors:** A small connector interface supports injected DuckDB executors, Microsoft Graph, vector search, or your own data source.
- **Custom app blocks:** Register React components by `appId` and render them as canvas blocks.

## Prototype project layout

| Path | Purpose |
| --- | --- |
| `src/schema` | Canvas, block, widget, query, and AI-operation schemas |
| `src/state` | Atomic operation reducer and external canvas store |
| `src/router` | AI response parsing, validation, and dispatch |
| `src/connectors` | Connector interface, registry, and DuckDB/Graph/vector adapters |
| `src/ui` | React context, renderer, block components, and connector-query hook |
| `server` | Node API, storage, template planner, AI provider adapter, tracker queries |
| `src/demo`, `src/tracker` | Prompt workspace and tracker UIs |
| `test` | Tests for validation, patching, atomicity, and rendering |

## Prototype surfaces

| Surface | URL | What it does |
| --- | --- | --- |
| **Prompt workspace** (frontend) | `/` | A chat-style prompt panel for any productivity goal. Send a prompt with the arrow button; the conversation and generated workspace appear above it. **My History** shows saved prompts for the selected workspace. **How It Works** explains the app and includes canvas mode controls. |
| **Productivity tracker** (backend UI) | `/tracker` | A Canvasium dashboard of everything done through the app: prompts, success rate, workspaces, blocks, activity by day and category, and recent activity. Auto-refreshes every 15 seconds. |

The prototype's Node server (`server/`) serves both pages and a JSON API, records every prompt as a tracked event, and stores data in `data/canvasium.json`.
Open **How It Works** and use its **Canvas mode** controls to switch the generated workspace between Dashboard, Document, and App layouts. Modes affect the presentation of blocks; they do not erase workspace content.

## Run in GitHub Codespaces

Choose **Code → Codespaces → Create codespace**. The dev container installs the pinned pnpm version and frozen workspace lockfile, then forwards the Next.js workspace on port `3000` and API on port `3001`.

```sh
pnpm dev
```

Open the forwarded **The Canvasium workspace** port. Keep `pnpm dev` running in that terminal. In a second terminal, verify the live app and API proxy:

```sh
pnpm codespaces:smoke
pnpm typecheck
pnpm test
pnpm build
```

The smoke check sends a deterministic offline prompt, so it does not need an API key or call an external model. Attach a CSV/Parquet file in the browser to test local DuckDB schema inspection. Run `pnpm legacy:dev` to open the existing prototype on port `5173` and its tracker at `/tracker`.

## Connect an AI provider (optional)

The new Fastify planner supports OpenAI through the Vercel AI SDK. In a Codespace or local checkout, copy the example configuration and add an OpenAI API key:

```sh
cp .env.example .env
```

```env
AI_API_KEY=your_openai_api_key
AI_MODEL=gpt-4o-mini
```

Restart `pnpm dev` after changing `.env`. The Fastify planner loads this root file; without a key, it uses deterministic starter plans. Keep the key in a Codespaces secret or local `.env` file and never commit it.

Gemini and Grok are not currently wired into the new planner. Adding them requires a provider adapter (`@ai-sdk/google` for Gemini or an OpenAI-compatible xAI client for Grok) and provider/model selection configuration.

The legacy Vite prototype can also use any OpenAI-compatible chat-completions endpoint through `AI_API_URL`, `AI_API_KEY`, and `AI_MODEL`:

```sh
AI_API_URL=https://api.openai.com/v1/chat/completions
AI_API_KEY=your-key
AI_MODEL=gpt-4o-mini
```

Keys stay on the server. Model output is validated before it changes a workspace; invalid output is rejected (422), provider failures return 502, and both are tracked. Other settings: `PORT` (5173), `HOST` (127.0.0.1), `DATA_FILE` (`data/canvasium.json`).

## Legacy prototype API

| Endpoint | Purpose |
| --- | --- |
| `GET /api/health` | Health check |
| `GET /api/workspaces` | List workspaces |
| `GET /api/workspaces/:id` | Load a workspace canvas |
| `GET /api/workspaces/:id/history` | Load the most recent 50 prompt events for a workspace |
| `POST /api/prompt` | `{ "workspaceId", "prompt" }` (JSON, max 4000 chars) → updated canvas |
| `GET /api/tracker/:statement` | Tracker queries: `prompts`, `success-rate`, `workspaces`, `blocks`, `recent-activity`, `by-category`, `by-day`, `workspace-list` |

**Security:** there is no authentication, and the server binds to `127.0.0.1` by default. Don't expose it publicly without adding auth.

The new Fastify service exposes `GET /health` and `POST /api/plan`. The Next.js app proxies `/api/*` to Fastify on port `3001`. This API is unauthenticated; keep forwarded Codespaces ports private and add authentication before public deployment.

## Run locally

```sh
git clone https://github.com/roime81/The-Canvasium.git
cd The-Canvasium
pnpm install
pnpm dev                 # Next.js on :3000 and Fastify on :3001
pnpm build
pnpm typecheck
pnpm test                # Existing Vite prototype tests
pnpm legacy:dev          # Existing Vite prototype on :5173
```

The legacy Canvasium library public API is exported from `src/index.ts` and includes `StaticConnector`, `HttpConnector`, `renderBasicMarkdown`, and `CanvasStore.replace`.

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
