import { NextResponse } from "next/server";
import { z } from "zod";
import { requireOwnerSession } from "@/lib/api-auth";
import { ensureJobStages } from "@/lib/job-stages";
import { prisma } from "@/lib/prisma";
import { deriveSchedulingState, toDateString } from "@/lib/scheduling";
import { progressLabel } from "@/lib/stages";
import { deleteAttachmentFile } from "@/lib/storage";

export const dynamic = "force-dynamic";

const updateSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  siteAddress: z.string().trim().max(2000).optional().nullable(),
  description: z.string().trim().max(10000).optional().nullable(),
  clientId: z.string().min(1).optional(),
  archive: z.boolean().optional(),
  readyForScheduling: z.boolean().optional(),
  cancel: z.boolean().optional(),
});

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_request: Request, ctx: Ctx) {
  const auth = await requireOwnerSession();
  if ("error" in auth) return auth.error;
  const { id } = await ctx.params;

  await ensureJobStages(auth.session.businessId, id);

  const job = await prisma.job.findFirst({
    where: { id, businessId: auth.session.businessId },
    include: {
      client: {
        select: {
          id: true,
          name: true,
          phone: true,
          email: true,
          address: true,
        },
      },
      stages: { orderBy: { sortOrder: "asc" } },
      visits: {
        orderBy: { workDate: "asc" },
        include: {
          assignments: {
            include: { worker: { select: { id: true, name: true } } },
          },
        },
      },
      assignments: {
        include: {
          worker: { select: { id: true, name: true } },
          stage: { select: { id: true, key: true, label: true } },
          task: { select: { id: true, title: true } },
          visit: { select: { id: true, workDate: true } },
        },
      },
      tasks: {
        orderBy: { createdAt: "asc" },
        select: { id: true, title: true, kind: true, done: true },
      },
      notes: {
        orderBy: { createdAt: "desc" },
        include: {
          author: { select: { id: true, name: true, email: true } },
          attachments: {
            select: {
              id: true,
              originalFilename: true,
              mimeType: true,
              sizeBytes: true,
              thumbStorageKey: true,
              createdAt: true,
            },
          },
        },
      },
    },
  });

  if (!job) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const schedulingState = deriveSchedulingState({
    canceledAt: job.canceledAt,
    readyForScheduling: job.readyForScheduling,
    visits: job.visits,
  });

  return NextResponse.json({
    job: {
      id: job.id,
      title: job.title,
      siteAddress: job.siteAddress,
      description: job.description,
      version: job.version,
      archivedAt: job.archivedAt,
      readyForScheduling: job.readyForScheduling,
      canceledAt: job.canceledAt,
      schedulingState,
      client: job.client,
      stages: job.stages.map((s) => ({
        id: s.id,
        key: s.key,
        label: s.label,
        progress: s.progress,
        progressLabel: progressLabel(s.progress),
      })),
      /** @deprecated use stages — kept for Phase 1 UI compatibility */
      stagesPlaceholder: job.stages.map((s) => ({
        key: s.key,
        label: s.label,
        progress: progressLabel(s.progress),
      })),
      visits: job.visits.map((v) => ({
        id: v.id,
        workDate: toDateString(v.workDate),
        allDay: v.allDay,
        startTime: v.startTime,
        endTime: v.endTime,
        status: v.status,
        notes: v.notes,
        canceledAt: v.canceledAt,
        assignments: v.assignments.map((a) => ({
          id: a.id,
          workerId: a.workerId,
          workerName: a.worker.name,
        })),
      })),
      assignments: job.assignments.map((a) => ({
        id: a.id,
        workerId: a.workerId,
        workerName: a.worker.name,
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
        stage: a.stage,
        task: a.task,
        visit: a.visit
          ? { id: a.visit.id, workDate: toDateString(a.visit.workDate) }
          : null,
        conflictOverrideReason: a.conflictOverrideReason,
      })),
      tasks: job.tasks,
      notes: job.notes.map((n) => ({
        id: n.id,
        text: n.text,
        createdAt: n.createdAt,
        author: n.author,
        attachments: n.attachments.map((a) => ({
          id: a.id,
          originalFilename: a.originalFilename,
          mimeType: a.mimeType,
          sizeBytes: a.sizeBytes,
          hasThumb: Boolean(a.thumbStorageKey),
          createdAt: a.createdAt,
          downloadUrl: `/api/attachments/${a.id}`,
          thumbUrl: a.thumbStorageKey
            ? `/api/attachments/${a.id}?variant=thumb`
            : `/api/attachments/${a.id}`,
        })),
      })),
    },
  });
}

export async function PATCH(request: Request, ctx: Ctx) {
  const auth = await requireOwnerSession();
  if ("error" in auth) return auth.error;
  const { id } = await ctx.params;

  const existing = await prisma.job.findFirst({
    where: { id, businessId: auth.session.businessId },
  });
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const body = await request.json().catch(() => null);
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid update" }, { status: 400 });
  }

  if (parsed.data.clientId) {
    const client = await prisma.client.findFirst({
      where: {
        id: parsed.data.clientId,
        businessId: auth.session.businessId,
      },
    });
    if (!client) {
      return NextResponse.json({ error: "Client not found" }, { status: 404 });
    }
  }

  const data: Record<string, unknown> = {};
  if (parsed.data.title !== undefined) data.title = parsed.data.title;
  if (parsed.data.siteAddress !== undefined) {
    data.siteAddress = parsed.data.siteAddress || null;
  }
  if (parsed.data.description !== undefined) {
    data.description = parsed.data.description || null;
  }
  if (parsed.data.clientId !== undefined) data.clientId = parsed.data.clientId;
  if (parsed.data.archive === true) data.archivedAt = new Date();
  if (parsed.data.archive === false) data.archivedAt = null;
  if (parsed.data.readyForScheduling !== undefined) {
    data.readyForScheduling = parsed.data.readyForScheduling;
  }
  if (parsed.data.cancel === true) data.canceledAt = new Date();
  if (parsed.data.cancel === false) data.canceledAt = null;

  const job = await prisma.job.update({
    where: { id },
    data,
    include: {
      client: { select: { id: true, name: true } },
      visits: { select: { status: true } },
    },
  });
  return NextResponse.json({
    job: {
      ...job,
      schedulingState: deriveSchedulingState({
        canceledAt: job.canceledAt,
        readyForScheduling: job.readyForScheduling,
        visits: job.visits,
      }),
    },
  });
}

export async function DELETE(request: Request, ctx: Ctx) {
  const auth = await requireOwnerSession();
  if ("error" in auth) return auth.error;
  const { id } = await ctx.params;

  const existing = await prisma.job.findFirst({
    where: { id, businessId: auth.session.businessId },
  });
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const body = await request.json().catch(() => ({}));
  const confirmTitle =
    typeof body?.confirmTitle === "string" ? body.confirmTitle.trim() : "";
  if (confirmTitle !== existing.title) {
    return NextResponse.json(
      {
        error:
          "Permanent delete requires confirmTitle to match the job title exactly",
      },
      { status: 400 },
    );
  }

  const attachments = await prisma.attachment.findMany({
    where: { jobId: id, businessId: auth.session.businessId },
    select: { storageKey: true, thumbStorageKey: true },
  });

  await prisma.job.delete({ where: { id } });

  for (const a of attachments) {
    await deleteAttachmentFile(a.storageKey);
    await deleteAttachmentFile(a.thumbStorageKey);
  }

  return NextResponse.json({ ok: true });
}
