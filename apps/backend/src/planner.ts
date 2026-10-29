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

function visualPreviewAsset(prompt: string) {
  const label = escapeHtml(prompt.slice(0, 72));
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="800" viewBox="0 0 1200 800">
<rect width="1200" height="800" fill="#eef2ea"/>
<circle cx="925" cy="210" r="152" fill="#d9e3d2"/>
<path d="M170 580c80-235 234-351 445-351 142 0 268 53 375 160-136 37-253 115-351 233-103 124-259 181-469 171Z" fill="#6c8065"/>
<path d="M380 446c74-107 166-160 275-160 91 0 170 37 237 112-104 23-193 82-267 177-68 86-151 128-250 128-41 0-84-9-130-26 52-74 97-151 135-231Z" fill="#fbfcf9"/>
<circle cx="627" cy="401" r="10" fill="#20211f"/>
<text x="74" y="106" fill="#20211f" font-family="Arial, Helvetica, sans-serif" font-size="32">Canvasium visual preview</text>
<text x="74" y="710" fill="#4d5549" font-family="Arial, Helvetica, sans-serif" font-size="27">${label}</text>
</svg>`;
  return {
    url: `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`,
    promptPrompted: prompt,
    alt: `Generated visual preview for ${prompt}`,
  };
}

function withVisualPreviews(plan: CanvasPlan, prompt: string): CanvasPlan {
  if (plan.activeLayoutMode !== "visual_workspace") return plan;
  return {
    ...plan,
    blocks: plan.blocks.map((block) =>
      (block.type === "image" || block.type === "gallery") && block.assets.length === 0
        ? { ...block, assets: [visualPreviewAsset(prompt)] }
        : block,
    ),
  };
}

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

  if (/\b(image|visual|illustration|design|moodboard|gallery|draw|paint|render|illustrate|sketch|craft)\b/.test(normalized)) {
    return withVisualPreviews({
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
    }, prompt);
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
      "Do not invent data values or connected sources.",
      "For dashboard widgets without a source, use dataSourceId 'attach-a-data-source'.",
      "For image blocks, use an empty assets array; Canvasium supplies a local visual preview.",
    ].join(" "),
    prompt: `${request.prompt}\n\nConnected source metadata and schemas (no file contents): ${JSON.stringify(request.sources)}`,
  });

  return { plan: withVisualPreviews(object, request.prompt), generatedBy: "ai-sdk" };
}
