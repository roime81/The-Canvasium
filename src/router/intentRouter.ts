import type { ZodIssue } from "zod";
import { AIResponseSchema, type AIResponse } from "../schema/ai";
import { PatchError } from "../state/patch";
import type { CanvasStore } from "../state/store";

export type RouteResult =
  | { ok: true; response: AIResponse; applied: number }
  | { ok: false; stage: "parse" | "json" | "patch"; error: string; issues?: ZodIssue[] };

/** Accepts raw model output (JSON string or decoded object) and validates it. */
export function parseAIResponse(raw: unknown): RouteResult {
  let data = raw;
  if (typeof raw === "string") {
    try {
      data = JSON.parse(stripFence(raw));
    } catch (e) {
      return { ok: false, stage: "json", error: (e as Error).message };
    }
  }
  const parsed = AIResponseSchema.safeParse(data);
  if (!parsed.success) {
    return { ok: false, stage: "parse", error: parsed.error.message, issues: parsed.error.issues };
  }
  return { ok: true, response: parsed.data, applied: 0 };
}

/** Validate then patch the store. Failures never mutate state; the error is returned so it can be fed back to the model. */
export function routeAIResponse(store: CanvasStore, raw: unknown): RouteResult {
  const parsed = parseAIResponse(raw);
  if (!parsed.ok) return parsed;
  try {
    store.dispatch(parsed.response.ops);
    return { ok: true, response: parsed.response, applied: parsed.response.ops.length };
  } catch (e) {
    if (e instanceof PatchError) return { ok: false, stage: "patch", error: e.message };
    throw e;
  }
}

function stripFence(s: string): string {
  const m = /^\s*```(?:json)?\s*([\s\S]*?)\s*```\s*$/.exec(s);
  return m?.[1] ?? s;
}
