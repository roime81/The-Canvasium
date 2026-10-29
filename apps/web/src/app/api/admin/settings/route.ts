import { auth } from "@/auth";
import { isAdminEmail } from "@/lib/admin";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { z } from "zod";

const SettingsSchema = z.object({
  plannerEnabled: z.boolean(),
  defaultProvider: z.literal("openai"),
  defaultModel: z.string().trim().min(1).max(100),
});

async function requireAdmin() {
  const session = await auth();
  return isAdminEmail(session?.user?.email) ? session : null;
}

export async function GET() {
  if (!await requireAdmin()) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  try {
    const settings = await prisma.appSetting.upsert({
      where: { id: 1 },
      create: { id: 1 },
      update: {},
    });
    return NextResponse.json(settings);
  } catch {
    return NextResponse.json({ error: "Settings database is unavailable." }, { status: 503 });
  }
}

export async function PUT(request: Request) {
  const session = await requireAdmin();
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const parsed = SettingsSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "Invalid settings." }, { status: 400 });
  try {
    const settings = await prisma.appSetting.upsert({
      where: { id: 1 },
      create: { id: 1, ...parsed.data, updatedBy: session.user.email },
      update: { ...parsed.data, updatedBy: session.user.email },
    });
    return NextResponse.json(settings);
  } catch {
    return NextResponse.json({ error: "Settings database is unavailable." }, { status: 503 });
  }
}
