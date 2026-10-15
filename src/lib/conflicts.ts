import { prisma } from "@/lib/prisma";
import {
  findTimedConflicts,
  toDateString,
  type ConflictHit,
  type TimedSlot,
} from "@/lib/scheduling";

type VisitLike = {
  id: string;
  jobId: string;
  workDate: Date;
  allDay: boolean;
  startTime: string | null;
  endTime: string | null;
  status: string;
};

/**
 * Build timed slots from visit-level (and job-level copied to visit) assignments
 * for conflict detection. All-day visits never conflict on time.
 */
export async function loadTimedSlotsForBusiness(
  businessId: string,
  opts?: { excludeAssignmentIds?: string[] },
): Promise<TimedSlot[]> {
  const exclude = new Set(opts?.excludeAssignmentIds || []);

  const assignments = await prisma.assignment.findMany({
    where: {
      businessId,
      OR: [{ visitId: { not: null } }, { visitId: null, stageId: null, taskId: null }],
    },
    include: {
      visit: true,
      job: {
        include: {
          visits: {
            where: { status: { not: "canceled" } },
          },
        },
      },
    },
  });

  const slots: TimedSlot[] = [];

  for (const a of assignments) {
    if (exclude.has(a.id)) continue;

    if (a.visitId && a.visit) {
      pushVisitSlot(slots, a.workerId, a.visit, a.id);
      continue;
    }

    // Job-level assignment applies to every active timed visit on that job
    if (!a.visitId && !a.stageId && !a.taskId) {
      for (const v of a.job.visits) {
        pushVisitSlot(slots, a.workerId, v, a.id);
      }
    }
  }

  return slots;
}

function pushVisitSlot(
  slots: TimedSlot[],
  workerId: string,
  visit: VisitLike,
  assignmentId: string,
) {
  if (visit.status === "canceled" || visit.allDay) return;
  if (!visit.startTime || !visit.endTime) return;
  slots.push({
    workerId,
    jobId: visit.jobId,
    visitId: visit.id,
    workDate: toDateString(visit.workDate),
    startTime: visit.startTime,
    endTime: visit.endTime,
    assignmentId,
  });
}

export async function conflictsForProposed(
  businessId: string,
  proposed: TimedSlot[],
  opts?: { excludeAssignmentIds?: string[] },
): Promise<ConflictHit[]> {
  const existing = await loadTimedSlotsForBusiness(businessId, opts);
  return findTimedConflicts([...existing, ...proposed]);
}

export function formatConflictMessage(hits: ConflictHit[]): string {
  if (!hits.length) return "";
  const parts = hits.slice(0, 5).map((h) => {
    return `Worker overlap on ${h.workDate}: ${h.a.startTime}–${h.a.endTime} vs ${h.b.startTime}–${h.b.endTime} (jobs ${h.a.jobId.slice(0, 6)}… / ${h.b.jobId.slice(0, 6)}…)`;
  });
  return parts.join("; ");
}
