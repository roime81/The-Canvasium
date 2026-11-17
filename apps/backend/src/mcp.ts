import type { FastifyInstance } from "fastify";
import { PlanRequestSchema } from "@canvasium/types";
import { createPlan } from "./planner.js";

type JsonRpcRequest = {
  jsonrpc?: string;
  id?: string | number | null;
  method?: string;
  params?: Record<string, unknown>;
};

const tools = [{
  name: "canvas_plan",
  description: "Create a validated Canvasium workspace plan from a natural-language request.",
  inputSchema: {
    type: "object",
    properties: {
      prompt: { type: "string", description: "What the user wants to create." },
      sources: { type: "array", description: "Connected source metadata.", items: { type: "object" } },
    },
    required: ["prompt"],
  },
}];

function rpcError(id: JsonRpcRequest["id"], code: number, message: string) {
  return { jsonrpc: "2.0", id: id ?? null, error: { code, message } };
}

export async function registerMcpEndpoint(app: FastifyInstance) {
  app.post("/mcp", async (request, reply) => {
    const configuredKey = process.env.MCP_API_KEY;
    if (configuredKey && request.headers.authorization !== `Bearer ${configuredKey}`) {
      return reply.code(401).send(rpcError(null, -32001, "Unauthorized MCP client"));
    }

    const body = request.body as JsonRpcRequest;
    if (!body || body.jsonrpc !== "2.0" || typeof body.method !== "string") {
      return reply.code(400).send(rpcError(body?.id, -32600, "Invalid JSON-RPC request"));
    }

    if (body.method.startsWith("notifications/")) return reply.code(202).send();

    if (body.method === "initialize") {
      return {
        jsonrpc: "2.0",
        id: body.id ?? null,
        result: {
          protocolVersion: "2025-03-26",
          capabilities: { tools: {} },
          serverInfo: { name: "canvasium", version: "0.2.0" },
        },
      };
    }

    if (body.method === "ping") return { jsonrpc: "2.0", id: body.id ?? null, result: {} };

    if (body.method === "tools/list") {
      return { jsonrpc: "2.0", id: body.id ?? null, result: { tools } };
    }

    if (body.method === "tools/call") {
      const name = body.params?.name;
      const args = body.params?.arguments;
      if (name !== "canvas_plan" || !args || typeof args !== "object") {
        return rpcError(body.id, -32602, "Unknown tool or invalid arguments");
      }
      const parsed = PlanRequestSchema.safeParse(args);
      if (!parsed.success) return rpcError(body.id, -32602, "Invalid canvas_plan arguments");
      try {
        const result = await createPlan(parsed.data);
        return {
          jsonrpc: "2.0",
          id: body.id ?? null,
          result: {
            content: [{ type: "text", text: JSON.stringify(result) }],
            structuredContent: result,
            isError: false,
          },
        };
      } catch {
        return rpcError(body.id, -32000, "Canvas planning failed");
      }
    }

    return rpcError(body.id, -32601, "Method not found");
  });
}
