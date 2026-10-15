import { NextResponse } from "next/server";
import { getSession, type SessionPayload } from "@/lib/session";

export type Authed = { session: SessionPayload };

export async function requireOwnerSession(): Promise<
  Authed | { error: NextResponse }
> {
  const session = await getSession();
  if (!session) {
    return {
      error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }
  if (session.role !== "owner" && session.role !== "scheduler") {
    return {
      error: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    };
  }
  return { session };
}
