import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { CanvasStateSchema } from "@canvasium/types";
import { NextResponse } from "next/server";

const defaultCanvas = {
  canvasId: "canvasium-home",
  title: "Untitled canvas",
  connectedSources: [],
  activeLayoutMode: "document",
  blocks: [],
};

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  try {
    const canvas = await prisma.canvas.upsert({
      where: { userId: session.user.id },
      create: { userId: session.user.id, state: JSON.stringify(defaultCanvas) },
      update: {},
    });
    const parsed = CanvasStateSchema.safeParse(JSON.parse(canvas.state));
    if (!parsed.success) return NextResponse.json({ error: "Stored canvas is invalid." }, { status: 500 });
    return NextResponse.json(parsed.data);
  } catch {
    return NextResponse.json({ error: "Canvas database is unavailable." }, { status: 503 });
  }
}

export async function PUT(request: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const parsed = CanvasStateSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "Invalid canvas." }, { status: 400 });
  try {
    await prisma.canvas.upsert({
      where: { userId: session.user.id },
      create: { userId: session.user.id, state: JSON.stringify(parsed.data) },
      update: { state: JSON.stringify(parsed.data) },
    });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Canvas database is unavailable." }, { status: 503 });
  }
}
