import { NextResponse } from "next/server";
import { authenticateOwner, loginSchema } from "@/lib/auth";

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = loginSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid email or password" }, { status: 400 });
  }

  try {
    const session = await authenticateOwner(
      parsed.data.email,
      parsed.data.password,
    );
    if (!session) {
      return NextResponse.json({ error: "Invalid email or password" }, { status: 401 });
    }
    return NextResponse.json({
      ok: true,
      user: {
        email: session.email,
        role: session.role,
        businessId: session.businessId,
      },
    });
  } catch (err) {
    console.error("login failed", err);
    return NextResponse.json({ error: "Login failed" }, { status: 500 });
  }
}
