import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ authenticated: false }, { status: 401 });
  }

  const [user, business] = await Promise.all([
    prisma.user.findUnique({
      where: { id: session.userId },
      select: { id: true, email: true, name: true, role: true },
    }),
    prisma.business.findUnique({
      where: { id: session.businessId },
      select: { id: true, name: true, timezone: true },
    }),
  ]);

  if (!user || !business) {
    return NextResponse.json({ authenticated: false }, { status: 401 });
  }

  return NextResponse.json({
    authenticated: true,
    user,
    business,
  });
}
