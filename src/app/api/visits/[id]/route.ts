import { NextResponse } from "next/server";
import { z } from "zod";
import { requireOwnerSession } from "@/lib/api-auth";
import {
  conflictsForProposed,
  formatConflictMessage,
} from "@/lib/conflicts";
import { prisma } from "@/lib/prisma";
import {
  isDateString,
  isTimeString,
  toDateString,
  type TimedSlot,
} from "@/lib/scheduling";

export const dynamic = "force-dynamic";

const updateSchema = z.object({
  workDate: z.string().optional(),
  allDay: z.boolean().optional(),
  startTime: z.string().optional().nullable(),
  endTime: z.string().optional().nullable(),
  notes: z.string().trim().max(5000).optional().nullable(),
  cancel: z.boolean().optional(),
  conflictOverrideReason: z.string().trim().max(2000).optional().nullable(),
});

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, ctx: Ctx) {
  const auth = await requireOwnerSession();
  if ("error" in auth) return auth.error;
  const { id } = await ctx.params;

  const existing = await prisma.visit.findFirst({
    where: { id, businessId: auth.session.businessId },
    include: {
      assignments: { select: { id: true, workerId: true } },
    },
  });
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const body = await request.json().catch(() => null);
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid update" }, { status: 400 });
  }

  if (parsed.data.cancel === true) {
    const visit = await prisma.visit.update({
      where: { id },
      data: { status: "canceled", canceledAt: new Date() },
      include: {
        assignments: {
          include: { worker: { select: { id: true, name: true } } },
        },
      },
    });
    return NextResponse.json({ visit: serialize(visit) });
  }

  if (parsed.data.cancel === false) {
    const visit = await prisma.visit.update({
      where: { id },
      data: { status: "scheduled", canceledAt: null },
      include: {
        assignments: {
          include: { worker: { select: { id: true, name: true } } },
        },
      },
    });
    return NextResponse.json({ visit: serialize(visit) });
  }

  const data: Record<string, unknown> = {};
  if (parsed.data.workDate !== undefined) {
    if (!isDateString(parsed.data.workDate)) {
      return NextResponse.json({ error: "Invalid workDate" }, { status: 400 });
    }
    data.workDate = new Date(`${parsed.data.workDate}T00:00:00.000Z`);
  }
  if (parsed.data.notes !== undefined) data.notes = parsed.data.notes || null;

  const allDay =
    parsed.data.allDay !== undefined ? parsed.data.allDay : existing.allDay;
  let startTime =
    parsed.data.startTime !== undefined
      ? parsed.data.startTime
      : existing.startTime;
  let endTime =
    parsed.data.endTime !== undefined ? parsed.data.endTime : existing.endTime;

  if (parsed.data.allDay !== undefined) data.allDay = parsed.data.allDay;

  if (allDay) {
    data.startTime = null;
    data.endTime = null;
    startTime = null;
    endTime = null;
  } else {
    if (
      !startTime ||
      !endTime ||
      !isTimeString(startTime) ||
      !isTimeString(endTime) ||
      endTime <= startTime
    ) {
      return NextResponse.json(
        { error: "Timed visits need valid start/end times" },
        { status: 400 },
      );
    }
    data.startTime = startTime;
    data.endTime = endTime;
  }

  const workDateStr =
    parsed.data.workDate || toDateString(existing.workDate);

  if (!allDay && startTime && endTime && existing.assignments.length) {
    const proposed: TimedSlot[] = existing.assignments.map((a) => ({
      workerId: a.workerId,
      jobId: existing.jobId,
      visitId: existing.id,
      workDate: workDateStr,
      startTime,
      endTime,
      assignmentId: a.id,
    }));
    const hits = await conflictsForProposed(auth.session.businessId, proposed, {
      excludeAssignmentIds: existing.assignments.map((a) => a.id),
    });
    if (hits.length) {
      const reason = parsed.data.conflictOverrideReason?.trim();
      if (!reason) {
        return NextResponse.json(
          {
            error: "Scheduling conflict",
            conflicts: hits,
            message: formatConflictMessage(hits),
            requiresOverride: true,
          },
          { status: 409 },
        );
      }
      await prisma.assignment.updateMany({
        where: { visitId: id, businessId: auth.session.businessId },
        data: { conflictOverrideReason: reason },
      });
    }
  }

  const visit = await prisma.visit.update({
    where: { id },
    data,
    include: {
      assignments: {
        include: { worker: { select: { id: true, name: true } } },
      },
    },
  });
  return NextResponse.json({ visit: serialize(visit) });
}

export async function DELETE(_request: Request, ctx: Ctx) {
  const auth = await requireOwnerSession();
  if ("error" in auth) return auth.error;
  const { id } = await ctx.params;

  const existing = await prisma.visit.findFirst({
    where: { id, businessId: auth.session.businessId },
  });
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await prisma.visit.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}

function serialize(v: {
  id: string;
  jobId: string;
  workDate: Date;
  allDay: boolean;
  startTime: string | null;
  endTime: string | null;
  status: string;
  notes: string | null;
  canceledAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  assignments: {
    id: string;
    workerId: string;
    conflictOverrideReason: string | null;
    worker: { id: string; name: string };
  }[];
}) {
  return {
    id: v.id,
    jobId: v.jobId,
    workDate: toDateString(v.workDate),
    allDay: v.allDay,
    startTime: v.startTime,
    endTime: v.endTime,
    status: v.status,
    notes: v.notes,
    canceledAt: v.canceledAt,
    createdAt: v.createdAt,
    updatedAt: v.updatedAt,
    assignments: v.assignments.map((a) => ({
      id: a.id,
      workerId: a.workerId,
      workerName: a.worker.name,
      conflictOverrideReason: a.conflictOverrideReason,
    })),
  };
}
