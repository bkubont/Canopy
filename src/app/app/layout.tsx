import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { redirect } from "next/navigation";
import { AppNav } from "@/components/app-nav";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();
  if (!session) redirect("/login");

  const business = await prisma.business.findUnique({
    where: { id: session.businessId },
    select: { name: true },
  });
  if (!business) redirect("/login");

  return (
    <main className="shell">
      <AppNav businessName={business.name} />
      {children}
    </main>
  );
}
