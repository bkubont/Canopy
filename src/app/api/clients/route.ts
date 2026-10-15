import { NextResponse } from "next/server";
import { z } from "zod";
import { requireOwnerSession } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const createSchema = z.object({
  name: z.string().trim().min(1).max(200),
  phone: z.string().trim().max(64).optional().nullable(),
  email: z.string().trim().email().max(255).optional().nullable().or(z.literal("")),
  address: z.string().trim().max(2000).optional().nullable(),
  notes: z.string().trim().max(10000).optional().nullable(),
});

export async function GET(request: Request) {
  const auth = await requireOwnerSession();
  if ("error" in auth) return auth.error;

  const url = new URL(request.url);
  const q = (url.searchParams.get("q") || "").trim().toLowerCase();
  const archived = url.searchParams.get("archived"); // "0" | "1" | "all"

  const clients = await prisma.client.findMany({
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
              { phone: { contains: q } },
              { email: { contains: q } },
              { address: { contains: q } },
            ],
          }
        : {}),
    },
    orderBy: { name: "asc" },
    include: {
      _count: {
        select: {
          jobs: {
            where: { archivedAt: null },
          },
        },
      },
    },
  });

  return NextResponse.json({
    clients: clients.map((c) => ({
      id: c.id,
      name: c.name,
      phone: c.phone,
      email: c.email,
      address: c.address,
      notes: c.notes,
      archivedAt: c.archivedAt,
      activeJobCount: c._count.jobs,
      createdAt: c.createdAt,
      updatedAt: c.updatedAt,
    })),
  });
}

export async function POST(request: Request) {
  const auth = await requireOwnerSession();
  if ("error" in auth) return auth.error;

  const body = await request.json().catch(() => null);
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Name is required (other fields optional)" },
      { status: 400 },
    );
  }

  const email =
    parsed.data.email && parsed.data.email.length > 0
      ? parsed.data.email
      : null;

  const client = await prisma.client.create({
    data: {
      businessId: auth.session.businessId,
      name: parsed.data.name,
      phone: parsed.data.phone || null,
      email,
      address: parsed.data.address || null,
      notes: parsed.data.notes || null,
    },
  });

  return NextResponse.json({ client }, { status: 201 });
}
