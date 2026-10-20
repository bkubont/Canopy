import type { Prisma } from "@prisma/client";
import {
  boardColumnLabel,
  dumpEventType,
  isBoardColumn,
  isFutureWorkDate,
  isWorkStageKey,
  nextDumpStatus,
  type BoardColumnKey,
  type DumpStatus,
} from "@/lib/board";
import { prisma } from "@/lib/prisma";
import { toDateString } from "@/lib/scheduling";
import { todayInTimezone, workDateToUtc } from "@/lib/timezone";

export type KanbanMoveInput = {
  businessId: string;
  userId: string;
  jobId: string;
  destination: string;
  workDate: string;
  visitId?: string | null;
  requestId: string;
  expectedVersion: number;
};

export type CommandResult<T> =
  | { ok: true; status: number; body: T; replayed?: boolean }
  | {
      ok: false;
      status: number;
      body: { error: string; code?: string; currentVersion?: number };
    };

type Tx = Prisma.TransactionClient;

async function loadIdempotent(
  businessId: string,
  requestId: string,
): Promise<CommandResult<unknown> | null> {
  const existing = await prisma.idempotencyRecord.findUnique({
    where: {
      businessId_requestId: { businessId, requestId },
    },
  });
  if (!existing) return null;
  return {
    ok: true,
    status: 200,
    body: existing.responseJson as unknown,
    replayed: true,
  };
}

async function saveIdempotent(
  tx: Tx,
  businessId: string,
  requestId: string,
  endpoint: string,
  body: unknown,
): Promise<void> {
  await tx.idempotencyRecord.create({
    data: {
      businessId,
      requestId,
      endpoint,
      responseJson: body as Prisma.InputJsonValue,
    },
  });
}

async function resolveVisit(
  tx: Tx,
  input: {
    businessId: string;
    jobId: string;
    workDate: string;
    visitId?: string | null;
  },
): Promise<{
  visit: { id: string; workDate: Date; status: string; plannedStageKey: string | null };
  createdUnplanned: boolean;
}> {
  if (input.visitId) {
    const visit = await tx.visit.findFirst({
      where: {
        id: input.visitId,
        jobId: input.jobId,
        businessId: input.businessId,
        status: { not: "canceled" },
      },
    });
    if (!visit) {
      throw Object.assign(new Error("Visit not found"), { code: "VISIT_NOT_FOUND" });
    }
    if (toDateString(visit.workDate) !== input.workDate) {
      throw Object.assign(new Error("Visit work date mismatch"), {
        code: "VISIT_DATE_MISMATCH",
      });
    }
    return { visit, createdUnplanned: false };
  }

  const existing = await tx.visit.findFirst({
    where: {
      jobId: input.jobId,
      businessId: input.businessId,
      workDate: workDateToUtc(input.workDate),
      status: { not: "canceled" },
    },
  });
  if (existing) return { visit: existing, createdUnplanned: false };

  const visit = await tx.visit.create({
    data: {
      businessId: input.businessId,
      jobId: input.jobId,
      workDate: workDateToUtc(input.workDate),
      allDay: true,
      status: "unplanned",
      notes: "Unplanned work visit",
    },
  });
  return { visit, createdUnplanned: true };
}

/**
 * Move a job on the kanban. Past/today updates board + events; future only
 * sets planned stage on the visit. Never silently completes a JobStage.
 */
