import { NextResponse } from "next/server";
import { requireOwnerSession } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

function csvEscape(value: string | null | undefined): string {
  const s = value ?? "";
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export async function GET(request: Request) {
  const auth = await requireOwnerSession();
  if ("error" in auth) return auth.error;

  const url = new URL(request.url);
  const format = (url.searchParams.get("format") || "json").toLowerCase();

  const [clients, jobs, notes, attachments] = await Promise.all([
    prisma.client.findMany({
      where: { businessId: auth.session.businessId },
      orderBy: { name: "asc" },
    }),
    prisma.job.findMany({
      where: { businessId: auth.session.businessId },
      orderBy: { updatedAt: "desc" },
      include: { client: { select: { id: true, name: true } } },
    }),
    prisma.note.findMany({
      where: { businessId: auth.session.businessId },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        jobId: true,
        text: true,
        createdAt: true,
        authorUserId: true,
      },
    }),
    prisma.attachment.findMany({
      where: { businessId: auth.session.businessId },
      select: {
        id: true,
        jobId: true,
        noteId: true,
        originalFilename: true,
        mimeType: true,
        sizeBytes: true,
        createdAt: true,
      },
    }),
  ]);

  if (format === "csv") {
    const clientLines = [
      "id,name,phone,email,address,notes,archived_at,created_at",
      ...clients.map((c) =>
        [
          c.id,
          csvEscape(c.name),
          csvEscape(c.phone),
          csvEscape(c.email),
          csvEscape(c.address),
          csvEscape(c.notes),
          c.archivedAt?.toISOString() ?? "",
          c.createdAt.toISOString(),
        ].join(","),
      ),
    ].join("\n");

    const jobLines = [
      "id,client_id,client_name,title,site_address,description,archived_at,created_at",
      ...jobs.map((j) =>
        [
          j.id,
          j.clientId,
          csvEscape(j.client.name),
          csvEscape(j.title),
          csvEscape(j.siteAddress),
          csvEscape(j.description),
          j.archivedAt?.toISOString() ?? "",
          j.createdAt.toISOString(),
        ].join(","),
      ),
    ].join("\n");

    const body = `# clients\n${clientLines}\n\n# jobs\n${jobLines}\n`;
    return new NextResponse(body, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="canopy-export-clients-jobs.csv"`,
        "Cache-Control": "private, no-store",
      },
    });
  }

  return NextResponse.json({
    exportedAt: new Date().toISOString(),
    businessId: auth.session.businessId,
    clients,
    jobs: jobs.map(({ client, ...j }) => ({
      ...j,
      clientName: client.name,
    })),
    notes,
    attachmentsManifest: attachments,
    backupNotes:
      "Photo binary files are not embedded in this export. Use Hostinger backups for disk files under canopy-uploads. Attachment IDs are listed in attachmentsManifest.",
  });
}
