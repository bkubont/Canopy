import { NextResponse } from "next/server";
import { z } from "zod";
import { requireOwnerSession } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { isDateString, toDateString } from "@/lib/scheduling";
import { workDateToUtc } from "@/lib/timezone";

export const dynamic = "force-dynamic";

const patchSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  stageKey: z
    .enum(["estimate", "prep", "tree_work", "cleanup"])
    .optional()
    .nullable(),
  workDate: z.string().optional().nullable(),
  destination: z.string().trim().max(255).optional().nullable(),
  details: z.string().trim().max(5000).optional().nullable(),
  done: z.boolean().optional(),
});

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, ctx: Ctx) {
  const auth = await requireOwnerSession();
  if ("error" in auth) return auth.error;
  const { id } = await ctx.params;

  const existing = await prisma.task.findFirst({
    where: { id, businessId: auth.session.businessId },
  });
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const body = await request.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid update" }, { status: 400 });
  }

  if (parsed.data.workDate && !isDateString(parsed.data.workDate)) {
    return NextResponse.json({ error: "Invalid workDate" }, { status: 400 });
  }

  const data: Record<string, unknown> = {};
  if (parsed.data.title !== undefined) data.title = parsed.data.title;
  if (parsed.data.stageKey !== undefined) data.stageKey = parsed.data.stageKey;
  if (parsed.data.workDate !== undefined) {
    data.workDate = parsed.data.workDate
      ? workDateToUtc(parsed.data.workDate)
      : null;
  }
  if (parsed.data.destination !== undefined) {
    data.destination = parsed.data.destination || null;
  }
  if (parsed.data.details !== undefined) {
    data.details = parsed.data.details || null;
  }
  if (parsed.data.done !== undefined) {
    data.done = parsed.data.done;
    if (existing.kind === "dump" && parsed.data.done) {
      data.dumpStatus = "done";
    }
  }

  const task = await prisma.task.update({ where: { id }, data });
  return NextResponse.json({
    task: {
      id: task.id,
      title: task.title,
      kind: task.kind,
      stageKey: task.stageKey,
      workDate: task.workDate ? toDateString(task.workDate) : null,
      destination: task.destination,
      details: task.details,
      dumpStatus: task.dumpStatus,
      done: task.done,
    },
  });
}

export async function DELETE(_request: Request, ctx: Ctx) {
  const auth = await requireOwnerSession();
  if ("error" in auth) return auth.error;
  const { id } = await ctx.params;

  const existing = await prisma.task.findFirst({
    where: { id, businessId: auth.session.businessId },
  });
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await prisma.task.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
