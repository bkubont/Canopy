"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type ClientOpt = { id: string; name: string };
type JobRow = {
  id: string;
  title: string;
  siteAddress: string | null;
  archivedAt: string | null;
  client: { id: string; name: string };
  noteCount: number;
};

export function JobsPanel() {
  const router = useRouter();
  const [jobs, setJobs] = useState<JobRow[]>([]);
  const [clients, setClients] = useState<ClientOpt[]>([]);
  const [q, setQ] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [clientId, setClientId] = useState("");
  const [title, setTitle] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (q.trim()) params.set("q", q.trim());
    params.set("archived", showArchived ? "1" : "0");
    const [jobsRes, clientsRes] = await Promise.all([
      fetch(`/api/jobs?${params}`),
      fetch("/api/clients?archived=0"),
    ]);
    const jobsData = await jobsRes.json().catch(() => ({}));
    const clientsData = await clientsRes.json().catch(() => ({}));
    if (jobsRes.ok) setJobs(jobsData.jobs || []);
    else setError(jobsData.error || "Failed to load jobs");
    if (clientsRes.ok) {
      const list = (clientsData.clients || []) as ClientOpt[];
      setClients(list.map((c) => ({ id: c.id, name: c.name })));
      setClientId((prev) => prev || list[0]?.id || "");
    }
    setLoading(false);
  }, [q, showArchived]);

  useEffect(() => {
    void load();
  }, [load]);

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    const res = await fetch("/api/jobs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clientId, title }),
    });
    const data = await res.json().catch(() => ({}));
    setPending(false);
    if (!res.ok) {
      setError(data.error || "Could not create job");
      return;
    }
    router.push(`/app/jobs/${data.job.id}`);
  }

  return (
    <div className="stack">
      <form className="inline-form wrap" onSubmit={onCreate}>
        <div className="field">
          <label htmlFor="job-client">Client</label>
          <select
            id="job-client"
            value={clientId}
            onChange={(e) => setClientId(e.target.value)}
            required
          >
            {clients.length === 0 ? (
              <option value="">Add a client first</option>
            ) : (
              clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))
            )}
          </select>
        </div>
        <div className="field grow">
          <label htmlFor="job-title">Title (client + title is enough)</label>
          <input
            id="job-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
            placeholder="Job title"
          />
        </div>
        <button
          className="btn"
          type="submit"
          disabled={pending || !clientId || !title.trim()}
        >
          {pending ? "Saving…" : "Save job"}
        </button>
      </form>

      <div className="toolbar">
        <input
          className="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search jobs or clients"
          aria-label="Search jobs"
        />
        <label className="check">
          <input
            type="checkbox"
            checked={showArchived}
            onChange={(e) => setShowArchived(e.target.checked)}
          />
          Archived
        </label>
      </div>

      {error ? <p className="error">{error}</p> : null}

      {loading ? (
        <p className="muted">Loading…</p>
      ) : jobs.length === 0 ? (
        <p className="empty">No jobs yet.</p>
      ) : (
        <ul className="list">
          {jobs.map((j) => (
            <li key={j.id} className="list-row">
              <div>
                <Link href={`/app/jobs/${j.id}`} className="list-title">
                  {j.title}
                </Link>
                <p className="muted small">
                  {[
                    j.client.name,
                    j.siteAddress,
                    `${j.noteCount} notes`,
                    j.archivedAt ? "archived" : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              </div>
              <Link className="btn secondary small" href={`/app/jobs/${j.id}`}>
                Open
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
