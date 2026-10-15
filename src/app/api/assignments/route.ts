import { NextResponse } from "next/server";
import { z } from "zod";
import { requireOwnerSession } from "@/lib/api-auth";
import {
  conflictsForProposed,
  formatConflictMessage,
} from "@/lib/conflicts";
import { prisma } from "@/lib/prisma";
import { toDateString, type TimedSlot } from "@/lib/scheduling";

export const dynamic = "force-dynamic";

const createSchema = z.object({
  workerId: z.string().min(1),
  jobId: z.string().min(1),
  /** job | visit | stage | task — all optional targets beyond job */
  visitId: z.string().optional().nullable(),
  stageId: z.string().optional().nullable(),
  taskId: z.string().optional().nullable(),
  conflictOverrideReason: z.string().trim().max(2000).optional().nullable(),
});

export async function GET(request: Request) {
  const auth = await requireOwnerSession();
  if ("error" in auth) return auth.error;

  const url = new URL(request.url);
  const jobId = url.searchParams.get("jobId");
  const visitId = url.searchParams.get("visitId");
  const workerId = url.searchParams.get("workerId");

  const assignments = await prisma.assignment.findMany({
    where: {
      businessId: auth.session.businessId,
      ...(jobId ? { jobId } : {}),
      ...(visitId ? { visitId } : {}),
      ...(workerId ? { workerId } : {}),
    },
    include: {
      worker: { select: { id: true, name: true } },
      visit: {
        select: {
          id: true,
          workDate: true,
          allDay: true,
          startTime: true,
          endTime: true,
          status: true,
        },
      },
      stage: { select: { id: true, key: true, label: true } },
      task: { select: { id: true, title: true, kind: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({
    assignments: assignments.map((a) => ({
      id: a.id,
      workerId: a.workerId,
      workerName: a.worker.name,
      jobId: a.jobId,
      visitId: a.visitId,
      stageId: a.stageId,
      taskId: a.taskId,
      level: a.taskId
        ? "task"
        : a.stageId
          ? "stage"
          : a.visitId
            ? "visit"
            : "job",
      visit: a.visit
        ? {
            ...a.visit,
            workDate: toDateString(a.visit.workDate),
          }
        : null,
      stage: a.stage,
      task: a.task,
      conflictOverrideReason: a.conflictOverrideReason,
      createdAt: a.createdAt,
    })),
  });
}

export async function POST(request: Request) {
  const auth = await requireOwnerSession();
  if ("error" in auth) return auth.error;

  const body = await request.json().catch(() => null);
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid assignment" }, { status: 400 });
  }

  const { workerId, jobId } = parsed.data;
  const visitId = parsed.data.visitId || null;
  const stageId = parsed.data.stageId || null;
  const taskId = parsed.data.taskId || null;

  const targets = [visitId, stageId, taskId].filter(Boolean);
  if (targets.length > 1) {
    return NextResponse.json(
      { error: "Assign to at most one of visit, stage, or task" },
      { status: 400 },
    );
  }

  const [worker, job] = await Promise.all([
    prisma.worker.findFirst({
      where: {
        id: workerId,
        businessId: auth.session.businessId,
        archivedAt: null,
      },
    }),
    prisma.job.findFirst({
      where: { id: jobId, businessId: auth.session.businessId },
    }),
  ]);
  if (!worker) {
    return NextResponse.json({ error: "Worker not found" }, { status: 404 });
  }
  if (!job) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }

  if (visitId) {
    const visit = await prisma.visit.findFirst({
      where: { id: visitId, jobId, businessId: auth.session.businessId },
    });
    if (!visit) {
      return NextResponse.json({ error: "Visit not found" }, { status: 404 });
    }
  }
  if (stageId) {
    const stage = await prisma.jobStage.findFirst({
      where: { id: stageId, jobId, businessId: auth.session.businessId },
    });
    if (!stage) {
      return NextResponse.json({ error: "Stage not found" }, { status: 404 });
    }
  }
  if (taskId) {
    const task = await prisma.task.findFirst({
      where: { id: taskId, jobId, businessId: auth.session.businessId },
    });
    if (!task) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 });
    }
  }

  // Conflict check for visit-level timed assignments
  if (visitId) {
    const visit = await prisma.visit.findFirst({
      where: { id: visitId, businessId: auth.session.businessId },
    });
    if (
      visit &&
      !visit.allDay &&
      visit.startTime &&
      visit.endTime &&
      visit.status !== "canceled"
    ) {
      const proposed: TimedSlot[] = [
        {
          workerId,
          jobId,
          visitId,
          workDate: toDateString(visit.workDate),
          startTime: visit.startTime,
          endTime: visit.endTime,
        },
      ];
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
  }

  // Job-level: check against other jobs' timed visits for this worker
  if (!visitId && !stageId && !taskId) {
    const visits = await prisma.visit.findMany({
      where: {
        jobId,
        businessId: auth.session.businessId,
        status: { not: "canceled" },
        allDay: false,
        startTime: { not: null },
        endTime: { not: null },
      },
    });
    if (visits.length) {
      const proposed: TimedSlot[] = visits
        .filter((v) => v.startTime && v.endTime)
        .map((v) => ({
          workerId,
          jobId,
          visitId: v.id,
          workDate: toDateString(v.workDate),
          startTime: v.startTime!,
          endTime: v.endTime!,
        }));
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
  }

  const assignment = await prisma.assignment.create({
    data: {
      businessId: auth.session.businessId,
      workerId,
      jobId,
      visitId,
      stageId,
      taskId,
      conflictOverrideReason:
        parsed.data.conflictOverrideReason?.trim() || null,
    },
    include: {
      worker: { select: { id: true, name: true } },
      stage: { select: { id: true, key: true, label: true } },
      task: { select: { id: true, title: true } },
    },
  });

  return NextResponse.json(
    {
      assignment: {
        id: assignment.id,
        workerId: assignment.workerId,
        workerName: assignment.worker.name,
        jobId: assignment.jobId,
        visitId: assignment.visitId,
        stageId: assignment.stageId,
        taskId: assignment.taskId,
        stage: assignment.stage,
        task: assignment.task,
        conflictOverrideReason: assignment.conflictOverrideReason,
      },
    },
    { status: 201 },
  );
}
