import { prisma } from "@/lib/prisma";
import {
  deleteAttachmentFile,
  isAllowedImageMime,
  makeJpegThumbnail,
  newStorageKey,
  writeAttachmentBytes,
} from "@/lib/storage";

export type PilotBackup = {
  schema?: number;
  clients?: PilotClient[];
  projects?: PilotProject[];
  notes?: PilotNote[];
  photos?: PilotPhoto[];
  workers?: unknown[];
  visits?: unknown[];
  tasks?: unknown[];
  history?: unknown[];
};

type PilotClient = {
  id?: string;
  name?: string;
  phone?: string;
  email?: string;
  address?: string;
  details?: string;
};

type PilotProject = {
  id?: string;
  clientId?: string;
  title?: string;
  address?: string;
  description?: string;
};

type PilotNote = {
  id?: string;
  projectId?: string;
  text?: string;
  time?: string;
};

type PilotPhoto = {
  id?: string;
  projectId?: string;
  data?: string;
  caption?: string;
  time?: string;
};

export type ImportResult = {
  clientsCreated: number;
  jobsCreated: number;
  notesCreated: number;
  photosImported: number;
  photosSkipped: number;
  skipped: string[];
};

function dataUrlToBuffer(dataUrl: string): { mime: string; bytes: Buffer } | null {
  const match = /^data:([^;]+);base64,([\s\S]+)$/.exec(dataUrl);
  if (!match) return null;
  const mime = match[1].toLowerCase();
  try {
    return { mime, bytes: Buffer.from(match[2], "base64") };
  } catch {
    return null;
  }
}

/**
 * Map V1 IndexedDB JSON backup into MySQL where fields align.
 * Does not import visits/tasks/workers/history (Phase 2+).
 */
export async function importPilotBackup(
  businessId: string,
  authorUserId: string,
  backup: PilotBackup,
): Promise<ImportResult> {
  const result: ImportResult = {
    clientsCreated: 0,
    jobsCreated: 0,
    notesCreated: 0,
    photosImported: 0,
    photosSkipped: 0,
    skipped: [],
  };

  if (!Array.isArray(backup.clients)) {
    throw new Error("Invalid backup: clients must be an array");
  }

  const clientIdMap = new Map<string, string>();
  const jobIdMap = new Map<string, string>();

  for (const c of backup.clients) {
    const name = (c.name || "").trim();
    if (!name) {
      result.skipped.push("client without name");
      continue;
    }
    const created = await prisma.client.create({
      data: {
        businessId,
        name,
        phone: c.phone?.trim() || null,
        email: c.email?.trim() || null,
        address: c.address?.trim() || null,
        notes: c.details?.trim() || null,
      },
    });
    if (c.id) clientIdMap.set(c.id, created.id);
    result.clientsCreated += 1;
  }

  for (const p of backup.projects || []) {
    const title = (p.title || "").trim();
    if (!title) {
      result.skipped.push("project without title");
      continue;
    }
    const mappedClientId = p.clientId ? clientIdMap.get(p.clientId) : undefined;
    if (!mappedClientId) {
      result.skipped.push(`project "${title}" missing mapped client`);
      continue;
    }
    const created = await prisma.job.create({
      data: {
        businessId,
        clientId: mappedClientId,
        title,
        siteAddress: p.address?.trim() || null,
        description: p.description?.trim() || null,
      },
    });
    if (p.id) jobIdMap.set(p.id, created.id);
    result.jobsCreated += 1;
  }

  for (const n of backup.notes || []) {
    const text = (n.text || "").trim();
    const mappedJobId = n.projectId ? jobIdMap.get(n.projectId) : undefined;
    if (!mappedJobId || !text) {
      result.skipped.push("note without job or text");
      continue;
    }
    await prisma.note.create({
      data: {
        businessId,
        jobId: mappedJobId,
        authorUserId,
        text,
        ...(n.time ? { createdAt: new Date(n.time) } : {}),
      },
    });
    result.notesCreated += 1;
  }

  for (const photo of backup.photos || []) {
    const mappedJobId = photo.projectId
      ? jobIdMap.get(photo.projectId)
      : undefined;
    if (!mappedJobId || !photo.data) {
      result.photosSkipped += 1;
      continue;
    }
    const parsed = dataUrlToBuffer(photo.data);
    if (!parsed || !isAllowedImageMime(parsed.mime)) {
      result.photosSkipped += 1;
      continue;
    }
    if (parsed.bytes.length > 12 * 1024 * 1024) {
      result.photosSkipped += 1;
      continue;
    }

    const storageKey = newStorageKey();
    let thumbKey: string | null = null;
    try {
      await writeAttachmentBytes(storageKey, parsed.bytes);
      const thumb = await makeJpegThumbnail(parsed.bytes, parsed.mime);
      if (thumb) {
        thumbKey = newStorageKey();
        await writeAttachmentBytes(thumbKey, thumb);
      }

      const caption = (photo.caption || "").trim();
      const note = await prisma.note.create({
        data: {
          businessId,
          jobId: mappedJobId,
          authorUserId,
          text: caption || null,
          ...(photo.time ? { createdAt: new Date(photo.time) } : {}),
        },
      });

      await prisma.attachment.create({
        data: {
          businessId,
          jobId: mappedJobId,
          noteId: note.id,
          storageKey,
          thumbStorageKey: thumbKey,
          originalFilename: caption
            ? `${caption.slice(0, 80)}.jpg`
            : "imported-photo.jpg",
          mimeType: parsed.mime,
          sizeBytes: parsed.bytes.length,
        },
      });
      result.photosImported += 1;
      result.notesCreated += 1;
    } catch {
      await deleteAttachmentFile(storageKey);
      await deleteAttachmentFile(thumbKey);
      result.photosSkipped += 1;
    }
  }

  if ((backup.visits?.length || 0) > 0) {
    result.skipped.push(
      `${backup.visits!.length} visits not imported (Phase 2)`,
    );
  }
  if ((backup.tasks?.length || 0) > 0) {
    result.skipped.push(`${backup.tasks!.length} tasks not imported (Phase 3)`);
  }
  if ((backup.workers?.length || 0) > 0) {
    result.skipped.push(
      `${backup.workers!.length} workers not imported (Phase 2)`,
    );
  }

  return result;
}
