import { NextResponse } from "next/server";
import { requireOwnerSession } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function DELETE(_request: Request, ctx: Ctx) {
  const auth = await requireOwnerSession();
  if ("error" in auth) return auth.error;
  const { id } = await ctx.params;

  const existing = await prisma.assignment.findFirst({
    where: { id, businessId: auth.session.businessId },
  });
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await prisma.assignment.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