export async function executeKanbanMove(
  input: KanbanMoveInput,
): Promise<CommandResult<Record<string, unknown>>> {
  if (!isBoardColumn(input.destination)) {
    return {
      ok: false,
      status: 400,
      body: { error: "Invalid destination", code: "INVALID_DESTINATION" },
    };
  }
  if (!input.requestId || input.requestId.length > 128) {
    return {
      ok: false,
      status: 400,
      body: { error: "requestId required", code: "REQUEST_ID" },
    };
  }

  const replay = await loadIdempotent(input.businessId, input.requestId);
  if (replay) return replay as CommandResult<Record<string, unknown>>;

  const business = await prisma.business.findUnique({
    where: { id: input.businessId },
    select: { timezone: true },
  });
  const today = todayInTimezone(business?.timezone || "America/Detroit");
  const future = isFutureWorkDate(input.workDate, today);

  try {
    const result = await prisma.$transaction(async (tx) => {
      const job = await tx.job.findFirst({
        where: { id: input.jobId, businessId: input.businessId },
        include: { stages: true },
      });
      if (!job) {
        throw Object.assign(new Error("Job not found"), { code: "NOT_FOUND" });
      }
      if (job.version !== input.expectedVersion) {
        throw Object.assign(new Error("Stale job version"), {
          code: "VERSION_CONFLICT",
          currentVersion: job.version,
        });
      }

      const { visit, createdUnplanned } = await resolveVisit(tx, {
        businessId: input.businessId,
        jobId: input.jobId,
        workDate: input.workDate,
        visitId: input.visitId,
      });

      const fromColumn = job.boardColumn;
      const destination = input.destination as BoardColumnKey;

      // No-op: same board (or same planned) — no event, still idempotent
      if (future) {
        if (visit.plannedStageKey === destination) {
          const body = {
            noop: true,
            jobId: job.id,
            version: job.version,
            boardColumn: job.boardColumn,
            visitId: visit.id,
            plannedStageKey: visit.plannedStageKey,
            createdUnplanned,
          };
          await saveIdempotent(
            tx,
            input.businessId,
            input.requestId,
            "kanban_move",
            body,
          );
          return body;
        }

        const updatedVisit = await tx.visit.update({
          where: { id: visit.id },
          data: { plannedStageKey: destination },
        });

        const event = await tx.activityEvent.create({
          data: {
            businessId: input.businessId,
            jobId: job.id,
            visitId: visit.id,
            userId: input.userId,
            type: "planned_stage",
            stageKey: destination,
            workDate: workDateToUtc(input.workDate),
            status: "valid",
            message: `Planned ${boardColumnLabel(destination)} for ${input.workDate}`,
            payload: {
              from: visit.plannedStageKey,
              to: destination,
              future: true,
            },
          },
        });

        await tx.auditChange.create({
          data: {
            businessId: input.businessId,
            jobId: job.id,
            userId: input.userId,
            entityType: "visit",
            entityId: visit.id,
            field: "plannedStageKey",
            oldValue: visit.plannedStageKey,
            newValue: destination,
            activityEventId: event.id,
          },
        });

        // Version still bumps so clients stay in sync
        const updatedJob = await tx.job.update({
          where: { id: job.id },
          data: { version: { increment: 1 } },
        });

        const body = {
          noop: false,
          future: true,
          jobId: job.id,
          version: updatedJob.version,
          boardColumn: updatedJob.boardColumn,
          visitId: updatedVisit.id,
          plannedStageKey: updatedVisit.plannedStageKey,
          createdUnplanned,
          eventId: event.id,
        };
        await saveIdempotent(
          tx,
          input.businessId,
          input.requestId,
          "kanban_move",
          body,
        );
        return body;
      }

      // Past / today — update primary board
      if (fromColumn === destination) {
        const body = {
          noop: true,
          jobId: job.id,
          version: job.version,
          boardColumn: job.boardColumn,
          visitId: visit.id,
          plannedStageKey: visit.plannedStageKey,
          createdUnplanned,
        };
        await saveIdempotent(
          tx,
          input.businessId,
          input.requestId,
          "kanban_move",
          body,
        );
        return body;
      }

      // Moving onto a work stage: mark in_progress if not completed/not_needed
      // Never auto-complete the stage we leave.
      if (isWorkStageKey(destination)) {
        const stage = job.stages.find((s) => s.key === destination);
        if (stage && stage.progress === "not_started") {
          await tx.jobStage.update({
            where: { id: stage.id },
            data: { progress: "in_progress" },
          });
        }
      }

      const updatedJob = await tx.job.update({
        where: { id: job.id },
        data: {
          boardColumn: destination,
          version: { increment: 1 },
          readyForScheduling:
            destination === "ready" ? true : job.readyForScheduling,
        },
      });

      // Clear planned key on this visit when applying a real move for the day
      if (visit.plannedStageKey) {
        await tx.visit.update({
          where: { id: visit.id },
          data: { plannedStageKey: null },
        });
      }

      const event = await tx.activityEvent.create({
        data: {
          businessId: input.businessId,
          jobId: job.id,
          visitId: visit.id,
          userId: input.userId,
          type: "stage_move",
          stageKey: isWorkStageKey(destination) ? destination : destination,
          workDate: workDateToUtc(input.workDate),
          status: "valid",
          message: `Moved from ${boardColumnLabel(fromColumn)} to ${boardColumnLabel(destination)}`,
          payload: { from: fromColumn, to: destination },
        },
      });

      await tx.auditChange.create({
        data: {
          businessId: input.businessId,
          jobId: job.id,
          userId: input.userId,
          entityType: "job",
          entityId: job.id,
          field: "boardColumn",
          oldValue: fromColumn,
          newValue: destination,
          activityEventId: event.id,
        },
      });

      const body = {
        noop: false,
        future: false,
        jobId: job.id,
        version: updatedJob.version,
        boardColumn: updatedJob.boardColumn,
        visitId: visit.id,
        plannedStageKey: null as string | null,
        createdUnplanned,
        eventId: event.id,
      };
      await saveIdempotent(
        tx,
        input.businessId,
        input.requestId,
        "kanban_move",
        body,
      );
      return body;
    });

    return { ok: true, status: 200, body: result };
  } catch (err) {
    return mapTxError(err);
  }
}

