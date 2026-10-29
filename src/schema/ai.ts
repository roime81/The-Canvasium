import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import { BlockSchema, CanvasModeSchema, LIMITS, WidgetSchema } from "./canvas";

/** Patch payloads for update_block: the block `type` and `id` are immutable. */
const UpdateFields = z
  .object({
    format: z.enum(["markdown", "plain"]),
    content: z.string().max(LIMITS.text),
    columns: z.number().int().min(1).max(12),
    widgets: z.array(WidgetSchema).max(LIMITS.widgetsPerDashboard),
    appId: z.string().min(1).max(LIMITS.id),
    props: z.record(z.unknown()),
  })
  .partial()
  .strict();

export const CanvasOpSchema = z.discriminatedUnion("op", [
  z.object({ op: z.literal("add_block"), block: BlockSchema, index: z.number().int().min(0).optional() }),
  z.object({ op: z.literal("update_block"), id: z.string(), changes: UpdateFields }),
  z.object({ op: z.literal("remove_block"), id: z.string() }),
  z.object({ op: z.literal("move_block"), id: z.string(), index: z.number().int().min(0) }),
  z.object({ op: z.literal("upsert_widget"), blockId: z.string(), widget: WidgetSchema }),
  z.object({ op: z.literal("remove_widget"), blockId: z.string(), widgetId: z.string() }),
  z.object({ op: z.literal("set_mode"), mode: CanvasModeSchema }),
]);
export type CanvasOp = z.infer<typeof CanvasOpSchema>;

/** The envelope the model is instructed to return (e.g. via tool/function calling). */
export const AIResponseSchema = z.object({
  intent: z.string().max(200).optional(),
  message: z.string().max(LIMITS.text).optional(),
  ops: z.array(CanvasOpSchema).max(100),
});
export type AIResponse = z.infer<typeof AIResponseSchema>;

/** JSON Schema for function/tool-calling APIs, derived from the single Zod source of truth. */
export const aiResponseJsonSchema = () => zodToJsonSchema(AIResponseSchema, "AIResponse");
