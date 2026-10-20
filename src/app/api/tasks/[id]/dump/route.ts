import { NextResponse } from "next/server";
import { z } from "zod";
import { requireOwnerSession } from "@/lib/api-auth";
import { executeDumpAdvance } from "@/lib/kanban";
import { prisma } from "@/lib/prisma";
import { isDateString } from "@/lib/scheduling";

export const dynamic = "force-dynamic";

const schema = z.object({
  workDate: z.string().min(1),
  visitId: z.string().optional().nullable(),
  requestId: z.string().min(1).max(128),
  expectedVersion: z.number().int().positive(),
});

type Ctx = { params: Promise<{ id: string }> };

/** POST — advance dump run Depart → Return → Done (does not move kanban). */
export async function POST(request: Request, ctx: Ctx) {
  const auth = await requireOwnerSession();
  if ("error" in auth) return auth.error;
  const { id: taskId } = await ctx.params;

  const task = await prisma.task.findFirst({
    where: { id: taskId, businessId: auth.session.businessId, kind: "dump" },
  });
  if (!task) {
    return NextResponse.json({ error: "Dump task not found" }, { status: 404 });
  }

  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid dump advance" }, { status: 400 });
  }
  if (!isDateString(parsed.data.workDate)) {
    return NextResponse.json({ error: "Invalid workDate" }, { status: 400 });
  }

  const result = await executeDumpAdvance({
    businessId: auth.session.businessId,
    userId: auth.session.userId,
    jobId: task.jobId,
    taskId,
    workDate: parsed.data.workDate,
    visitId: parsed.data.visitId,
    requestId: parsed.data.requestId,
    expectedVersion: parsed.data.expectedVersion,
  });

  return NextResponse.json(result.body, { status: result.status });
}
