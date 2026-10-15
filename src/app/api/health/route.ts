import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
  const started = Date.now();
  let database: "ok" | "error" | "unconfigured" = "unconfigured";
  let databaseError: string | undefined;

  if (!process.env.DATABASE_URL) {
    return NextResponse.json(
      {
        ok: false,
        service: "canopy",
        database,
        uptimeMs: Date.now() - started,
        error: "DATABASE_URL is not set",
      },
      { status: 503 },
    );
  }

  try {
    await prisma.$queryRaw`SELECT 1`;
    database = "ok";
  } catch (err) {
    database = "error";
    databaseError = err instanceof Error ? err.message : "unknown database error";
  }

  const ok = database === "ok";
  return NextResponse.json(
    {
      ok,
      service: "canopy",
      database,
      ...(databaseError ? { databaseError } : {}),
      uptimeMs: Date.now() - started,
    },
    { status: ok ? 200 : 503 },
  );
}