export type StageActionInput = {
  businessId: string;
  userId: string;
  jobId: string;
  stageKey: string;
  /** complete | reopen | not_needed | start | resume */
  action: "complete" | "reopen" | "not_needed" | "start" | "resume";
  workDate: string;
  visitId?: string | null;
  requestId: string;
  expectedVersion: number;
};

/**
 * Explicit stage progress actions. Start/resume do not change board column.
 * Complete/reopen/not_needed never happen silently from a column leave.
 */
export async function executeStageAction(
  input: StageActionInput,
): Promise<CommandResult<Record<string, unknown>>> {
  if (!isWorkStageKey(input.stageKey)) {
    return {
      ok: false,
      status: 400,
      body: { error: "Invalid stage", code: "INVALID_STAGE" },
    };
  }
  if (!input.requestId || input.requestId.length > 128) {
    return {
      ok: false,
      status: 400,
      body: { error: "requestId required", code: "REQUEST_ID" },
    };
  }

  const replay = await loadIdempotent(input.businessId, input.requestId);
  if (replay) return replay as CommandResult<Record<string, unknown>>;

  try {
    const result = await prisma.$transaction(async (tx) => {
      const job = await tx.job.findFirst({
        where: { id: input.jobId, businessId: input.businessId },
        include: { stages: true },
      });
      if (!job) {
        throw Object.assign(new Error("Job not found"), { code: "NOT_FOUND" });
      }
      if (job.version !== input.expectedVersion) {
        throw Object.assign(new Error("Stale job version"), {
          code: "VERSION_CONFLICT",
          currentVersion: job.version,
        });
      }

      const stage = job.stages.find((s) => s.key === input.stageKey);
      if (!stage) {
        throw Object.assign(new Error("Stage not found"), {
          code: "STAGE_NOT_FOUND",
        });
      }

      const { visit, createdUnplanned } = await resolveVisit(tx, {
        businessId: input.businessId,
        jobId: input.jobId,
        workDate: input.workDate,
        visitId: input.visitId,
      });

      let nextProgress = stage.progress;
      let eventType:
        | "stage_complete"
        | "stage_reopen"
        | "stage_not_needed"
        | "stage_start"
        | "stage_resume" = "stage_start";

      if (input.action === "complete") {
        if (stage.progress === "completed") {
          const body = {
            noop: true,
            jobId: job.id,
            version: job.version,
            boardColumn: job.boardColumn,
            stageKey: stage.key,
            progress: stage.progress,
            visitId: visit.id,
            createdUnplanned,
          };
          await saveIdempotent(
            tx,
            input.businessId,
            input.requestId,
            "stage_action",
            body,
          );
          return body;
        }
        nextProgress = "completed";
        eventType = "stage_complete";
      } else if (input.action === "reopen") {
        if (stage.progress !== "completed" && stage.progress !== "not_needed") {
          const body = {
            noop: true,
            jobId: job.id,
            version: job.version,
            boardColumn: job.boardColumn,
            stageKey: stage.key,
            progress: stage.progress,
            visitId: visit.id,
            createdUnplanned,
          };
          await saveIdempotent(
            tx,
            input.businessId,
            input.requestId,
            "stage_action",
            body,
          );
          return body;
        }
        nextProgress = "in_progress";
        eventType = "stage_reopen";
      } else if (input.action === "not_needed") {
        if (stage.progress === "not_needed") {
          const body = {
            noop: true,
            jobId: job.id,
            version: job.version,
            boardColumn: job.boardColumn,
            stageKey: stage.key,
            progress: stage.progress,
            visitId: visit.id,
            createdUnplanned,
          };
          await saveIdempotent(
            tx,
            input.businessId,
            input.requestId,
            "stage_action",
            body,
          );
          return body;
        }
        nextProgress = "not_needed";
        eventType = "stage_not_needed";
      } else if (input.action === "start" || input.action === "resume") {
        if (stage.progress === "in_progress") {
          // Resume on an already in-progress stage still logs a resume badge event
          // only when action is resume; start on in_progress is a no-op.
          if (input.action === "start") {
            const body = {
              noop: true,
              jobId: job.id,
              version: job.version,
              boardColumn: job.boardColumn,
              stageKey: stage.key,
              progress: stage.progress,
              visitId: visit.id,
              createdUnplanned,
            };
            await saveIdempotent(
              tx,
              input.businessId,
              input.requestId,
              "stage_action",
              body,
            );
            return body;
          }
          nextProgress = "in_progress";
          eventType = "stage_resume";
        } else if (stage.progress === "completed") {
          throw Object.assign(new Error("Reopen the stage before starting"), {
            code: "STAGE_COMPLETED",
          });
        } else if (stage.progress === "not_needed") {
          throw Object.assign(new Error("Stage marked not needed"), {
            code: "STAGE_NOT_NEEDED",
          });
        } else {
          nextProgress = "in_progress";
          eventType = input.action === "resume" ? "stage_resume" : "stage_start";
        }
      }

      await tx.jobStage.update({
        where: { id: stage.id },
        data: { progress: nextProgress },
      });

      const updatedJob = await tx.job.update({
        where: { id: job.id },
        data: { version: { increment: 1 } },
      });

      const event = await tx.activityEvent.create({
        data: {
          businessId: input.businessId,
          jobId: job.id,
          visitId: visit.id,
          userId: input.userId,
          type: eventType,
          stageKey: stage.key,
          workDate: workDateToUtc(input.workDate),
          status: "valid",
          message: `${boardColumnLabel(stage.key)} ${input.action}`,
          payload: {
            from: stage.progress,
            to: nextProgress,
            action: input.action,
            boardColumn: job.boardColumn,
          },
        },
      });

      await tx.auditChange.create({
        data: {
          businessId: input.businessId,
          jobId: job.id,
          userId: input.userId,
          entityType: "job_stage",
          entityId: stage.id,
          field: "progress",
          oldValue: stage.progress,
          newValue: nextProgress,
          activityEventId: event.id,
        },
      });

      const body = {
        noop: false,
        jobId: job.id,
        version: updatedJob.version,
        boardColumn: updatedJob.boardColumn,
        stageKey: stage.key,
        progress: nextProgress,
        visitId: visit.id,
        createdUnplanned,
        eventId: event.id,
        action: input.action,
      };
      await saveIdempotent(
        tx,
        input.businessId,
        input.requestId,
        "stage_action",
        body,
      );
      return body;
    });

    return { ok: true, status: 200, body: result };
  } catch (err) {
    return mapTxError(err);
  }
}

