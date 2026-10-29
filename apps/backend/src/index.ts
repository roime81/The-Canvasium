import dotenv from "dotenv";
import Fastify from "fastify";
import { PlanRequestSchema } from "@canvasium/types";
import { createPlan } from "./planner.js";

dotenv.config({ path: "../../.env" });

const app = Fastify({ logger: true });

app.get("/health", async () => ({ status: "ok" }));

app.post("/api/plan", async (request, reply) => {
  const parsed = PlanRequestSchema.safeParse(request.body);
  if (!parsed.success) {
    return reply.code(400).send({ error: "Invalid prompt", issues: parsed.error.issues });
  }

  try {
    const offline = request.headers["x-canvasium-offline"] === "true";
    return await createPlan(parsed.data, { offline });
  } catch (error) {
    request.log.error(
      { errorName: error instanceof Error ? error.name : "UnknownError" },
      "AI planning failed",
    );
    return reply.code(502).send({ error: "AI planning failed" });
  }
});

const port = Number(process.env.BACKEND_PORT ?? 3001);
const host = process.env.BACKEND_HOST ?? "0.0.0.0";

try {
  await app.listen({ port, host });
} catch (error) {
  app.log.error(error);
  process.exitCode = 1;
}
