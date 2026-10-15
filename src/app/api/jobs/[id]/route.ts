import { NextResponse } from "next/server";
import { z } from "zod";
import { requireOwnerSession } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { deleteAttachmentFile } from "@/lib/storage";

export const dynamic = "force-dynamic";

const updateSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  siteAddress: z.string().trim().max(2000).optional().nullable(),
  description: z.string().trim().max(10000).optional().nullable(),
  clientId: z.string().min(1).optional(),
  archive: z.boolean().optional(),
});

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_request: Request, ctx: Ctx) {
  const auth = await requireOwnerSession();
  if ("error" in auth) return auth.error;
  const { id } = await ctx.params;

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

  return NextResponse.json({
    job: {
      ...job,
      stagesPlaceholder: [
        { key: "estimate", label: "Estimate", progress: "Not started" },
        { key: "prep", label: "Prep", progress: "Not started" },
        { key: "tree_work", label: "Tree Work", progress: "Not started" },
        { key: "cleanup", label: "Cleanup", progress: "Not started" },
      ],
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

  const job = await prisma.job.update({
    where: { id },
    data,
    include: { client: { select: { id: true, name: true } } },
  });
  return NextResponse.json({ job });
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
