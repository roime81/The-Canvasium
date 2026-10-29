import { z } from "zod";

export const LIMITS = {
  id: 64,
  text: 200_000,
  statement: 20_000,
  title: 200,
  widgetsPerDashboard: 100,
  blocks: 500,
  propsBytes: 100_000,
} as const;

const Id = z
  .string()
  .min(1)
  .max(LIMITS.id)
  .regex(/^[A-Za-z0-9_.:-]+$/, "id may only contain letters, digits and _ . : -");

/** Plain JSON-serializable record with a size cap, guarding against oversized model payloads. */
const BoundedRecord = z.record(z.unknown()).refine((v) => JSON.stringify(v).length <= LIMITS.propsBytes, {
  message: `payload exceeds ${LIMITS.propsBytes} bytes`,
});

export const DataQuerySchema = z.object({
  /** Id of a registered DataConnector (e.g. "duckdb", "graph", "vector"). */
  connector: z.string().min(1).max(LIMITS.id),
  statement: z.string().min(1).max(LIMITS.statement),
  params: BoundedRecord.default({}),
});
export type DataQuery = z.infer<typeof DataQuerySchema>;

export const WidgetSchema = z.object({
  id: Id,
  kind: z.enum(["metric", "table", "chart"]),
  title: z.string().max(LIMITS.title),
  /** Column span within the grid. */
  span: z.number().int().min(1).max(12).default(4),
  query: DataQuerySchema.optional(),
  options: BoundedRecord.default({}),
});
export type Widget = z.infer<typeof WidgetSchema>;

const blockBase = { id: Id };

export const TextBlockSchema = z.object({
  ...blockBase,
  type: z.literal("text"),
  format: z.enum(["markdown", "plain"]).default("markdown"),
  content: z.string().max(LIMITS.text),
});

export const DashboardBlockSchema = z.object({
  ...blockBase,
  type: z.literal("dashboard"),
  columns: z.number().int().min(1).max(12).default(12),
  widgets: z.array(WidgetSchema).max(LIMITS.widgetsPerDashboard),
});

export const AppBlockSchema = z.object({
  ...blockBase,
  type: z.literal("app"),
  /** Key into the UI component registry for custom app interfaces. */
  appId: Id,
  props: BoundedRecord.default({}),
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
    id: Id,
    mode: CanvasModeSchema,
    version: z.number().int().nonnegative(),
    order: z.array(z.string()).max(LIMITS.blocks),
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