export type DumpAdvanceInput = {
  businessId: string;
  userId: string;
  jobId: string;
  taskId: string;
  workDate: string;
  visitId?: string | null;
  requestId: string;
  expectedVersion: number;
};

/** Advance dump run: Depart → Return → Done. Does not move primary kanban. */
export async function executeDumpAdvance(
  input: DumpAdvanceInput,
): Promise<CommandResult<Record<string, unknown>>> {
  if (!input.requestId || input.requestId.length > 128) {
    return {
      ok: false,
      status: 400,
      body: { error: "requestId required", code: "REQUEST_ID" },
    };
  }

  const replay = await loadIdempotent(input.businessId, input.requestId);
  if (replay) return replay as CommandResult<Record<string, unknown>>;

  try {
    const result = await prisma.$transaction(async (tx) => {
      const job = await tx.job.findFirst({
        where: { id: input.jobId, businessId: input.businessId },
      });
      if (!job) {
        throw Object.assign(new Error("Job not found"), { code: "NOT_FOUND" });
      }
      if (job.version !== input.expectedVersion) {
        throw Object.assign(new Error("Stale job version"), {
          code: "VERSION_CONFLICT",
          currentVersion: job.version,
        });
      }

      const task = await tx.task.findFirst({
        where: {
          id: input.taskId,
          jobId: input.jobId,
          businessId: input.businessId,
          kind: "dump",
        },
      });
      if (!task) {
        throw Object.assign(new Error("Dump task not found"), {
          code: "TASK_NOT_FOUND",
        });
      }

      const next = nextDumpStatus(task.dumpStatus);
      if (!next) {
        const body = {
          noop: true,
          jobId: job.id,
          version: job.version,
          boardColumn: job.boardColumn,
          taskId: task.id,
          dumpStatus: task.dumpStatus,
          done: task.done,
        };
        await saveIdempotent(
          tx,
          input.businessId,
          input.requestId,
          "dump_advance",
          body,
        );
        return body;
      }

      const { visit, createdUnplanned } = await resolveVisit(tx, {
        businessId: input.businessId,
        jobId: input.jobId,
        workDate: input.workDate,
        visitId: input.visitId,
      });

      const status = next as DumpStatus;
      const updatedTask = await tx.task.update({
        where: { id: task.id },
        data: {
          dumpStatus: status,
          done: status === "done",
          workDate: workDateToUtc(input.workDate),
        },
      });

      const updatedJob = await tx.job.update({
        where: { id: job.id },
        data: { version: { increment: 1 } },
      });

      const event = await tx.activityEvent.create({
        data: {
          businessId: input.businessId,
          jobId: job.id,
          visitId: visit.id,
          userId: input.userId,
          type: dumpEventType(status),
          stageKey: "dump",
          workDate: workDateToUtc(input.workDate),
          status: "valid",
          message: `Dump run ${status}: ${task.title}`,
          payload: {
            taskId: task.id,
            from: task.dumpStatus,
            to: status,
          },
        },
      });

      await tx.auditChange.create({
        data: {
          businessId: input.businessId,
          jobId: job.id,
          userId: input.userId,
          entityType: "task",
          entityId: task.id,
          field: "dumpStatus",
          oldValue: task.dumpStatus,
          newValue: status,
          activityEventId: event.id,
        },
      });

      const body = {
        noop: false,
        jobId: job.id,
        version: updatedJob.version,
        boardColumn: updatedJob.boardColumn,
        taskId: updatedTask.id,
        dumpStatus: updatedTask.dumpStatus,
        done: updatedTask.done,
        visitId: visit.id,
        createdUnplanned,
        eventId: event.id,
      };
      await saveIdempotent(
        tx,
        input.businessId,
        input.requestId,
        "dump_advance",
        body,
      );
      return body;
    });

    return { ok: true, status: 200, body: result };
  } catch (err) {
    return mapTxError(err);
  }
}

