import { generateObject } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { CanvasPlanSchema, type CanvasPlan, type PlanRequest } from "@canvasium/types";

const escapeHtml = (content: string) => content
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;");

const paragraphBlock = (id: string, content: string) => ({
  id,
  type: "paragraph" as const,
  content: escapeHtml(content),
});

const headingBlock = (id: string, content: string, level: 1 | 2 | 3) => ({
  id,
  type: "heading" as const,
  level,
  content: escapeHtml(content),
});

export function createStarterPlan({ prompt, sources }: PlanRequest): CanvasPlan {
  const normalized = prompt.toLowerCase();
  const sourceId = sources.find((source) =>
    source.kind === "file" ? source.status === "ready" : source.status === "connected",
  )?.id ?? "attach-a-data-source";

  if (/\b(dashboard|analytics|sales|revenue|chart|metrics|report)\b/.test(normalized)) {
    return {
      activeLayoutMode: "dashboard",
      title: "Analytics workspace",
      blocks: [
        {
          id: "overview",
          type: "paragraph",
          content: escapeHtml(`A dashboard canvas is ready for: ${prompt}`),
        },
        {
          id: "revenue-by-month",
          type: "bi_widget",
          widgetType: "bar",
          title: "Revenue by month",
          dataSourceId: sourceId,
          spec: {
            kind: "vega-lite",
            spec: {
              mark: "bar",
              encoding: {
                x: { field: "month", type: "ordinal" },
                y: { field: "revenue", type: "quantitative" },
              },
            },
          },
          layout: { x: 0, y: 0, w: 6, h: 2 },
        },
      ],
    };
  }

  if (/\b(image|visual|illustration|design|moodboard|gallery)\b/.test(normalized)) {
    return {
      activeLayoutMode: "visual_workspace",
      title: "Visual workspace",
      blocks: [
        paragraphBlock("visual-brief", `Visual workspace brief: ${prompt}`),
        {
          id: "visual-gallery",
          type: "gallery",
          assets: [],
          layout: { x: 0, y: 0, w: 8, h: 5 },
        },
      ],
    };
  }

  return {
    activeLayoutMode: "document",
    title: "Writing workspace",
    blocks: [
      headingBlock("document-title", prompt, 1),
      paragraphBlock(
        "document-body",
        "Your editable document is ready. Select this text to start writing, or refine it with another prompt.",
      ),
    ],
  };
}

export async function createPlan(request: PlanRequest, options: { offline?: boolean } = {}): Promise<{
  plan: CanvasPlan;
  generatedBy: "starter-planner" | "ai-sdk";
}> {
  const apiKey = process.env.AI_API_KEY;
  if (!apiKey || options.offline) {
    return { plan: createStarterPlan(request), generatedBy: "starter-planner" };
  }

  const provider = createOpenAI({ apiKey });
  const { object } = await generateObject({
    model: provider(process.env.AI_MODEL ?? "gpt-4o-mini"),
    schema: CanvasPlanSchema,
    system: [
      "Create a structured Canvasium plan for the user's request.",
      "Choose document, dashboard, or visual_workspace based on intent.",
      "Do not invent data values, connected sources, or generated image URLs.",
      "For dashboard widgets without a source, use dataSourceId 'attach-a-data-source'.",
      "Use an empty assets array for image blocks until an image engine is configured.",
    ].join(" "),
    prompt: `${request.prompt}\n\nConnected source metadata and schemas (no file contents): ${JSON.stringify(request.sources)}`,
  });

  return { plan: object, generatedBy: "ai-sdk" };
}
