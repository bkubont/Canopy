import { NextResponse } from "next/server";
import { z } from "zod";
import { requireOwnerSession } from "@/lib/api-auth";
import { executeEventReversal } from "@/lib/kanban";

export const dynamic = "force-dynamic";

const schema = z.object({
  reason: z.string().trim().min(1).max(2000),
  requestId: z.string().min(1).max(128),
  expectedVersion: z.number().int().positive(),
});

type Ctx = { params: Promise<{ id: string; eventId: string }> };

export async function POST(request: Request, ctx: Ctx) {
  const auth = await requireOwnerSession();
  if ("error" in auth) return auth.error;
  const { id: jobId, eventId } = await ctx.params;

  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid reversal payload" }, { status: 400 });
  }

  const result = await executeEventReversal({
    businessId: auth.session.businessId,
    userId: auth.session.userId,
    jobId,
    eventId,
    reason: parsed.data.reason,
    requestId: parsed.data.requestId,
    expectedVersion: parsed.data.expectedVersion,
  });

  return NextResponse.json(result.body, { status: result.status });
}
