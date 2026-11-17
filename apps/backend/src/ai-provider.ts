import { createOpenAI } from "@ai-sdk/openai";

/**
 * Canvasium's provider boundary. Ollama is the default local runtime and
 * exposes an OpenAI-compatible API. Commercial OpenAI-compatible endpoints
 * can be enabled later by changing AI_PROVIDER and server-side credentials.
 */
export function createCanvasiumModel(modelOverride?: string) {
  const providerName = (process.env.AI_PROVIDER ?? "ollama").toLowerCase();
  const model = modelOverride ?? process.env.AI_MODEL ?? "qwen2.5:7b";

  if (providerName === "ollama") {
    const provider = createOpenAI({
      name: "ollama",
      baseURL: process.env.OLLAMA_BASE_URL ?? "http://127.0.0.1:11434/v1",
      apiKey: process.env.OLLAMA_API_KEY ?? "ollama",
    });
    return { model: provider.chat(model), provider: providerName, modelName: model };
  }

  if (providerName === "openai-compatible" || providerName === "openai") {
    const apiKey = process.env.AI_API_KEY;
    if (!apiKey) throw new Error("AI_API_KEY is required for the selected commercial provider.");
    const provider = createOpenAI({
      name: providerName,
      baseURL: process.env.AI_API_URL || undefined,
      apiKey,
    });
    return { model: provider.chat(model), provider: providerName, modelName: model };
  }

  throw new Error(`Unsupported AI_PROVIDER: ${providerName}`);
}

export function getAIConfiguration() {
  return {
    provider: process.env.AI_PROVIDER ?? "ollama",
    model: process.env.AI_MODEL ?? "qwen2.5:7b",
    baseURL: process.env.AI_PROVIDER === "ollama"
      ? process.env.OLLAMA_BASE_URL ?? "http://127.0.0.1:11434/v1"
      : process.env.AI_API_URL ?? null,
  };
}
