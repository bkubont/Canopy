import { NextResponse } from "next/server";
import { requireOwnerSession } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import {
  deleteAttachmentFile,
  isAllowedImageMime,
  makeJpegThumbnail,
  maxUploadBytes,
  newStorageKey,
  normalizeMime,
  writeAttachmentBytes,
} from "@/lib/storage";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

/**
 * Create a note with optional text and/or photo attachments (multipart).
 * On partial attachment failure: note + successful files are kept; failed
 * files are reported so the client can retry without losing the draft text
 * that already saved (client also keeps local draft until full success).
 */
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

  const form = await request.formData();
  const textRaw = form.get("text");
  const text =
    typeof textRaw === "string" && textRaw.trim().length > 0
      ? textRaw.trim().slice(0, 20000)
      : null;

  const files = form
    .getAll("photos")
    .filter((v): v is File => typeof v !== "string" && v.size > 0);

  if (!text && files.length === 0) {
    return NextResponse.json(
      { error: "Add note text and/or at least one photo" },
      { status: 400 },
    );
  }

  for (const file of files) {
    const mime = normalizeMime(file);
    if (!isAllowedImageMime(mime)) {
      return NextResponse.json(
        {
          error: `Unsupported file type: ${file.name}. Use JPEG, PNG, or HEIC.`,
        },
        { status: 400 },
      );
    }
    if (file.size > maxUploadBytes()) {
      return NextResponse.json(
        { error: `${file.name} exceeds ${maxUploadBytes()} bytes` },
        { status: 400 },
      );
    }
  }

  const note = await prisma.note.create({
    data: {
      businessId: auth.session.businessId,
      jobId,
      authorUserId: auth.session.userId,
      text,
    },
  });

  const uploaded: Array<{
    id: string;
    originalFilename: string;
    mimeType: string;
    sizeBytes: number;
    hasThumb: boolean;
    downloadUrl: string;
    thumbUrl: string;
  }> = [];
  const failed: Array<{ filename: string; error: string }> = [];

  for (const file of files) {
    const mime = normalizeMime(file);
    const storageKey = newStorageKey();
    let thumbKey: string | null = null;
    try {
      const bytes = Buffer.from(await file.arrayBuffer());
      await writeAttachmentBytes(storageKey, bytes);
      const thumb = await makeJpegThumbnail(bytes, mime);
      if (thumb) {
        thumbKey = newStorageKey();
        await writeAttachmentBytes(thumbKey, thumb);
      }

      const attachment = await prisma.attachment.create({
        data: {
          businessId: auth.session.businessId,
          jobId,
          noteId: note.id,
          storageKey,
          thumbStorageKey: thumbKey,
          originalFilename: file.name.slice(0, 255),
          mimeType: mime,
          sizeBytes: bytes.length,
        },
      });

      uploaded.push({
        id: attachment.id,
        originalFilename: attachment.originalFilename,
        mimeType: attachment.mimeType,
        sizeBytes: attachment.sizeBytes,
        hasThumb: Boolean(thumbKey),
        downloadUrl: `/api/attachments/${attachment.id}`,
        thumbUrl: thumbKey
          ? `/api/attachments/${attachment.id}?variant=thumb`
          : `/api/attachments/${attachment.id}`,
      });
    } catch (err) {
      await deleteAttachmentFile(storageKey);
      await deleteAttachmentFile(thumbKey);
      failed.push({
        filename: file.name,
        error: err instanceof Error ? err.message : "upload failed",
      });
    }
  }

  const status = failed.length > 0 && uploaded.length === 0 && !text ? 500 : 201;

  return NextResponse.json(
    {
      note: {
        id: note.id,
        text: note.text,
        createdAt: note.createdAt,
        attachments: uploaded,
      },
      uploaded,
      failed,
      partial: failed.length > 0,
      draftHint:
        failed.length > 0
          ? "Note was saved; retry failed photos. Keep your draft text until all uploads succeed."
          : undefined,
    },
    { status },
  );
}
