import { z } from "zod";

export const DataQuerySchema = z.object({
  /** Id of a registered DataConnector (e.g. "duckdb", "graph", "vector"). */
  connector: z.string().min(1),
  statement: z.string().min(1),
  params: z.record(z.unknown()).default({}),
});
export type DataQuery = z.infer<typeof DataQuerySchema>;

export const WidgetSchema = z.object({
  id: z.string().min(1),
  kind: z.enum(["metric", "table", "chart"]),
  title: z.string(),
  /** Column span within the grid. */
  span: z.number().int().min(1).max(12).default(4),
  query: DataQuerySchema.optional(),
  options: z.record(z.unknown()).default({}),
});
export type Widget = z.infer<typeof WidgetSchema>;

const blockBase = { id: z.string().min(1) };

export const TextBlockSchema = z.object({
  ...blockBase,
  type: z.literal("text"),
  format: z.enum(["markdown", "plain"]).default("markdown"),
  content: z.string(),
});

export const DashboardBlockSchema = z.object({
  ...blockBase,
  type: z.literal("dashboard"),
  columns: z.number().int().min(1).max(12).default(12),
  widgets: z.array(WidgetSchema),
});

export const AppBlockSchema = z.object({
  ...blockBase,
  type: z.literal("app"),
  /** Key into the UI component registry for custom app interfaces. */
  appId: z.string().min(1),
  props: z.record(z.unknown()).default({}),
});

export const BlockSchema = z.discriminatedUnion("type", [
  TextBlockSchema,
  DashboardBlockSchema,
  AppBlockSchema,
]);
export type Block = z.infer<typeof BlockSchema>;
export type BlockType = Block["type"];
export type BlockOf<T extends BlockType> = Extract<Block, { type: T }>;
export type TextBlock = BlockOf<"text">;
export type DashboardBlock = BlockOf<"dashboard">;
export type AppBlock = BlockOf<"app">;

export const CanvasModeSchema = z.enum(["document", "dashboard", "app"]);
export type CanvasMode = z.infer<typeof CanvasModeSchema>;

/** Normalized: blocks keyed by id plus an ordering, so patches touch only affected entries. */
export const CanvasStateSchema = z
  .object({
    id: z.string().min(1),
    mode: CanvasModeSchema,
    version: z.number().int().nonnegative(),
    order: z.array(z.string()),
    blocks: z.record(BlockSchema),
  })
  .superRefine((s, ctx) => {
    for (const id of s.order) {
      if (!(id in s.blocks)) {
        ctx.addIssue({ code: "custom", message: `order references missing block "${id}"` });
      }
    }
    for (const [key, b] of Object.entries(s.blocks)) {
      if (key !== b.id) ctx.addIssue({ code: "custom", message: `block key "${key}" != id "${b.id}"` });
    }
  });
export type CanvasState = z.infer<typeof CanvasStateSchema>;

export const createEmptyCanvas = (id: string, mode: CanvasMode = "document"): CanvasState => ({
  id,
  mode,
  version: 0,
  order: [],
  blocks: {},
});
