import { z } from "zod";

export const LayoutModeSchema = z.enum([
  "document",
  "dashboard",
  "visual_workspace",
  "hybrid",
]);
export type LayoutMode = z.infer<typeof LayoutModeSchema>;

export const GridLayoutConfigSchema = z.object({
  x: z.number().int().min(0),
  y: z.number().int().min(0),
  w: z.number().int().min(1).max(12),
  h: z.number().int().min(1),
  minW: z.number().int().min(1).max(12).optional(),
  minH: z.number().int().min(1).optional(),
});
export type GridLayoutConfig = z.infer<typeof GridLayoutConfigSchema>;

export const LocalFileSourceSchema = z.object({
  id: z.string().min(1),
  kind: z.literal("file"),
  name: z.string().min(1),
  fileName: z.string().min(1),
  mimeType: z.string(),
  size: z.number().nonnegative(),
  status: z.enum(["metadata_only", "processing", "ready", "error"]).default("metadata_only"),
  columns: z.array(z.object({
    name: z.string(),
    type: z.string(),
  })).default([]),
});

export const SharePointSourceSchema = z.object({
  id: z.string().min(1),
  kind: z.literal("sharepoint"),
  name: z.string().min(1),
  siteUrl: z.string().url(),
  status: z.enum(["connected", "error"]).default("connected"),
});

export const DataLakeSourceSchema = z.object({
  id: z.string().min(1),
  kind: z.literal("datalake"),
  name: z.string().min(1),
  provider: z.string().min(1),
  catalog: z.string().min(1),
  status: z.enum(["connected", "error"]).default("connected"),
});

export const DataSourceSchema = z.discriminatedUnion("kind", [
  LocalFileSourceSchema,
  SharePointSourceSchema,
  DataLakeSourceSchema,
]);
export type DataSource = z.infer<typeof DataSourceSchema>;

export const ParagraphBlockSchema = z.object({
  id: z.string().min(1),
  type: z.literal("paragraph"),
  content: z.string(),
});

export const HeadingBlockSchema = z.object({
  id: z.string().min(1),
  type: z.literal("heading"),
  level: z.union([z.literal(1), z.literal(2), z.literal(3)]).default(1),
  content: z.string(),
});

export const TextBlockSchema = z.discriminatedUnion("type", [
  ParagraphBlockSchema,
  HeadingBlockSchema,
]);
export type TextBlock = z.infer<typeof TextBlockSchema>;

export const VegaLiteSpecSchema = z.object({
  kind: z.literal("vega-lite"),
  spec: z.record(z.string(), z.unknown()),
});
export const ChartJSSpecSchema = z.object({
  kind: z.literal("chart-js"),
  spec: z.record(z.string(), z.unknown()),
});
export const DuckDBSQLQuerySchema = z.object({
  kind: z.literal("duckdb-sql"),
  sql: z.string().min(1),
  params: z.array(z.unknown()).default([]),
});
export const DashboardSpecSchema = z.discriminatedUnion("kind", [
  VegaLiteSpecSchema,
  ChartJSSpecSchema,
  DuckDBSQLQuerySchema,
]);
export type DashboardSpec = z.infer<typeof DashboardSpecSchema>;

export const DashboardBlockSchema = z.object({
  id: z.string().min(1),
  type: z.literal("bi_widget"),
  widgetType: z.enum(["bar", "line", "kpi_card"]),
  title: z.string().min(1),
  dataSourceId: z.string().min(1),
  spec: DashboardSpecSchema,
  layout: GridLayoutConfigSchema,
});
export type DashboardBlock = z.infer<typeof DashboardBlockSchema>;

export const ImageAssetSchema = z.object({
  url: z.string().url(),
  promptPrompted: z.string(),
  alt: z.string().optional(),
});
export const ImageBlockSchema = z.object({
  id: z.string().min(1),
  type: z.enum(["image", "gallery"]),
  assets: z.array(ImageAssetSchema),
  layout: GridLayoutConfigSchema,
});
export type ImageBlock = z.infer<typeof ImageBlockSchema>;

export const FileAttachmentBlockSchema = z.object({
  id: z.string().min(1),
  type: z.literal("file_attachment"),
  sourceId: z.string().min(1),
  fileName: z.string().min(1),
  mimeType: z.string(),
  size: z.number().nonnegative(),
});
export type FileAttachmentBlock = z.infer<typeof FileAttachmentBlockSchema>;

export const CanvasBlockSchema = z.discriminatedUnion("type", [
  ParagraphBlockSchema,
  HeadingBlockSchema,
  DashboardBlockSchema,
  ImageBlockSchema,
  FileAttachmentBlockSchema,
]);
export type CanvasBlock = z.infer<typeof CanvasBlockSchema>;

export const CanvasStateSchema = z.object({
  canvasId: z.string().min(1),
  title: z.string().min(1),
  connectedSources: z.array(DataSourceSchema),
  activeLayoutMode: LayoutModeSchema,
  blocks: z.array(CanvasBlockSchema),
});
export type CanvasState = z.infer<typeof CanvasStateSchema>;

export const CanvasPlanSchema = z.object({
  activeLayoutMode: LayoutModeSchema,
  title: z.string().min(1),
  blocks: z.array(CanvasBlockSchema),
});
export type CanvasPlan = z.infer<typeof CanvasPlanSchema>;

export const PlanRequestSchema = z.object({
  prompt: z.string().trim().min(1).max(4000),
  sources: z.array(DataSourceSchema).default([]),
});
export type PlanRequest = z.infer<typeof PlanRequestSchema>;
