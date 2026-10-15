import { createHash, randomUUID } from "crypto";
import { mkdir, writeFile, readFile, unlink, access } from "fs/promises";
import path from "path";
import sharp from "sharp";

const ALLOWED_MIME = new Set([
  "image/jpeg",
  "image/png",
  "image/heic",
  "image/heif",
]);

const MAX_BYTES = 12 * 1024 * 1024; // 12 MB

export function isAllowedImageMime(mime: string): boolean {
  return ALLOWED_MIME.has(mime.toLowerCase());
}

export function maxUploadBytes(): number {
  return MAX_BYTES;
}

/**
 * Prefer a path that survives Hostinger hbuilds redeploys.
 * Override with UPLOAD_DIR when set.
 */
export function getUploadRoot(): string {
  if (process.env.UPLOAD_DIR) {
    return path.resolve(process.env.UPLOAD_DIR);
  }
  const cwd = process.cwd();
  if (cwd.includes("/hbuilds/")) {
    const domainRoot = cwd.split("/hbuilds/")[0];
    return path.join(domainRoot, "canopy-uploads");
  }
  return path.join(cwd, "data", "uploads");
}

export async function ensureUploadRoot(): Promise<string> {
  const root = getUploadRoot();
  await mkdir(root, { recursive: true });
  return root;
}

export function newStorageKey(): string {
  return randomUUID().replace(/-/g, "");
}

function filePathForKey(root: string, key: string): string {
  // Shard by first 2 chars to keep directories manageable
  const shard = key.slice(0, 2);
  return path.join(root, shard, key);
}

export async function writeAttachmentBytes(
  key: string,
  bytes: Buffer,
): Promise<string> {
  const root = await ensureUploadRoot();
  const full = filePathForKey(root, key);
  await mkdir(path.dirname(full), { recursive: true });
  await writeFile(full, bytes, { mode: 0o600 });
  return full;
}

export async function readAttachmentBytes(key: string): Promise<Buffer> {
  const root = getUploadRoot();
  const full = filePathForKey(root, key);
  return readFile(full);
}

export async function deleteAttachmentFile(key: string | null | undefined) {
  if (!key) return;
  const root = getUploadRoot();
  const full = filePathForKey(root, key);
  try {
    await unlink(full);
  } catch {
    // missing file is fine
  }
}

export async function attachmentExists(key: string): Promise<boolean> {
  const root = getUploadRoot();
  try {
    await access(filePathForKey(root, key));
    return true;
  } catch {
    return false;
  }
}

/**
 * Build a JPEG thumbnail for JPEG/PNG inputs. Returns null when the format
 * cannot be processed (e.g. raw HEIC without conversion).
 */
export async function makeJpegThumbnail(
  bytes: Buffer,
  mime: string,
): Promise<Buffer | null> {
  const lower = mime.toLowerCase();
  if (lower !== "image/jpeg" && lower !== "image/png") {
    return null;
  }
  try {
    return await sharp(bytes)
      .rotate()
      .resize({ width: 480, height: 480, fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 78 })
      .toBuffer();
  } catch {
    return null;
  }
}

export function contentHash(bytes: Buffer): string {
  return createHash("sha256").update(bytes).digest("hex").slice(0, 16);
}

export function normalizeMime(file: File | { type: string; name: string }): string {
  const raw = (file.type || "").toLowerCase();
  if (raw && ALLOWED_MIME.has(raw)) return raw;
  const name = file.name.toLowerCase();
  if (name.endsWith(".jpg") || name.endsWith(".jpeg")) return "image/jpeg";
  if (name.endsWith(".png")) return "image/png";
  if (name.endsWith(".heic")) return "image/heic";
  if (name.endsWith(".heif")) return "image/heif";
  return raw || "application/octet-stream";
}
