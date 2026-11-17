import dotenv from "dotenv";
import Fastify from "fastify";
import { PlanRequestSchema } from "@canvasium/types";
import { createPlan } from "./planner.js";
import { getAIConfiguration, getAIModelCatalog, isAIModelAllowed } from "./ai-provider.js";
import { registerMcpEndpoint } from "./mcp.js";

dotenv.config({ path: "../../.env" });

const app = Fastify({ logger: true });

app.get("/health", async () => ({ status: "ok" }));

app.get("/api/v1/capabilities", async () => ({
  service: "canvasium-api",
  version: "v1",
  ai: { ...getAIConfiguration(), mode: process.env.AI_PROVIDER ?? "ollama" },
  integrations: {
    mcp: { enabled: process.env.MCP_ENABLED !== "false", endpoint: "/mcp", transport: "streamable-http" },
    rest: { enabled: true, endpoints: ["GET /api/v1/health", "GET /api/v1/capabilities", "GET /api/v1/models", "POST /api/v1/plan"] },
    modules: ["canvas-planner", "data-connectors", "vector-search", "image-generation", "external-apis"],
  },
}));
app.get("/api/v1/health", async () => ({ status: "ok", service: "canvasium-api" }));
app.get("/api/v1/models", async () => getAIModelCatalog());

const handlePlan = async (request: any, reply: any) => {
  const internalSecret = process.env.INTERNAL_API_SECRET;
  if (internalSecret && request.headers["x-canvasium-internal-secret"] !== internalSecret) {
    return reply.code(401).send({ error: "Unauthorized planner request" });
  }
  const parsed = PlanRequestSchema.safeParse(request.body);
  if (!parsed.success) {
    return reply.code(400).send({ error: "Invalid prompt", issues: parsed.error.issues });
  }

  try {
    const offline = request.headers["x-canvasium-offline"] === "true";
    const provider = typeof request.headers["x-canvasium-provider"] === "string"
      ? request.headers["x-canvasium-provider"]
      : undefined;
    const model = typeof request.headers["x-canvasium-model"] === "string"
      ? request.headers["x-canvasium-model"].trim()
      : undefined;
    if (!offline && provider && !["ollama", "openai", "openai-compatible"].includes(provider)) {
      return reply.code(400).send({ error: "Unsupported AI provider selection." });
    }
    if (!offline && model !== undefined && (!model || model.length > 128 || (model.split("").some((character) => character.charCodeAt(0) < 32)))) {
      return reply.code(400).send({ error: "Invalid AI model selection." });
    }
    if (!offline && provider && model && !(await isAIModelAllowed(provider, model))) {
      return reply.code(400).send({ error: "The selected model is not available for this provider." });
    }
    return await createPlan(parsed.data, { offline, provider, model });
  } catch (error) {
    request.log.error(
      { errorName: error instanceof Error ? error.name : "UnknownError" },
      "AI planning failed",
    );
    return reply.code(502).send({ error: "AI planning failed" });
  }
};

app.post("/api/plan", handlePlan);
app.post("/api/v1/plan", handlePlan);
if (process.env.MCP_ENABLED !== "false") await registerMcpEndpoint(app);

const port = Number(process.env.BACKEND_PORT ?? 3001);
const host = process.env.BACKEND_HOST ?? "0.0.0.0";

async function start() {
  try {
    await app.listen({ port, host });
  } catch (error) {
    app.log.error(error);
    process.exitCode = 1;
  }
}

void start();
