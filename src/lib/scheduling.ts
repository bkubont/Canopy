/** YYYY-MM-DD helpers and scheduling-state / conflict pure logic (no DB). */

export type SchedulingState =
  | "unscheduled"
  | "ready"
  | "scheduled"
  | "canceled";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

export function isDateString(value: string): boolean {
  if (!DATE_RE.test(value)) return false;
  const [y, m, d] = value.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return (
    dt.getUTCFullYear() === y &&
    dt.getUTCMonth() === m - 1 &&
    dt.getUTCDate() === d
  );
}

export function isTimeString(value: string): boolean {
  return TIME_RE.test(value);
}

/** Inclusive list of YYYY-MM-DD between start and end (UTC calendar dates). */
export function enumerateDateRange(start: string, end: string): string[] {
  if (!isDateString(start) || !isDateString(end) || end < start) return [];
  const out: string[] = [];
  let cur = start;
  while (cur <= end) {
    out.push(cur);
    cur = addDays(cur, 1);
  }
  return out;
}

export function addDays(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return formatUtcDate(dt);
}

export function formatUtcDate(dt: Date): string {
  const y = dt.getUTCFullYear();
  const m = String(dt.getUTCMonth() + 1).padStart(2, "0");
  const d = String(dt.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Parse a DATE / DateTime from Prisma into YYYY-MM-DD. */
export function toDateString(value: Date | string): string {
  if (typeof value === "string") {
    return value.slice(0, 10);
  }
  return formatUtcDate(value);
}

/**
 * Multi-day scheduling never silently skips weekends.
 * Caller must pass the explicit selected days (subset of the range).
 */
export function resolveSelectedDays(
  start: string,
  end: string,
  selectedDays: string[],
): { ok: true; days: string[] } | { ok: false; error: string } {
  const range = enumerateDateRange(start, end);
  if (range.length === 0) {
    return { ok: false, error: "Invalid date range" };
  }
  if (!selectedDays.length) {
    return {
      ok: false,
      error: "Select which days to schedule (weekends are not auto-skipped)",
    };
  }
  const set = new Set(range);
  const unique = [...new Set(selectedDays)].sort();
  for (const day of unique) {
    if (!set.has(day)) {
      return {
        ok: false,
        error: `Day ${day} is outside the chosen range`,
      };
    }
  }
  return { ok: true, days: unique };
}

export function deriveSchedulingState(input: {
  canceledAt: Date | string | null;
  readyForScheduling: boolean;
  visits: { status: string }[];
}): SchedulingState {
  if (input.canceledAt) return "canceled";
  const active = input.visits.some((v) => v.status !== "canceled");
  if (active) return "scheduled";
  if (input.readyForScheduling) return "ready";
  return "unscheduled";
}

export function timeToMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

export type TimedSlot = {
  workerId: string;
  jobId: string;
  visitId: string;
  workDate: string;
  startTime: string;
  endTime: string;
  assignmentId?: string;
};

export type ConflictHit = {
  workerId: string;
  workDate: string;
  a: TimedSlot;
  b: TimedSlot;
};

/** Overlapping timed (non-all-day) assignments for the same worker across jobs. */
export function findTimedConflicts(slots: TimedSlot[]): ConflictHit[] {
  const byWorkerDate = new Map<string, TimedSlot[]>();
  for (const slot of slots) {
    if (
      !isTimeString(slot.startTime) ||
      !isTimeString(slot.endTime) ||
      slot.endTime <= slot.startTime
    ) {
      continue;
    }
    const key = `${slot.workerId}|${slot.workDate}`;
    const list = byWorkerDate.get(key) || [];
    list.push(slot);
    byWorkerDate.set(key, list);
  }

  const hits: ConflictHit[] = [];
  for (const list of byWorkerDate.values()) {
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const a = list[i];
        const b = list[j];
        if (a.jobId === b.jobId) continue;
        if (rangesOverlap(a.startTime, a.endTime, b.startTime, b.endTime)) {
          hits.push({ workerId: a.workerId, workDate: a.workDate, a, b });
        }
      }
    }
  }
  return hits;
}

function rangesOverlap(
  aStart: string,
  aEnd: string,
  bStart: string,
  bEnd: string,
): boolean {
  return (
    timeToMinutes(aStart) < timeToMinutes(bEnd) &&
    timeToMinutes(bStart) < timeToMinutes(aEnd)
  );
}

/** Calendar grid helpers (Sunday-first, matching legacy pilot). */
export function startOfMonth(dateStr: string): string {
  return `${dateStr.slice(0, 7)}-01`;
}

export function monthGridOrigin(monthStart: string): string {
  const [y, m] = monthStart.split("-").map(Number);
  const first = new Date(Date.UTC(y, m - 1, 1));
  const dow = first.getUTCDay(); // 0=Sun
  return addDays(monthStart, -dow);
}

export function weekOrigin(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return addDays(dateStr, -dt.getUTCDay());
}
