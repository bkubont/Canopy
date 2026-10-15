import { NextResponse } from "next/server";
import { z } from "zod";
import { requireOwnerSession } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { deleteAttachmentFile } from "@/lib/storage";

export const dynamic = "force-dynamic";

const updateSchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  phone: z.string().trim().max(64).optional().nullable(),
  email: z
    .string()
    .trim()
    .email()
    .max(255)
    .optional()
    .nullable()
    .or(z.literal("")),
  address: z.string().trim().max(2000).optional().nullable(),
  notes: z.string().trim().max(10000).optional().nullable(),
  archive: z.boolean().optional(),
});

type Ctx = { params: Promise<{ id: string }> };

async function loadOwnedClient(businessId: string, id: string) {
  return prisma.client.findFirst({
    where: { id, businessId },
  });
}

export async function GET(_request: Request, ctx: Ctx) {
  const auth = await requireOwnerSession();
  if ("error" in auth) return auth.error;
  const { id } = await ctx.params;

  const client = await prisma.client.findFirst({
    where: { id, businessId: auth.session.businessId },
    include: {
      jobs: {
        orderBy: { updatedAt: "desc" },
        select: {
          id: true,
          title: true,
          siteAddress: true,
          archivedAt: true,
          updatedAt: true,
          createdAt: true,
        },
      },
    },
  });
  if (!client) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json({ client });
}

export async function PATCH(request: Request, ctx: Ctx) {
  const auth = await requireOwnerSession();
  if ("error" in auth) return auth.error;
  const { id } = await ctx.params;

  const existing = await loadOwnedClient(auth.session.businessId, id);
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const body = await request.json().catch(() => null);
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid update" }, { status: 400 });
  }

  const data: Record<string, unknown> = {};
  if (parsed.data.name !== undefined) data.name = parsed.data.name;
  if (parsed.data.phone !== undefined) data.phone = parsed.data.phone || null;
  if (parsed.data.email !== undefined) {
    data.email =
      parsed.data.email && parsed.data.email.length > 0
        ? parsed.data.email
        : null;
  }
  if (parsed.data.address !== undefined) {
    data.address = parsed.data.address || null;
  }
  if (parsed.data.notes !== undefined) data.notes = parsed.data.notes || null;
  if (parsed.data.archive === true) data.archivedAt = new Date();
  if (parsed.data.archive === false) data.archivedAt = null;

  const client = await prisma.client.update({
    where: { id },
    data,
  });
  return NextResponse.json({ client });
}

export async function DELETE(request: Request, ctx: Ctx) {
  const auth = await requireOwnerSession();
  if ("error" in auth) return auth.error;
  const { id } = await ctx.params;

  const existing = await loadOwnedClient(auth.session.businessId, id);
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const body = await request.json().catch(() => ({}));
  const confirmName =
    typeof body?.confirmName === "string" ? body.confirmName.trim() : "";
  if (confirmName !== existing.name) {
    return NextResponse.json(
      {
        error:
          "Permanent delete requires confirmName to match the client name exactly",
      },
      { status: 400 },
    );
  }

  const attachments = await prisma.attachment.findMany({
    where: {
      businessId: auth.session.businessId,
      job: { clientId: id },
    },
    select: { storageKey: true, thumbStorageKey: true },
  });

  await prisma.client.delete({ where: { id } });

  for (const a of attachments) {
    await deleteAttachmentFile(a.storageKey);
    await deleteAttachmentFile(a.thumbStorageKey);
  }

  return NextResponse.json({ ok: true });
}
