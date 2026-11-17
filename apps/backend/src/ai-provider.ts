import { createOpenAI } from "@ai-sdk/openai";

export type CanvasiumProviderId = "ollama" | "openai" | "openai-compatible";

const activeProvider = (): CanvasiumProviderId => {
  const value = (process.env.AI_PROVIDER ?? "ollama").toLowerCase();
  if (value === "openai" || value === "openai-compatible" || value === "ollama") return value;
  throw new Error(`Unsupported AI_PROVIDER: ${value}`);
};

const csv = (value?: string) => (value ?? "")
  .split(",")
  .map((item) => item.trim())
  .filter(Boolean);

const unique = (items: string[]) => [...new Set(items)];

function ollamaBaseUrl() {
  return (process.env.OLLAMA_BASE_URL ?? "http://127.0.0.1:11434/v1").replace(/\/v1\/?$/, "");
}

async function installedOllamaModels(): Promise<string[]> {
  try {
    const response = await fetch(`${ollamaBaseUrl()}/api/tags`, {
      signal: AbortSignal.timeout(1800),
    });
    if (!response.ok) return [];
    const payload = await response.json() as { models?: Array<{ name?: string; model?: string }> };
    return unique((payload.models ?? [])
      .map((model) => model.name ?? model.model ?? "")
      .filter(Boolean));
  } catch {
    return [];
  }
}

function openAIKey() {
  return process.env.OPENAI_API_KEY
    ?? (activeProvider() === "openai" ? process.env.AI_API_KEY : undefined);
}

function compatibleKey() {
  return process.env.AI_COMPATIBLE_API_KEY
    ?? (activeProvider() === "openai-compatible" ? process.env.AI_API_KEY : undefined);
}

function compatibleUrl() {
  return process.env.AI_COMPATIBLE_API_URL
    ?? (activeProvider() === "openai-compatible" ? process.env.AI_API_URL : undefined);
}

/** Create a model using an explicitly selected, server-configured provider. */
export function createCanvasiumModel(modelOverride?: string, providerOverride?: string) {
  const providerName = (providerOverride ?? activeProvider()).toLowerCase();
  const model = modelOverride ?? process.env.AI_MODEL ?? "qwen2.5:7b";

  if (providerName === "ollama") {
    const provider = createOpenAI({
      name: "ollama",
      baseURL: process.env.OLLAMA_BASE_URL ?? "http://127.0.0.1:11434/v1",
      apiKey: process.env.OLLAMA_API_KEY ?? "ollama",
    });
    return { model: provider.chat(model), provider: providerName, modelName: model };
  }

  if (providerName === "openai") {
    const apiKey = openAIKey();
    if (!apiKey) throw new Error("OpenAI is not configured. Set OPENAI_API_KEY on the server.");
    const provider = createOpenAI({
      name: "openai",
      baseURL: process.env.AI_API_URL || "https://api.openai.com/v1",
      apiKey,
    });
    return { model: provider.chat(model), provider: providerName, modelName: model };
  }

  if (providerName === "openai-compatible") {
    const apiKey = compatibleKey();
    const baseURL = compatibleUrl();
    if (!apiKey || !baseURL) {
      throw new Error("The OpenAI-compatible provider is not configured on the server.");
    }
    const provider = createOpenAI({ name: "openai-compatible", baseURL, apiKey });
    return { model: provider.chat(model), provider: providerName, modelName: model };
  }

  throw new Error(`Unsupported AI provider: ${providerName}`);
}

export function getAIConfiguration() {
  const provider = activeProvider();
  return {
    provider,
    model: process.env.AI_MODEL ?? "qwen2.5:7b",
    baseURL: provider === "ollama"
      ? process.env.OLLAMA_BASE_URL ?? "http://127.0.0.1:11434/v1"
      : provider === "openai"
        ? "https://api.openai.com/v1"
        : compatibleUrl() ?? null,
  };
}

/**
 * Return only non-secret model metadata to the browser. Ollama's installed
 * model list is discovered at runtime; commercial model lists are explicitly
 * configured by the operator rather than guessed from a provider catalogue.
 */
async function buildAIModelCatalog() {
  const currentProvider = activeProvider();
  const configuredModel = process.env.AI_MODEL ?? (
    currentProvider === "ollama" ? "qwen2.5:7b" : "gpt-4o-mini"
  );
  const ollamaModels = await installedOllamaModels();
  const configuredLocalModels = csv(process.env.OLLAMA_MODELS);
  const localModels = configuredLocalModels.length
    ? unique(configuredLocalModels)
    : unique([
      ...ollamaModels,
      ...(currentProvider === "ollama" ? [configuredModel] : []),
    ]);
  const localDefaultModel = localModels.includes(configuredModel)
    ? configuredModel
    : localModels[0] ?? "qwen2.5:7b";

  const providers: Array<{
    id: CanvasiumProviderId;
    label: string;
    description: string;
    defaultModel: string;
    models: string[];
  }> = [{
    id: "ollama",
    label: "Ollama · Local",
    description: "Open models running on your own Ollama instance",
    defaultModel: localDefaultModel,
    models: localModels.length ? localModels : ["qwen2.5:7b"],
  }];

  const openKey = openAIKey();
  if (openKey) {
    const configuredModels = csv(process.env.OPENAI_MODELS);
    const models = unique(configuredModels.length
      ? configuredModels
      : currentProvider === "openai" ? [configuredModel] : []);
    if (models.length) providers.push({
      id: "openai",
      label: "OpenAI",
      description: "Commercial OpenAI models using server-side credentials",
      defaultModel: models.includes(configuredModel) ? configuredModel : models[0],
      models,
    });
  }

  const compatKey = compatibleKey();
  const compatUrl = compatibleUrl();
  if (compatKey && compatUrl) {
    const configuredModels = csv(process.env.AI_COMPATIBLE_MODELS);
    const models = unique(configuredModels.length
      ? configuredModels
      : currentProvider === "openai-compatible" ? [configuredModel] : []);
    if (models.length) providers.push({
      id: "openai-compatible",
      label: "OpenAI-compatible",
      description: "A configured hosted or self-managed compatible endpoint",
      defaultModel: models.includes(configuredModel) ? configuredModel : models[0],
      models,
    });
  }

  const selectedProvider = providers.find((item) => item.id === currentProvider) ?? providers[0]!;
  return {
    defaultProvider: selectedProvider.id,
    defaultModel: selectedProvider.defaultModel,
    providers,
  };
}

/** Server-side key lookup for optional OpenAI image generation. */
export function getOpenAIImageApiKey() {
  return openAIKey();
}


type AIModelCatalog = Awaited<ReturnType<typeof buildAIModelCatalog>>;
let cachedModelCatalog: { expiresAt: number; value: AIModelCatalog } | undefined;
let pendingModelCatalog: Promise<AIModelCatalog> | undefined;

/** Cache discovery briefly so prompt submissions do not repeatedly query Ollama. */
export async function getAIModelCatalog(): Promise<AIModelCatalog> {
  if (cachedModelCatalog && cachedModelCatalog.expiresAt > Date.now()) return cachedModelCatalog.value;
  pendingModelCatalog ??= buildAIModelCatalog();
  try {
    const value = await pendingModelCatalog;
    cachedModelCatalog = { value, expiresAt: Date.now() + 30_000 };
    return value;
  } finally {
    pendingModelCatalog = undefined;
  }
}

export async function isAIModelAllowed(provider: string, model: string): Promise<boolean> {
  const catalog = await getAIModelCatalog();
  return catalog.providers.some((item) => item.id === provider && item.models.includes(model));
}
