import { STAGE_DEFS, type StageKey } from "@/lib/stages";

/** Primary kanban columns (spec Phase 3 board). */
export const BOARD_COLUMNS = [
  { key: "ready", label: "Ready" },
  { key: "estimate", label: "Estimate" },
  { key: "prep", label: "Prep" },
  { key: "tree_work", label: "Tree Work" },
  { key: "cleanup", label: "Cleanup" },
  { key: "complete", label: "Complete" },
] as const;

export type BoardColumnKey = (typeof BOARD_COLUMNS)[number]["key"];

const BOARD_KEYS = new Set<string>(BOARD_COLUMNS.map((c) => c.key));
const WORK_STAGE_KEYS = new Set<string>(STAGE_DEFS.map((s) => s.key));

export function isBoardColumn(value: string): value is BoardColumnKey {
  return BOARD_KEYS.has(value);
}

export function isWorkStageKey(value: string): value is StageKey {
  return WORK_STAGE_KEYS.has(value);
}

export function boardColumnLabel(key: string): string {
  return BOARD_COLUMNS.find((c) => c.key === key)?.label || key;
}

export type StageProgress =
  | "not_started"
  | "in_progress"
  | "completed"
  | "not_needed";

export function isStageProgress(value: string): value is StageProgress {
  return (
    value === "not_started" ||
    value === "in_progress" ||
    value === "completed" ||
    value === "not_needed"
  );
}

/**
 * Past/today work dates update the primary board; future dates only set
 * planned stage on that visit.
 */
export function isFutureWorkDate(
  workDate: string,
  today: string,
): boolean {
  return workDate > today;
}

/** Stages that are active in parallel without being the board column. */
export function parallelStageKeys(
  boardColumn: string,
  stages: { key: string; progress: string }[],
): string[] {
  return stages
    .filter(
      (s) =>
        s.key !== boardColumn &&
        (s.progress === "in_progress" || s.progress === "completed"),
    )
    .map((s) => s.key);
}

export type BadgeKind = "stage" | "dump" | "planned";

export type ProjectedBadge = {
  key: string;
  kind: BadgeKind;
  label: string;
};

const BADGE_EVENT_TYPES = new Set([
  "stage_move",
  "stage_start",
  "stage_resume",
  "stage_complete",
  "dump_depart",
  "dump_return",
  "dump_done",
]);

/**
 * Project calendar badges from valid activity events for one job+date.
 * Corrections/reversals exclude reversed events. No planned_stage in work badges
 * except as a separate planned indicator when no work events exist.
 */
export function projectBadgesForDay(
  events: {
    type: string;
    stageKey: string | null;
    status: string;
  }[],
  plannedStageKey?: string | null,
): ProjectedBadge[] {
  const valid = events.filter((e) => e.status === "valid");
  const keys = new Set<string>();
  let hasDump = false;

  for (const e of valid) {
    if (!BADGE_EVENT_TYPES.has(e.type)) continue;
    if (e.type.startsWith("dump_")) {
      hasDump = true;
      continue;
    }
    if (e.stageKey && isWorkStageKey(e.stageKey)) {
      keys.add(e.stageKey);
    } else if (
      e.stageKey &&
      isBoardColumn(e.stageKey) &&
      isWorkStageKey(e.stageKey)
    ) {
      keys.add(e.stageKey);
    }
  }

  const badges: ProjectedBadge[] = [...keys].map((key) => ({
    key,
    kind: "stage" as const,
    label: boardColumnLabel(key),
  }));

  if (hasDump) {
    badges.push({ key: "dump", kind: "dump", label: "Dump" });
  }

  if (
    badges.length === 0 &&
    plannedStageKey &&
    (isWorkStageKey(plannedStageKey) || isBoardColumn(plannedStageKey))
  ) {
    badges.push({
      key: plannedStageKey,
      kind: "planned",
      label: boardColumnLabel(plannedStageKey),
    });
  }

  return badges;
}

export type DumpStatus = "departed" | "returned" | "done";

export function nextDumpStatus(
  current: string | null | undefined,
): DumpStatus | null {
  if (!current) return "departed";
  if (current === "departed") return "returned";
  if (current === "returned") return "done";
  return null;
}

export function dumpStatusLabel(status: string | null | undefined): string {
  switch (status) {
    case "departed":
      return "Departed";
    case "returned":
      return "Returned";
    case "done":
      return "Done";
    default:
      return "Not started";
  }
}

export function dumpEventType(
  status: DumpStatus,
): "dump_depart" | "dump_return" | "dump_done" {
  if (status === "departed") return "dump_depart";
  if (status === "returned") return "dump_return";
  return "dump_done";
}
