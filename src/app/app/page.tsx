import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { redirect } from "next/navigation";
import { LogoutButton } from "./logout-button";

export default async function AppShellPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const [user, business, clientCount, jobCount, health] = await Promise.all([
    prisma.user.findUnique({
      where: { id: session.userId },
      select: { name: true, email: true, role: true },
    }),
    prisma.business.findUnique({
      where: { id: session.businessId },
      select: { name: true, timezone: true },
    }),
    prisma.client.count({ where: { businessId: session.businessId } }),
    prisma.job.count({ where: { businessId: session.businessId } }),
    prisma.$queryRaw`SELECT 1`.then(() => true).catch(() => false),
  ]);

  if (!user || !business) redirect("/login");

  return (
    <main className="shell">
      <header className="topbar">
        <div className="brand">
          Canopy <span>· {business.name}</span>
        </div>
        <LogoutButton />
      </header>
      <section className="app-main">
        <h1
          style={{
            fontFamily: "var(--font-display)",
            fontSize: "2rem",
            margin: "0 0 0.4rem",
            letterSpacing: "-0.03em",
          }}
        >
          Signed-in shell
        </h1>
        <p className="muted">
          Phase 0 foundation is live. Clients, jobs, calendar, and kanban arrive
          in later phases.
        </p>
        <div className="status-grid">
          <div className="status-row">
            <span>Signed in as</span>
            <strong>
              {user.name || user.email} ({user.role})
            </strong>
          </div>
          <div className="status-row">
            <span>Timezone</span>
            <strong>{business.timezone}</strong>
          </div>
          <div className="status-row">
            <span>Database</span>
            <span className={health ? "pill" : "pill bad"}>
              {health ? "connected" : "error"}
            </span>
          </div>
          <div className="status-row">
            <span>Clients / jobs</span>
            <strong>
              {clientCount} / {jobCount}
            </strong>
          </div>
          <div className="status-row">
            <span>Health endpoint</span>
            <a href="/api/health">/api/health</a>
          </div>
        </div>
      </section>
    </main>
  );
}