export type ReverseEventInput = {
  businessId: string;
  userId: string;
  jobId: string;
  eventId: string;
  reason: string;
  requestId: string;
  expectedVersion: number;
};

/** Reverse a valid activity event (correction with audit). */
export async function executeEventReversal(
  input: ReverseEventInput,
): Promise<CommandResult<Record<string, unknown>>> {
  if (!input.requestId || input.requestId.length > 128) {
    return {
      ok: false,
      status: 400,
      body: { error: "requestId required", code: "REQUEST_ID" },
    };
  }
  if (!input.reason.trim()) {
    return {
      ok: false,
      status: 400,
      body: { error: "Reason required", code: "REASON" },
    };
  }

  const replay = await loadIdempotent(input.businessId, input.requestId);
  if (replay) return replay as CommandResult<Record<string, unknown>>;

  try {
    const result = await prisma.$transaction(async (tx) => {
      const job = await tx.job.findFirst({
        where: { id: input.jobId, businessId: input.businessId },
      });
      if (!job) {
        throw Object.assign(new Error("Job not found"), { code: "NOT_FOUND" });
      }
      if (job.version !== input.expectedVersion) {
        throw Object.assign(new Error("Stale job version"), {
          code: "VERSION_CONFLICT",
          currentVersion: job.version,
        });
      }

      const event = await tx.activityEvent.findFirst({
        where: {
          id: input.eventId,
          jobId: input.jobId,
          businessId: input.businessId,
        },
      });
      if (!event) {
        throw Object.assign(new Error("Event not found"), {
          code: "EVENT_NOT_FOUND",
        });
      }
      if (event.status === "reversed") {
        const body = {
          noop: true,
          jobId: job.id,
          version: job.version,
          eventId: event.id,
          status: event.status,
        };
        await saveIdempotent(
          tx,
          input.businessId,
          input.requestId,
          "event_reverse",
          body,
        );
        return body;
      }

      await tx.activityEvent.update({
        where: { id: event.id },
        data: { status: "reversed" },
      });

      const reversal = await tx.activityEvent.create({
        data: {
          businessId: input.businessId,
          jobId: job.id,
          visitId: event.visitId,
          userId: input.userId,
          type: "reversal",
          stageKey: event.stageKey,
          workDate: event.workDate,
          status: "valid",
          message: `Reversed: ${event.message || event.type}`,
          payload: { reason: input.reason, originalType: event.type },
          reversesEventId: event.id,
        },
      });

      await tx.auditChange.create({
        data: {
          businessId: input.businessId,
          jobId: job.id,
          userId: input.userId,
          entityType: "activity_event",
          entityId: event.id,
          field: "status",
          oldValue: "valid",
          newValue: "reversed",
          reason: input.reason,
          activityEventId: reversal.id,
        },
      });

      const updatedJob = await tx.job.update({
        where: { id: job.id },
        data: { version: { increment: 1 } },
      });

      const body = {
        noop: false,
        jobId: job.id,
        version: updatedJob.version,
        eventId: event.id,
        reversalEventId: reversal.id,
        status: "reversed",
      };
      await saveIdempotent(
        tx,
        input.businessId,
        input.requestId,
        "event_reverse",
        body,
      );
      return body;
    });

    return { ok: true, status: 200, body: result };
  } catch (err) {
    return mapTxError(err);
  }
}

