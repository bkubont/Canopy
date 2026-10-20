import { NextResponse } from "next/server";
import { z } from "zod";
import { requireOwnerSession } from "@/lib/api-auth";
import { isDateString } from "@/lib/scheduling";
import { executeKanbanMove } from "@/lib/kanban";

export const dynamic = "force-dynamic";

const moveSchema = z.object({
  destination: z.string().min(1),
  workDate: z.string().min(1),
  visitId: z.string().optional().nullable(),
  requestId: z.string().min(1).max(128),
  expectedVersion: z.number().int().positive(),
});

type Ctx = { params: Promise<{ id: string }> };

/** POST — kanban move (idempotent, optimistic concurrency). */
export async function POST(request: Request, ctx: Ctx) {
  const auth = await requireOwnerSession();
  if ("error" in auth) return auth.error;
  const { id: jobId } = await ctx.params;

  const body = await request.json().catch(() => null);
  const parsed = moveSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid move payload" }, { status: 400 });
  }
  if (!isDateString(parsed.data.workDate)) {
    return NextResponse.json({ error: "Invalid workDate" }, { status: 400 });
  }

  const result = await executeKanbanMove({
    businessId: auth.session.businessId,
    userId: auth.session.userId,
    jobId,
    destination: parsed.data.destination,
    workDate: parsed.data.workDate,
    visitId: parsed.data.visitId,
    requestId: parsed.data.requestId,
    expectedVersion: parsed.data.expectedVersion,
  });

  return NextResponse.json(result.body, { status: result.status });
}
