import { NextResponse } from "next/server";
import { z } from "zod";
import { requireOwnerSession } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const createSchema = z.object({
  name: z.string().trim().min(1).max(120),
  phone: z.string().trim().max(64).optional().nullable(),
  role: z.string().trim().max(128).optional().nullable(),
});

export async function GET(request: Request) {
  const auth = await requireOwnerSession();
  if ("error" in auth) return auth.error;

  const url = new URL(request.url);
  const archived = url.searchParams.get("archived");
  const q = (url.searchParams.get("q") || "").trim().toLowerCase();

  const workers = await prisma.worker.findMany({
    where: {
      businessId: auth.session.businessId,
      ...(archived === "1"
        ? { archivedAt: { not: null } }
        : archived === "all"
          ? {}
          : { archivedAt: null }),
      ...(q
        ? {
            OR: [
              { name: { contains: q } },
              { role: { contains: q } },
              { phone: { contains: q } },
            ],
          }
        : {}),
    },
    orderBy: { name: "asc" },
  });

  return NextResponse.json({ workers });
}

export async function POST(request: Request) {
  const auth = await requireOwnerSession();
  if ("error" in auth) return auth.error;

  const body = await request.json().catch(() => null);
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Name is required" }, { status: 400 });
  }

  const worker = await prisma.worker.create({
    data: {
      businessId: auth.session.businessId,
      name: parsed.data.name,
      phone: parsed.data.phone || null,
      role: parsed.data.role || null,
    },
  });

  return NextResponse.json({ worker }, { status: 201 });
}
