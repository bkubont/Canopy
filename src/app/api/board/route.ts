import { NextResponse } from "next/server";
import { BOARD_COLUMNS, parallelStageKeys } from "@/lib/board";
import { requireOwnerSession } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { deriveSchedulingState, toDateString } from "@/lib/scheduling";
import { progressLabel } from "@/lib/stages";
import { ensureJobStages } from "@/lib/job-stages";

export const dynamic = "force-dynamic";

/** GET — kanban board: Ready → Estimate → Prep → Tree Work → Cleanup → Complete */
export async function GET() {
  const auth = await requireOwnerSession();
  if ("error" in auth) return auth.error;

  const jobIds = (
    await prisma.job.findMany({
      where: {
        businessId: auth.session.businessId,
        archivedAt: null,
        canceledAt: null,
      },
      select: { id: true },
    })
  ).map((j) => j.id);

  for (const id of jobIds) {
    await ensureJobStages(auth.session.businessId, id);
  }

  const jobs = await prisma.job.findMany({
    where: {
      businessId: auth.session.businessId,
      archivedAt: null,
      canceledAt: null,
    },
    include: {
      client: { select: { id: true, name: true } },
      stages: { orderBy: { sortOrder: "asc" } },
      visits: {
        where: { status: { not: "canceled" } },
        select: { status: true, workDate: true, plannedStageKey: true },
        orderBy: { workDate: "asc" },
      },
      tasks: {
        where: { kind: "dump", done: false },
        select: { id: true, title: true, dumpStatus: true },
      },
    },
    orderBy: { updatedAt: "desc" },
  });

  const columns = BOARD_COLUMNS.map((col) => ({
    key: col.key,
    label: col.label,
    cards: jobs
      .filter((j) => j.boardColumn === col.key)
      .map((j) => {
        const parallel = parallelStageKeys(j.boardColumn, j.stages);
        return {
          id: j.id,
          title: j.title,
          version: j.version,
          boardColumn: j.boardColumn,
          clientName: j.client.name,
          clientId: j.client.id,
          schedulingState: deriveSchedulingState({
            canceledAt: j.canceledAt,
            readyForScheduling: j.readyForScheduling,
            visits: j.visits,
          }),
          stages: j.stages.map((s) => ({
            key: s.key,
            label: s.label,
            progress: s.progress,
            progressLabel: progressLabel(s.progress),
          })),
          parallelStages: parallel.map((key) => {
            const s = j.stages.find((x) => x.key === key)!;
            return {
              key: s.key,
              label: s.label,
              progress: s.progress,
              progressLabel: progressLabel(s.progress),
            };
          }),
          openDumpRuns: j.tasks.length,
          nextVisitDate: j.visits[0]
            ? toDateString(j.visits[0].workDate)
            : null,
          href: `/app/jobs/${j.id}`,
        };
      }),
  }));

  return NextResponse.json({ columns });
}