function mapTxError(
  err: unknown,
): CommandResult<Record<string, unknown>> {
  const code =
    err && typeof err === "object" && "code" in err
      ? String((err as { code: string }).code)
      : null;
  const message = err instanceof Error ? err.message : "Command failed";

  if (code === "NOT_FOUND" || code === "VISIT_NOT_FOUND" || code === "STAGE_NOT_FOUND" || code === "TASK_NOT_FOUND" || code === "EVENT_NOT_FOUND") {
    return { ok: false, status: 404, body: { error: message, code: code || undefined } };
  }
  if (code === "VERSION_CONFLICT") {
    const currentVersion =
      err && typeof err === "object" && "currentVersion" in err
        ? Number((err as { currentVersion: number }).currentVersion)
        : undefined;
    return {
      ok: false,
      status: 409,
      body: {
        error: message,
        code: "VERSION_CONFLICT",
        ...(currentVersion !== undefined ? { currentVersion } : {}),
      },
    };
  }
  if (
    code === "VISIT_DATE_MISMATCH" ||
    code === "STAGE_COMPLETED" ||
    code === "STAGE_NOT_NEEDED"
  ) {
    return { ok: false, status: 400, body: { error: message, code } };
  }
  // Unique constraint on idempotency — treat as race; client can retry
  if (
    err &&
    typeof err === "object" &&
    "code" in err &&
    (err as { code: string }).code === "P2002"
  ) {
    return {
      ok: false,
      status: 409,
      body: { error: "Concurrent request", code: "IDEMPOTENCY_RACE" },
    };
  }
  return { ok: false, status: 500, body: { error: message } };
}
