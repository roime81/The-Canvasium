import type { CanvasState } from "../schema/canvas";

export interface PromptResult {
  workspaceId: string;
  source: "ai" | "template";
  applied: number;
  message: string;
  canvas: CanvasState;
}

async function failure(response: Response): Promise<Error> {
  try {
    const body = (await response.json()) as { error?: unknown };
    if (typeof body.error === "string") return new Error(body.error);
  } catch {
    // fall through to the generic message
  }
  return new Error(`The server returned HTTP ${response.status}`);
}

export async function sendPrompt(
  workspaceId: string,
  prompt: string,
  fetcher: typeof fetch = (...args) => fetch(...args),
): Promise<PromptResult> {
  const response = await fetcher("/api/prompt", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ workspaceId, prompt }),
  });
  if (!response.ok) throw await failure(response);
  return (await response.json()) as PromptResult;
}

export async function loadWorkspace(
  workspaceId: string,
  fetcher: typeof fetch = (...args) => fetch(...args),
): Promise<CanvasState> {
  const response = await fetcher(`/api/workspaces/${encodeURIComponent(workspaceId)}`);
  if (!response.ok) throw await failure(response);
  return ((await response.json()) as { canvas: CanvasState }).canvas;
}

export async function listWorkspaces(
  fetcher: typeof fetch = (...args) => fetch(...args),
): Promise<{ id: string; blocks: number; version: number }[]> {
  const response = await fetcher("/api/workspaces");
  if (!response.ok) throw await failure(response);
  return ((await response.json()) as { workspaces: { id: string; blocks: number; version: number }[] }).workspaces;
}
