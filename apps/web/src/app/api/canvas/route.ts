import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { CanvasStateSchema } from "@canvasium/types";
import { NextResponse } from "next/server";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";

const defaultCanvas = {
  canvasId: "canvasium-home",
  title: "Untitled canvas",
  connectedSources: [],
  activeLayoutMode: "document",
  blocks: [],
};

function desktopCanvasPath() {
  const dataDirectory = process.env.CANVASIUM_DATA_DIR;
  if (!dataDirectory) throw new Error("Missing CANVASIUM_DATA_DIR for desktop canvas.");
  return join(dataDirectory, "canvas.json");
}

async function getDesktopCanvas() {
  try {
    const savedCanvas = await readFile(desktopCanvasPath(), "utf8");
    const parsed = CanvasStateSchema.safeParse(JSON.parse(savedCanvas));
    if (!parsed.success) throw new Error("Stored desktop canvas is invalid.");
    return parsed.data;
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return defaultCanvas;
    throw error;
  }
}

export async function GET() {
  if (process.env.CANVASIUM_DESKTOP === "1") {
    try {
      return NextResponse.json(await getDesktopCanvas());
    } catch {
      return NextResponse.json({ error: "Desktop canvas storage is unavailable." }, { status: 503 });
    }
  }
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
  if (process.env.CANVASIUM_DESKTOP === "1") {
    const parsed = CanvasStateSchema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ error: "Invalid canvas." }, { status: 400 });
    try {
      const filePath = desktopCanvasPath();
      await mkdir(join(filePath, ".."), { recursive: true });
      const temporaryPath = `${filePath}.tmp`;
      await writeFile(temporaryPath, JSON.stringify(parsed.data), "utf8");
      await rename(temporaryPath, filePath);
      return NextResponse.json({ ok: true });
    } catch {
      return NextResponse.json({ error: "Desktop canvas storage is unavailable." }, { status: 503 });
    }
  }
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
