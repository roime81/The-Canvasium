import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

const backendUrl = process.env.BACKEND_URL ?? "http://127.0.0.1:3001";

export async function POST(request: Request) {
  const session = await auth();
  const offline = request.headers.get("x-canvasium-offline") === "true";
  if (!session?.user && !(offline && process.env.NODE_ENV !== "production")) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  let settings;
  try {
    settings = await prisma.appSetting.findUnique({ where: { id: 1 } });
  } catch {
    if (offline && process.env.NODE_ENV !== "production") {
      settings = null;
    } else {
      return NextResponse.json({ error: "Settings database is unavailable." }, { status: 503 });
    }
  }
  if (settings && !settings.plannerEnabled) {
    return NextResponse.json({ error: "The AI planner is disabled by an administrator." }, { status: 503 });
  }

  const response = await fetch(`${backendUrl}/api/plan`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-canvasium-offline": offline ? "true" : "false",
      "x-canvasium-model": settings?.defaultModel ?? process.env.AI_MODEL ?? "gpt-4o-mini",
      ...(process.env.INTERNAL_API_SECRET ? { "x-canvasium-internal-secret": process.env.INTERNAL_API_SECRET } : {}),
    },
    body: await request.text(),
  });

  return new NextResponse(response.body, {
    status: response.status,
    headers: { "content-type": response.headers.get("content-type") ?? "application/json" },
  });
}
