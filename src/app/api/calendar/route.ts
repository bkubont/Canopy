import { NextResponse } from "next/server";
import { requireOwnerSession } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import {
  addDays,
  isDateString,
  monthGridOrigin,
  startOfMonth,
  toDateString,
  weekOrigin,
} from "@/lib/scheduling";

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
  const dateParam = url.searchParams.get("date") || todayInTz("America/Detroit");
  if (!isDateString(dateParam)) {
    return NextResponse.json({ error: "Invalid date" }, { status: 400 });
  }

  const workerId = url.searchParams.get("workerId");
  const unassigned = url.searchParams.get("unassigned") === "1";

  const business = await prisma.business.findUnique({
    where: { id: auth.session.businessId },
    select: { timezone: true },
  });
  const timezone = business?.timezone || "America/Detroit";

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
          client: { select: { id: true, name: true } },
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

  let cards = visits.map((v) => {
    const visitWorkers = v.assignments.map((a) => a.worker);
    const inherited = jobWorkers.get(v.jobId) || [];
    const byId = new Map<string, { id: string; name: string }>();
    for (const w of [...inherited, ...visitWorkers]) byId.set(w.id, w);
    const workers = [...byId.values()];
    return {
      visitId: v.id,
      jobId: v.job.id,
      jobTitle: v.job.title,
      clientName: v.job.client.name,
      workDate: toDateString(v.workDate),
      allDay: v.allDay,
      startTime: v.startTime,
      endTime: v.endTime,
      notes: v.notes,
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
    rangeStart,
    rangeEndExclusive: rangeEnd,
    cards,
  });
}

function todayInTz(tz: string): string {
  try {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: tz,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(new Date());
    const y = parts.find((p) => p.type === "year")?.value;
    const m = parts.find((p) => p.type === "month")?.value;
    const d = parts.find((p) => p.type === "day")?.value;
    if (y && m && d) return `${y}-${m}-${d}`;
  } catch {
    /* fall through */
  }
  return new Date().toISOString().slice(0, 10);
}
