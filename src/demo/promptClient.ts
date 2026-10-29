import type { CanvasState } from "../schema/canvas";

export async function requestCanvasChanges(
  endpoint: string,
  prompt: string,
  canvas: CanvasState,
  fetcher: typeof fetch = fetch,
): Promise<unknown> {
  const response = await fetcher(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt, canvas }),
  });

  if (!response.ok) {
    const detail = (await response.text()).trim();
    throw new Error(detail || `AI service returned HTTP ${response.status}`);
  }

  return response.json();
}
