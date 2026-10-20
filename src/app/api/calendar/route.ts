import { NextResponse } from "next/server";
import { requireOwnerSession } from "@/lib/api-auth";
import { projectBadgesForDay } from "@/lib/board";
import { prisma } from "@/lib/prisma";
import {
  addDays,
  isDateString,
  monthGridOrigin,
  startOfMonth,
  toDateString,
  weekOrigin,
} from "@/lib/scheduling";
import { todayInTimezone } from "@/lib/timezone";

export const dynamic = "force-dynamic";

/**
 * GET /api/calendar?view=month|week|day|agenda&date=YYYY-MM-DD
 * Optional: workerId=… | unassigned=1
 */
export async function GET(request: Request) {
  const auth = await requireOwnerSession();
  if ("error" in auth) return auth.error;

  const url = new URL(request.url);
  const view = (url.searchParams.get("view") || "month").toLowerCase();
  const workerId = url.searchParams.get("workerId");
  const unassigned = url.searchParams.get("unassigned") === "1";

  const business = await prisma.business.findUnique({
    where: { id: auth.session.businessId },
    select: { timezone: true },
  });
  const timezone = business?.timezone || "America/Detroit";
  const dateParam = url.searchParams.get("date") || todayInTimezone(timezone);
  if (!isDateString(dateParam)) {
    return NextResponse.json({ error: "Invalid date" }, { status: 400 });
  }

  let rangeStart: string;
  let rangeEnd: string; // exclusive

  if (view === "week") {
    rangeStart = weekOrigin(dateParam);
    rangeEnd = addDays(rangeStart, 7);
  } else if (view === "day") {
    rangeStart = dateParam;
    rangeEnd = addDays(dateParam, 1);
  } else if (view === "agenda") {
    rangeStart = dateParam;
    rangeEnd = addDays(dateParam, 28);
  } else {
    // month — full 6-week grid
    const monthStart = startOfMonth(dateParam);
    rangeStart = monthGridOrigin(monthStart);
    rangeEnd = addDays(rangeStart, 42);
  }

  const visits = await prisma.visit.findMany({
    where: {
      businessId: auth.session.businessId,
      status: { not: "canceled" },
      workDate: {
        gte: new Date(`${rangeStart}T00:00:00.000Z`),
        lt: new Date(`${rangeEnd}T00:00:00.000Z`),
      },
      job: { archivedAt: null, canceledAt: null },
    },
    include: {
      job: {
        select: {
          id: true,
          title: true,
          boardColumn: true,
          client: { select: { id: true, name: true } },
          stages: {
            select: { key: true, progress: true },
            orderBy: { sortOrder: "asc" },
          },
        },
      },
      assignments: {
        include: { worker: { select: { id: true, name: true } } },
      },
    },
    orderBy: [{ workDate: "asc" }, { startTime: "asc" }],
  });

  // Also load job-level assignments for these visits' jobs
  const jobIds = [...new Set(visits.map((v) => v.jobId))];
  const jobAssignments = jobIds.length
    ? await prisma.assignment.findMany({
        where: {
          businessId: auth.session.businessId,
          jobId: { in: jobIds },
          visitId: null,
          stageId: null,
          taskId: null,
        },
        include: { worker: { select: { id: true, name: true } } },
      })
    : [];
  const jobWorkers = new Map<string, { id: string; name: string }[]>();
  for (const a of jobAssignments) {
    const list = jobWorkers.get(a.jobId) || [];
    list.push(a.worker);
    jobWorkers.set(a.jobId, list);
  }

  const events = jobIds.length
    ? await prisma.activityEvent.findMany({
        where: {
          businessId: auth.session.businessId,
          jobId: { in: jobIds },
          workDate: {
            gte: new Date(`${rangeStart}T00:00:00.000Z`),
            lt: new Date(`${rangeEnd}T00:00:00.000Z`),
          },
        },
        select: {
          jobId: true,
          workDate: true,
          type: true,
          stageKey: true,
          status: true,
        },
      })
    : [];

  const eventsByJobDate = new Map<
    string,
    { type: string; stageKey: string | null; status: string }[]
  >();
  for (const e of events) {
    const key = `${e.jobId}|${toDateString(e.workDate)}`;
    const list = eventsByJobDate.get(key) || [];
    list.push({
      type: e.type,
      stageKey: e.stageKey,
      status: e.status,
    });
    eventsByJobDate.set(key, list);
  }

  const today = todayInTimezone(timezone);

  let cards = visits.map((v) => {
    const visitWorkers = v.assignments.map((a) => a.worker);
    const inherited = jobWorkers.get(v.jobId) || [];
    const byId = new Map<string, { id: string; name: string }>();
    for (const w of [...inherited, ...visitWorkers]) byId.set(w.id, w);
    const workers = [...byId.values()];
    const workDate = toDateString(v.workDate);
    const badges = projectBadgesForDay(
      eventsByJobDate.get(`${v.jobId}|${workDate}`) || [],
      v.plannedStageKey,
    );
    const activeStage = v.job.stages.find((s) => s.progress === "in_progress");
    return {
      visitId: v.id,
      jobId: v.job.id,
      jobTitle: v.job.title,
      clientName: v.job.client.name,
      workDate,
      allDay: v.allDay,
      startTime: v.startTime,
      endTime: v.endTime,
      notes: v.notes,
      status: v.status,
      boardColumn: v.job.boardColumn,
      plannedStageKey: v.plannedStageKey,
      badges,
      canStart: Boolean(
        activeStage === undefined &&
          v.job.stages.some((s) => s.progress === "not_started") &&
          workDate <= today,
      ),
      canResume: Boolean(activeStage && workDate <= today),
      resumeStageKey: activeStage?.key || null,
      startStageKey:
        v.job.stages.find((s) => s.progress === "not_started")?.key || null,
      workers,
      unassigned: workers.length === 0,
      href: `/app/jobs/${v.job.id}?visit=${v.id}`,
    };
  });

  if (workerId) {
    cards = cards.filter((c) => c.workers.some((w) => w.id === workerId));
  } else if (unassigned) {
    cards = cards.filter((c) => c.unassigned);
  }

  return NextResponse.json({
    view,
    date: dateParam,
    timezone,
    today,
    rangeStart,
    rangeEndExclusive: rangeEnd,
    cards,
  });
}
