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
  resolveSelectedDays,
  toDateString,
  type TimedSlot,
} from "@/lib/scheduling";

export const dynamic = "force-dynamic";

const createSchema = z.object({
  startDate: z.string(),
  endDate: z.string().optional(),
  /** Explicit days within the range — required; never auto-skip weekends */
  selectedDays: z.array(z.string()).min(1),
  allDay: z.boolean().default(true),
  startTime: z.string().optional().nullable(),
  endTime: z.string().optional().nullable(),
  notes: z.string().trim().max(5000).optional().nullable(),
  /** Opt-in: copy job-level worker assignments onto each new visit */
  copyJobWorkers: z.boolean().optional().default(false),
  workerIds: z.array(z.string()).optional().default([]),
  conflictOverrideReason: z.string().trim().max(2000).optional().nullable(),
});

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_request: Request, ctx: Ctx) {
  const auth = await requireOwnerSession();
  if ("error" in auth) return auth.error;
  const { id: jobId } = await ctx.params;

  const job = await prisma.job.findFirst({
    where: { id: jobId, businessId: auth.session.businessId },
    select: { id: true },
  });
  if (!job) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }

  const visits = await prisma.visit.findMany({
    where: { jobId, businessId: auth.session.businessId },
    orderBy: { workDate: "asc" },
    include: {
      assignments: {
        include: { worker: { select: { id: true, name: true } } },
      },
    },
  });

  return NextResponse.json({
    visits: visits.map((v) => serializeVisit(v)),
  });
}

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
  if (job.canceledAt) {
    return NextResponse.json(
      { error: "Cannot schedule visits on a canceled job" },
      { status: 400 },
    );
  }

  const body = await request.json().catch(() => null);
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid visit payload — select dates explicitly" },
      { status: 400 },
    );
  }

  const startDate = parsed.data.startDate;
  const endDate = parsed.data.endDate || startDate;
  if (!isDateString(startDate) || !isDateString(endDate)) {
    return NextResponse.json({ error: "Invalid dates" }, { status: 400 });
  }

  const resolved = resolveSelectedDays(
    startDate,
    endDate,
    parsed.data.selectedDays,
  );
  if (!resolved.ok) {
    return NextResponse.json({ error: resolved.error }, { status: 400 });
  }

  const allDay = parsed.data.allDay;
  let startTime = parsed.data.startTime || null;
  let endTime = parsed.data.endTime || null;
  if (allDay) {
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
  }

  const workerIds = [...new Set(parsed.data.workerIds || [])];
  if (workerIds.length) {
    const count = await prisma.worker.count({
      where: {
        businessId: auth.session.businessId,
        id: { in: workerIds },
        archivedAt: null,
      },
    });
    if (count !== workerIds.length) {
      return NextResponse.json(
        { error: "One or more workers not found" },
        { status: 400 },
      );
    }
  }

  let copyFromJob: string[] = [];
  if (parsed.data.copyJobWorkers) {
    const jobAssignments = await prisma.assignment.findMany({
      where: {
        businessId: auth.session.businessId,
        jobId,
        visitId: null,
        stageId: null,
        taskId: null,
      },
      select: { workerId: true },
    });
    copyFromJob = jobAssignments.map((a) => a.workerId);
  }

  const assignWorkerIds = [...new Set([...workerIds, ...copyFromJob])];

  // Conflict check for timed visits with assignments
  if (!allDay && assignWorkerIds.length && startTime && endTime) {
    const proposed: TimedSlot[] = [];
    for (const day of resolved.days) {
      for (const workerId of assignWorkerIds) {
        proposed.push({
          workerId,
          jobId,
          visitId: `pending:${day}`,
          workDate: day,
          startTime,
          endTime,
        });
      }
    }
    const hits = await conflictsForProposed(
      auth.session.businessId,
      proposed,
    );
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
    }
  }

  const overrideReason =
    parsed.data.conflictOverrideReason?.trim() || null;

  const created = await prisma.$transaction(async (tx) => {
    const visits = [];
    for (const day of resolved.days) {
      const visit = await tx.visit.create({
        data: {
          businessId: auth.session.businessId,
          jobId,
          workDate: new Date(`${day}T00:00:00.000Z`),
          allDay,
          startTime,
          endTime,
          status: "scheduled",
          notes: parsed.data.notes || null,
          assignments: assignWorkerIds.length
            ? {
                create: assignWorkerIds.map((workerId) => ({
                  businessId: auth.session.businessId,
                  workerId,
                  jobId,
                  conflictOverrideReason: overrideReason,
                })),
              }
            : undefined,
        },
        include: {
          assignments: {
            include: { worker: { select: { id: true, name: true } } },
          },
        },
      });
      visits.push(visit);
    }
    return visits;
  });

  return NextResponse.json(
    { visits: created.map((v) => serializeVisit(v)) },
    { status: 201 },
  );
}

function serializeVisit(v: {
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
  assignments?: {
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
    assignments: (v.assignments || []).map((a) => ({
      id: a.id,
      workerId: a.workerId,
      workerName: a.worker.name,
      conflictOverrideReason: a.conflictOverrideReason,
    })),
  };
}
