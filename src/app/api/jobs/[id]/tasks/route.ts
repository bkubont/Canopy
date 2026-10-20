import { NextResponse } from "next/server";
import { z } from "zod";
import { requireOwnerSession } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { isDateString, toDateString } from "@/lib/scheduling";
import { workDateToUtc } from "@/lib/timezone";

export const dynamic = "force-dynamic";

const createSchema = z.object({
  title: z.string().trim().min(1).max(200),
  kind: z.enum(["general", "dump"]).optional().default("general"),
  stageKey: z
    .enum(["estimate", "prep", "tree_work", "cleanup"])
    .optional()
    .nullable(),
  workDate: z.string().optional().nullable(),
  destination: z.string().trim().max(255).optional().nullable(),
  details: z.string().trim().max(5000).optional().nullable(),
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

  const tasks = await prisma.task.findMany({
    where: { jobId, businessId: auth.session.businessId },
    orderBy: { createdAt: "asc" },
  });

  return NextResponse.json({
    tasks: tasks.map((t) => serializeTask(t)),
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

  const body = await request.json().catch(() => null);
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid task" }, { status: 400 });
  }

  if (parsed.data.workDate && !isDateString(parsed.data.workDate)) {
    return NextResponse.json({ error: "Invalid workDate" }, { status: 400 });
  }

  const kind = parsed.data.kind;
  const task = await prisma.task.create({
    data: {
      businessId: auth.session.businessId,
      jobId,
      title: parsed.data.title,
      kind,
      stageKey: parsed.data.stageKey || null,
      workDate: parsed.data.workDate
        ? workDateToUtc(parsed.data.workDate)
        : null,
      destination: parsed.data.destination || null,
      details: parsed.data.details || null,
      dumpStatus: kind === "dump" ? null : null,
      done: false,
    },
  });

  return NextResponse.json({ task: serializeTask(task) }, { status: 201 });
}

function serializeTask(t: {
  id: string;
  title: string;
  kind: string;
  stageKey: string | null;
  workDate: Date | null;
  destination: string | null;
  details: string | null;
  dumpStatus: string | null;
  done: boolean;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: t.id,
    title: t.title,
    kind: t.kind,
    stageKey: t.stageKey,
    workDate: t.workDate ? toDateString(t.workDate) : null,
    destination: t.destination,
    details: t.details,
    dumpStatus: t.dumpStatus,
    done: t.done,
    createdAt: t.createdAt,
    updatedAt: t.updatedAt,
  };
}
