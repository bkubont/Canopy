import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { setSessionCookie, type SessionPayload } from "@/lib/session";

export const loginSchema = z.object({
  email: z.string().email().max(255),
  password: z.string().min(8).max(200),
});

const BCRYPT_ROUNDS = 12;

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_ROUNDS);
}

export async function verifyPassword(
  password: string,
  passwordHash: string,
): Promise<boolean> {
  return bcrypt.compare(password, passwordHash);
}

export async function authenticateOwner(
  email: string,
  password: string,
): Promise<SessionPayload | null> {
  const user = await prisma.user.findUnique({
    where: { email: email.toLowerCase().trim() },
  });
  if (!user) return null;
  if (user.role !== "owner" && user.role !== "scheduler") return null;

  const ok = await verifyPassword(password, user.passwordHash);
  if (!ok) return null;

  const session: SessionPayload = {
    userId: user.id,
    businessId: user.businessId,
    email: user.email,
    role: user.role,
  };
  await setSessionCookie(session);
  return session;
}
