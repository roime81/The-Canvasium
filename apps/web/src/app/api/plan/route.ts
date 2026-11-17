import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { PlanRequestSchema } from "@canvasium/types";

const backendUrl = process.env.BACKEND_URL ?? "http://127.0.0.1:3001";

export async function POST(request: Request) {
  const session = await auth();
  const offline = request.headers.get("x-canvasium-offline") === "true";
  const isDesktop = process.env.CANVASIUM_DESKTOP === "1";
  if (!session?.user && !isDesktop && !(offline && process.env.NODE_ENV !== "production")) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }
  const body = await request.text();
  let payload: unknown;
  try {
    payload = JSON.parse(body);
  } catch {
    return NextResponse.json({ error: "Invalid JSON request body." }, { status: 400 });
  }
  const planRequest = PlanRequestSchema.safeParse(payload);
  if (!planRequest.success) return NextResponse.json({ error: "Invalid prompt." }, { status: 400 });

  let settings;
  try {
    settings = await prisma.appSetting.findUnique({ where: { id: 1 } });
  } catch {
    if (isDesktop || (offline && process.env.NODE_ENV !== "production")) {
      settings = null;
    } else {
      return NextResponse.json({ error: "Settings database is unavailable." }, { status: 503 });
    }
  }
  if (settings && !settings.plannerEnabled) {
    return NextResponse.json({ error: "The AI planner is disabled by an administrator." }, { status: 503 });
  }
  if (session?.user && !offline) {
    const windowStart = new Date(Date.now() - 60_000);
    const recentRequests = await prisma.promptEvent.count({
      where: { userId: session.user.id, createdAt: { gte: windowStart } },
    });
    if (recentRequests >= 20) {
      return NextResponse.json({ error: "Prompt limit reached. Try again in a minute." }, { status: 429 });
    }
  }

  const requestedProvider = request.headers.get("x-canvasium-provider") ?? undefined;
  const requestedModel = request.headers.get("x-canvasium-model") ?? undefined;
  if (requestedProvider && !["ollama", "openai", "openai-compatible"].includes(requestedProvider)) {
    return NextResponse.json({ error: "Unsupported AI provider selection." }, { status: 400 });
  }
  if (requestedModel !== undefined && (!requestedModel.trim() || requestedModel.length > 128 || /[\\r\\n\\0]/.test(requestedModel))) {
    return NextResponse.json({ error: "Invalid AI model selection." }, { status: 400 });
  }
  const selectedProvider = requestedProvider ?? settings?.defaultProvider ?? process.env.AI_PROVIDER ?? "ollama";
  const selectedModel = requestedModel?.trim()
    ?? (selectedProvider === settings?.defaultProvider
      ? settings?.defaultModel
      : process.env.AI_MODEL)
    ?? "qwen2.5:7b";

  const response = await fetch(`${backendUrl}/api/plan`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-canvasium-offline": offline ? "true" : "false",
      "x-canvasium-provider": selectedProvider,
      "x-canvasium-model": selectedModel,
      ...(process.env.INTERNAL_API_SECRET ? { "x-canvasium-internal-secret": process.env.INTERNAL_API_SECRET } : {}),
    },
    body,
  });
  if (session?.user) {
    await prisma.promptEvent.create({
      data: {
        userId: session.user.id,
        prompt: planRequest.data.prompt,
        status: response.ok ? "success" : "failed",
      },
    });
  }

  return new NextResponse(response.body, {
    status: response.status,
    headers: { "content-type": response.headers.get("content-type") ?? "application/json" },
  });
}
