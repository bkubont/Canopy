import { NextResponse } from "next/server";
import { z } from "zod";
import { requireOwnerSession } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/** Phase 2 placeholder — enough for task-level assignments before Phase 3 depth. */
const createSchema = z.object({
  title: z.string().trim().min(1).max(200),
  kind: z.enum(["general", "dump"]).optional().default("general"),
});

type Ctx = { params: Promise<{ id: string }> };

export async function POST(request: Request, ctx: Ctx) {
  const auth = await requireOwnerSession();
  if ("error" in auth) return auth.error;
  const { id: jobId } = await ctx.params;

  const job = await prisma.job.findFirst({
    where: { id: jobId, businessId: auth.session.businessId },
  });
  if (!job) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }

  const body = await request.json().catch(() => null);
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Title required" }, { status: 400 });
  }

  const task = await prisma.task.create({
    data: {
      businessId: auth.session.businessId,
      jobId,
      title: parsed.data.title,
      kind: parsed.data.kind,
    },
  });

  return NextResponse.json({ task }, { status: 201 });
}
