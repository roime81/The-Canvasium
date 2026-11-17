import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

const backendUrl = process.env.BACKEND_URL ?? "http://127.0.0.1:3001";

type ModelCatalog = {
  defaultProvider: string;
  defaultModel: string;
  providers: Array<{
    id: string;
    defaultModel: string;
    models: string[];
    label: string;
    description: string;
  }>;
};

export async function GET() {
  const session = await auth();
  const isDesktop = process.env.CANVASIUM_DESKTOP === "1";
  if (!session?.user && !isDesktop) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  const response = await fetch(`${backendUrl}/api/v1/models`, { cache: "no-store" });
  if (!response.ok) {
    return NextResponse.json({ error: "Could not load available AI models." }, { status: response.status });
  }

  const catalog = await response.json() as ModelCatalog;
  try {
    const settings = await prisma.appSetting.findUnique({ where: { id: 1 } });
    const configuredProvider = catalog.providers.find((provider) => provider.id === settings?.defaultProvider);
    if (configuredProvider) {
      const configuredModel = configuredProvider.models.includes(settings?.defaultModel ?? "")
        ? settings!.defaultModel
        : configuredProvider.defaultModel;
      return NextResponse.json({
        ...catalog,
        defaultProvider: configuredProvider.id,
        defaultModel: configuredModel,
      }, { headers: { "cache-control": "no-store" } });
    }
  } catch {
    // The runtime's server-side AI_PROVIDER/AI_MODEL defaults remain available
    // when the optional admin-settings database cannot be read.
  }

  return NextResponse.json(catalog, { headers: { "cache-control": "no-store" } });
}
