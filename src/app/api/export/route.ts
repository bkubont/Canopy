import { NextResponse } from "next/server";
import { requireOwnerSession } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { toDateString } from "@/lib/scheduling";

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
  const bid = auth.session.businessId;

  const [clients, jobs, notes, attachments, workers, visits, assignments] =
    await Promise.all([
      prisma.client.findMany({
        where: { businessId: bid },
        orderBy: { name: "asc" },
      }),
      prisma.job.findMany({
        where: { businessId: bid },
        orderBy: { updatedAt: "desc" },
        include: { client: { select: { id: true, name: true } } },
      }),
      prisma.note.findMany({
        where: { businessId: bid },
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
        where: { businessId: bid },
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
      prisma.worker.findMany({
        where: { businessId: bid },
        orderBy: { name: "asc" },
      }),
      prisma.visit.findMany({
        where: { businessId: bid },
        orderBy: { workDate: "asc" },
      }),
      prisma.assignment.findMany({
        where: { businessId: bid },
        orderBy: { createdAt: "asc" },
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
      "id,client_id,client_name,title,site_address,description,ready_for_scheduling,canceled_at,archived_at,created_at",
      ...jobs.map((j) =>
        [
          j.id,
          j.clientId,
          csvEscape(j.client.name),
          csvEscape(j.title),
          csvEscape(j.siteAddress),
          csvEscape(j.description),
          j.readyForScheduling ? "1" : "0",
          j.canceledAt?.toISOString() ?? "",
          j.archivedAt?.toISOString() ?? "",
          j.createdAt.toISOString(),
        ].join(","),
      ),
    ].join("\n");

    const visitLines = [
      "id,job_id,work_date,all_day,start_time,end_time,status,notes",
      ...visits.map((v) =>
        [
          v.id,
          v.jobId,
          toDateString(v.workDate),
          v.allDay ? "1" : "0",
          csvEscape(v.startTime),
          csvEscape(v.endTime),
          v.status,
          csvEscape(v.notes),
        ].join(","),
      ),
    ].join("\n");

    const workerLines = [
      "id,name,phone,role,archived_at",
      ...workers.map((w) =>
        [
          w.id,
          csvEscape(w.name),
          csvEscape(w.phone),
          csvEscape(w.role),
          w.archivedAt?.toISOString() ?? "",
        ].join(","),
      ),
    ].join("\n");

    const assignmentLines = [
      "id,worker_id,job_id,visit_id,stage_id,task_id,conflict_override_reason",
      ...assignments.map((a) =>
        [
          a.id,
          a.workerId,
          a.jobId,
          a.visitId ?? "",
          a.stageId ?? "",
          a.taskId ?? "",
          csvEscape(a.conflictOverrideReason),
        ].join(","),
      ),
    ].join("\n");

    const body = `# clients\n${clientLines}\n\n# jobs\n${jobLines}\n\n# workers\n${workerLines}\n\n# visits\n${visitLines}\n\n# assignments\n${assignmentLines}\n`;
    return new NextResponse(body, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="canopy-export.csv"`,
        "Cache-Control": "private, no-store",
      },
    });
  }

  return NextResponse.json({
    exportedAt: new Date().toISOString(),
    businessId: bid,
    clients,
    jobs: jobs.map(({ client, ...j }) => ({
      ...j,
      clientName: client.name,
    })),
    workers,
    visits: visits.map((v) => ({
      ...v,
      workDate: toDateString(v.workDate),
    })),
    assignments,
    notes,
    attachmentsManifest: attachments,
    backupNotes:
      "Photo binary files are not embedded in this export. Use Hostinger backups for disk files under canopy-uploads. Attachment IDs are listed in attachmentsManifest.",
  });
}
