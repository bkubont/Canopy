import { NextResponse } from "next/server";
import { requireOwnerSession } from "@/lib/api-auth";
import { importPilotBackup, type PilotBackup } from "@/lib/import-pilot";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  const auth = await requireOwnerSession();
  if ("error" in auth) return auth.error;

  let backup: PilotBackup;
  const contentType = request.headers.get("content-type") || "";

  try {
    if (contentType.includes("multipart/form-data")) {
      const form = await request.formData();
      const file = form.get("file");
      if (!file || typeof file === "string") {
        return NextResponse.json(
          { error: "Upload a Canopy V1 JSON backup file" },
          { status: 400 },
        );
      }
      backup = JSON.parse(await file.text()) as PilotBackup;
    } else {
      backup = (await request.json()) as PilotBackup;
    }
  } catch {
    return NextResponse.json({ error: "Invalid JSON backup" }, { status: 400 });
  }

  if (!Array.isArray(backup.clients)) {
    return NextResponse.json(
      { error: "Invalid backup: expected clients array (V1 IndexedDB export)" },
      { status: 400 },
    );
  }

  try {
    const result = await importPilotBackup(
      auth.session.businessId,
      auth.session.userId,
      backup,
    );
    return NextResponse.json({ ok: true, result });
  } catch (err) {
    return NextResponse.json(
      {
        error: err instanceof Error ? err.message : "Import failed",
      },
      { status: 500 },
    );
  }
}
