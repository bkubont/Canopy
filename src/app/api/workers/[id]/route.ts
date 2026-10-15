import { NextResponse } from "next/server";
import { z } from "zod";
import { requireOwnerSession } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const updateSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  phone: z.string().trim().max(64).optional().nullable(),
  role: z.string().trim().max(128).optional().nullable(),
  archive: z.boolean().optional(),
});

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_request: Request, ctx: Ctx) {
  const auth = await requireOwnerSession();
  if ("error" in auth) return auth.error;
  const { id } = await ctx.params;

  const worker = await prisma.worker.findFirst({
    where: { id, businessId: auth.session.businessId },
  });
  if (!worker) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json({ worker });
}

export async function PATCH(request: Request, ctx: Ctx) {
  const auth = await requireOwnerSession();
  if ("error" in auth) return auth.error;
  const { id } = await ctx.params;

  const existing = await prisma.worker.findFirst({
    where: { id, businessId: auth.session.businessId },
  });
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const body = await request.json().catch(() => null);
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid update" }, { status: 400 });
  }

  const data: Record<string, unknown> = {};
  if (parsed.data.name !== undefined) data.name = parsed.data.name;
  if (parsed.data.phone !== undefined) data.phone = parsed.data.phone || null;
  if (parsed.data.role !== undefined) data.role = parsed.data.role || null;
  if (parsed.data.archive === true) data.archivedAt = new Date();
  if (parsed.data.archive === false) data.archivedAt = null;

  const worker = await prisma.worker.update({ where: { id }, data });
  return NextResponse.json({ worker });
}

export async function DELETE(request: Request, ctx: Ctx) {
  const auth = await requireOwnerSession();
  if ("error" in auth) return auth.error;
  const { id } = await ctx.params;

  const existing = await prisma.worker.findFirst({
    where: { id, businessId: auth.session.businessId },
  });
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const body = await request.json().catch(() => ({}));
  const confirmName =
    typeof body?.confirmName === "string" ? body.confirmName.trim() : "";
  if (confirmName !== existing.name) {
    return NextResponse.json(
      { error: "Permanent delete requires confirmName to match exactly" },
      { status: 400 },
    );
  }

  await prisma.worker.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
