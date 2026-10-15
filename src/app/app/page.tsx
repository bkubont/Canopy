import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { redirect } from "next/navigation";

export default async function AppHomePage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const [user, business, clientCount, jobCount, noteCount, health] =
    await Promise.all([
      prisma.user.findUnique({
        where: { id: session.userId },
        select: { name: true, email: true, role: true },
      }),
      prisma.business.findUnique({
        where: { id: session.businessId },
        select: { name: true, timezone: true },
      }),
      prisma.client.count({
        where: { businessId: session.businessId, archivedAt: null },
      }),
      prisma.job.count({
        where: { businessId: session.businessId, archivedAt: null },
      }),
      prisma.note.count({ where: { businessId: session.businessId } }),
      prisma.$queryRaw`SELECT 1`.then(() => true).catch(() => false),
    ]);

  if (!user || !business) redirect("/login");

  return (
    <section className="app-main">
      <h1 className="page-title">Owner workspace</h1>
      <p className="muted">
        Clients, jobs, and notes with protected photos. Calendar and kanban come
        in later phases.
      </p>

      <div className="quick-links">
        <Link className="btn" href="/app/clients">
          Clients
        </Link>
        <Link className="btn secondary" href="/app/jobs">
          Jobs
        </Link>
        <Link className="btn secondary" href="/app/settings">
          Export / import
        </Link>
      </div>

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
          <span>Active clients / jobs</span>
          <strong>
            {clientCount} / {jobCount}
          </strong>
        </div>
        <div className="status-row">
          <span>Notes</span>
          <strong>{noteCount}</strong>
        </div>
        <div className="status-row">
          <span>Health</span>
          <a href="/api/health">/api/health</a>
        </div>
      </div>
    </section>
  );
}
