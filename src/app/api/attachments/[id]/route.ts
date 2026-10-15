import { NextResponse } from "next/server";
import { requireOwnerSession } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { readAttachmentBytes } from "@/lib/storage";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

/**
 * Authorized download only — no public/guessable file URLs.
 * Storage keys are random UUIDs under a private directory.
 */
export async function GET(request: Request, ctx: Ctx) {
  const auth = await requireOwnerSession();
  if ("error" in auth) return auth.error;
  const { id } = await ctx.params;

  const attachment = await prisma.attachment.findFirst({
    where: { id, businessId: auth.session.businessId },
  });
  if (!attachment) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const url = new URL(request.url);
  const variant = url.searchParams.get("variant");
  const useThumb =
    variant === "thumb" && Boolean(attachment.thumbStorageKey);

  const key = useThumb
    ? (attachment.thumbStorageKey as string)
    : attachment.storageKey;
  const mime = useThumb ? "image/jpeg" : attachment.mimeType;
  const filename = useThumb
    ? `thumb-${attachment.originalFilename.replace(/\.[^.]+$/, "")}.jpg`
    : attachment.originalFilename;

  try {
    const bytes = await readAttachmentBytes(key);
    return new NextResponse(new Uint8Array(bytes), {
      status: 200,
      headers: {
        "Content-Type": mime,
        "Content-Length": String(bytes.length),
        "Content-Disposition": `inline; filename="${filename.replace(/"/g, "")}"`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return NextResponse.json({ error: "File missing" }, { status: 404 });
  }
}
