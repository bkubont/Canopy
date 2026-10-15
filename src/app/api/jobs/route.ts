import { NextResponse } from "next/server";
import { z } from "zod";
import { requireOwnerSession } from "@/lib/api-auth";
import { ensureJobStages } from "@/lib/job-stages";
import { prisma } from "@/lib/prisma";
import { deriveSchedulingState } from "@/lib/scheduling";
import { STAGE_DEFS } from "@/lib/stages";

export const dynamic = "force-dynamic";

const createSchema = z.object({
  clientId: z.string().min(1),
  title: z.string().trim().min(1).max(200),
  siteAddress: z.string().trim().max(2000).optional().nullable(),
  description: z.string().trim().max(10000).optional().nullable(),
});

export async function GET(request: Request) {
  const auth = await requireOwnerSession();
  if ("error" in auth) return auth.error;

  const url = new URL(request.url);
  const q = (url.searchParams.get("q") || "").trim().toLowerCase();
  const clientId = url.searchParams.get("clientId");
  const archived = url.searchParams.get("archived");

  const jobs = await prisma.job.findMany({
    where: {
      businessId: auth.session.businessId,
      ...(clientId ? { clientId } : {}),
      ...(archived === "1"
        ? { archivedAt: { not: null } }
        : archived === "all"
          ? {}
          : { archivedAt: null }),
      ...(q
        ? {
            OR: [
              { title: { contains: q } },
              { siteAddress: { contains: q } },
              { client: { name: { contains: q } } },
            ],
          }
        : {}),
    },
    orderBy: { updatedAt: "desc" },
    include: {
      client: { select: { id: true, name: true } },
      visits: { select: { status: true } },
      _count: { select: { notes: true, visits: true } },
    },
  });

  return NextResponse.json({
    jobs: jobs.map((j) => ({
      id: j.id,
      title: j.title,
      siteAddress: j.siteAddress,
      description: j.description,
      version: j.version,
      archivedAt: j.archivedAt,
      readyForScheduling: j.readyForScheduling,
      canceledAt: j.canceledAt,
      schedulingState: deriveSchedulingState({
        canceledAt: j.canceledAt,
        readyForScheduling: j.readyForScheduling,
        visits: j.visits,
      }),
      client: j.client,
      noteCount: j._count.notes,
      visitCount: j._count.visits,
      createdAt: j.createdAt,
      updatedAt: j.updatedAt,
    })),
  });
}

export async function POST(request: Request) {
  const auth = await requireOwnerSession();
  if ("error" in auth) return auth.error;

  const body = await request.json().catch(() => null);
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Client and title are required" },
      { status: 400 },
    );
  }

  const client = await prisma.client.findFirst({
    where: {
      id: parsed.data.clientId,
      businessId: auth.session.businessId,
    },
  });
  if (!client) {
    return NextResponse.json({ error: "Client not found" }, { status: 404 });
  }

  const job = await prisma.job.create({
    data: {
      businessId: auth.session.businessId,
      clientId: client.id,
      title: parsed.data.title,
      siteAddress: parsed.data.siteAddress || null,
      description: parsed.data.description || null,
      stages: {
        create: STAGE_DEFS.map((s) => ({
          businessId: auth.session.businessId,
          key: s.key,
          label: s.label,
          progress: "not_started",
          sortOrder: s.sortOrder,
        })),
      },
    },
    include: { client: { select: { id: true, name: true } } },
  });

  await ensureJobStages(auth.session.businessId, job.id);

  return NextResponse.json(
    {
      job: {
        ...job,
        schedulingState: "unscheduled" as const,
        visitCount: 0,
      },
    },
    { status: 201 },
  );
}
