"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type Job = {
  id: string;
  title: string;
  siteAddress: string | null;
  archivedAt: string | null;
};

type Client = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  notes: string | null;
  archivedAt: string | null;
  jobs: Job[];
};

export function ClientDetail({ clientId }: { clientId: string }) {
  const router = useRouter();
  const [client, setClient] = useState<Client | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [address, setAddress] = useState("");
  const [notes, setNotes] = useState("");
  const [jobTitle, setJobTitle] = useState("");
  const [confirmName, setConfirmName] = useState("");
  const [pending, setPending] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch(`/api/clients/${clientId}`);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(data.error || "Not found");
      return;
    }
    const c = data.client as Client;
    setClient(c);
    setName(c.name);
    setPhone(c.phone || "");
    setEmail(c.email || "");
    setAddress(c.address || "");
    setNotes(c.notes || "");
  }, [clientId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function save(e: FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    const res = await fetch(`/api/clients/${clientId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, phone, email, address, notes }),
    });
    const data = await res.json().catch(() => ({}));
    setPending(false);
    if (!res.ok) {
      setError(data.error || "Save failed");
      return;
    }
    await load();
  }

  async function setArchive(archive: boolean) {
    setPending(true);
    await fetch(`/api/clients/${clientId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ archive }),
    });
    setPending(false);
    await load();
  }

  async function permanentDelete() {
    if (!client) return;
    if (
      !window.confirm(
        `Permanently delete client "${client.name}" and all their jobs/notes/photos? This cannot be undone.`,
      )
    ) {
      return;
    }
    setPending(true);
    setError(null);
    const res = await fetch(`/api/clients/${clientId}`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ confirmName }),
    });
    const data = await res.json().catch(() => ({}));
    setPending(false);
    if (!res.ok) {
      setError(data.error || "Delete failed");
      return;
    }
    router.replace("/app/clients");
    router.refresh();
  }

  async function createJob(e: FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    const res = await fetch("/api/jobs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clientId, title: jobTitle }),
    });
    const data = await res.json().catch(() => ({}));
    setPending(false);
    if (!res.ok) {
      setError(data.error || "Could not create job");
      return;
    }
    setJobTitle("");
    router.push(`/app/jobs/${data.job.id}`);
  }

  if (!client && !error) return <p className="muted">Loading…</p>;
  if (!client) return <p className="error">{error}</p>;

  return (
    <div className="stack">
      {error ? <p className="error">{error}</p> : null}

      <form className="form-grid" onSubmit={save}>
        <div className="field">
          <label htmlFor="name">Name</label>
          <input
            id="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
        </div>
        <div className="field">
          <label htmlFor="phone">Phone</label>
          <input
            id="phone"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="email">Email</label>
          <input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="address">Address</label>
          <input
            id="address"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
          />
        </div>
        <div className="field full">
          <label htmlFor="notes">Client notes</label>
          <textarea
            id="notes"
            rows={3}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </div>
        <div className="actions full">
          <button className="btn" type="submit" disabled={pending}>
            Save
          </button>
          {client.archivedAt ? (
            <button
              className="btn secondary"
              type="button"
              disabled={pending}
              onClick={() => setArchive(false)}
            >
              Unarchive
            </button>
          ) : (
            <button
              className="btn secondary"
              type="button"
              disabled={pending}
              onClick={() => setArchive(true)}
            >
              Archive
            </button>
          )}
        </div>
      </form>

      <section className="section-block">
        <h2>Jobs</h2>
        <form className="inline-form" onSubmit={createJob}>
          <div className="field grow">
            <label htmlFor="job-title">New job (title + this client)</label>
            <input
              id="job-title"
              value={jobTitle}
              onChange={(e) => setJobTitle(e.target.value)}
              required
              placeholder="Job title"
            />
          </div>
          <button className="btn" type="submit" disabled={pending || !jobTitle.trim()}>
            Add job
          </button>
        </form>
        <ul className="list">
          {client.jobs.map((j) => (
            <li key={j.id} className="list-row">
              <div>
                <Link href={`/app/jobs/${j.id}`} className="list-title">
                  {j.title}
                </Link>
                <p className="muted small">
                  {[j.siteAddress, j.archivedAt ? "archived" : null]
                    .filter(Boolean)
                    .join(" · ") || "No site address"}
                </p>
              </div>
              <Link className="btn secondary small" href={`/app/jobs/${j.id}`}>
                Open
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section className="section-block danger-zone">
        <h2>Permanent delete</h2>
        <p className="muted small">
          Type the client name to confirm. Removes jobs, notes, and photo files.
        </p>
        <div className="inline-form">
          <input
            value={confirmName}
            onChange={(e) => setConfirmName(e.target.value)}
            placeholder={client.name}
            aria-label="Confirm client name"
          />
          <button
            className="btn danger"
            type="button"
            disabled={pending || confirmName !== client.name}
            onClick={permanentDelete}
          >
            Delete forever
          </button>
        </div>
      </section>
    </div>
  );
}
