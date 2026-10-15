/**
 * Client-only HEIC → JPEG conversion for browser-compatible preview/upload.
 * Dynamic-imports heic2any so the server bundle never loads it.
 */

export type PreparedImage = {
  file: File;
  previewUrl: string;
  convertedFromHeic: boolean;
};

function isHeic(file: File): boolean {
  const t = (file.type || "").toLowerCase();
  const n = file.name.toLowerCase();
  return (
    t === "image/heic" ||
    t === "image/heif" ||
    n.endsWith(".heic") ||
    n.endsWith(".heif")
  );
}

export function isSupportedImageFile(file: File): boolean {
  const t = (file.type || "").toLowerCase();
  const n = file.name.toLowerCase();
  if (["image/jpeg", "image/png", "image/heic", "image/heif"].includes(t)) {
    return true;
  }
  return /\.(jpe?g|png|heic|heif)$/i.test(n);
}

export async function prepareImageForUpload(file: File): Promise<PreparedImage> {
  if (!isHeic(file)) {
    return {
      file,
      previewUrl: URL.createObjectURL(file),
      convertedFromHeic: false,
    };
  }

  const heic2any = (await import("heic2any")).default;
  const converted = await heic2any({
    blob: file,
    toType: "image/jpeg",
    quality: 0.88,
  });
  const blob = Array.isArray(converted) ? converted[0] : converted;
  const jpegName = file.name.replace(/\.(heic|heif)$/i, ".jpg");
  const jpegFile = new File([blob], jpegName || "photo.jpg", {
    type: "image/jpeg",
    lastModified: Date.now(),
  });
  return {
    file: jpegFile,
    previewUrl: URL.createObjectURL(jpegFile),
    convertedFromHeic: true,
  };
}
