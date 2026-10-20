import { NextResponse } from "next/server";
import { z } from "zod";
import { requireOwnerSession } from "@/lib/api-auth";
import { executeStageAction } from "@/lib/kanban";
import { isDateString } from "@/lib/scheduling";

export const dynamic = "force-dynamic";

const actionSchema = z.object({
  stageKey: z.string().min(1),
  action: z.enum(["complete", "reopen", "not_needed", "start", "resume"]),
  workDate: z.string().min(1),
  visitId: z.string().optional().nullable(),
  requestId: z.string().min(1).max(128),
  expectedVersion: z.number().int().positive(),
});

type Ctx = { params: Promise<{ id: string }> };

/**
 * POST — explicit stage complete / reopen / not_needed / start / resume.
 * Start and resume do not change the primary kanban column.
 */
export async function POST(request: Request, ctx: Ctx) {
  const auth = await requireOwnerSession();
  if ("error" in auth) return auth.error;
  const { id: jobId } = await ctx.params;

  const body = await request.json().catch(() => null);
  const parsed = actionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid stage action" }, { status: 400 });
  }
  if (!isDateString(parsed.data.workDate)) {
    return NextResponse.json({ error: "Invalid workDate" }, { status: 400 });
  }

  const result = await executeStageAction({
    businessId: auth.session.businessId,
    userId: auth.session.userId,
    jobId,
    stageKey: parsed.data.stageKey,
    action: parsed.data.action,
    workDate: parsed.data.workDate,
    visitId: parsed.data.visitId,
    requestId: parsed.data.requestId,
    expectedVersion: parsed.data.expectedVersion,
  });

  return NextResponse.json(result.body, { status: result.status });
}
