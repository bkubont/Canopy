"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { NoteComposer } from "@/components/note-composer";

type Attachment = {
  id: string;
  originalFilename: string;
  mimeType: string;
  sizeBytes: number;
  hasThumb: boolean;
  downloadUrl: string;
  thumbUrl: string;
};

type Note = {
  id: string;
  text: string | null;
  createdAt: string;
  author: { name: string | null; email: string };
  attachments: Attachment[];
};

type Stage = { key: string; label: string; progress: string };

type Job = {
  id: string;
  title: string;
  siteAddress: string | null;
  description: string | null;
  archivedAt: string | null;
  version: number;
  client: {
    id: string;
    name: string;
    phone: string | null;
    email: string | null;
    address: string | null;
  };
  stagesPlaceholder: Stage[];
  notes: Note[];
};

export function JobDetail({ jobId }: { jobId: string }) {
  const router = useRouter();
  const [job, setJob] = useState<Job | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [siteAddress, setSiteAddress] = useState("");
  const [description, setDescription] = useState("");
  const [confirmTitle, setConfirmTitle] = useState("");
  const [pending, setPending] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch(`/api/jobs/${jobId}`);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(data.error || "Not found");
      return;
    }
    const j = data.job as Job;
    setJob(j);
    setTitle(j.title);
    setSiteAddress(j.siteAddress || "");
    setDescription(j.description || "");
  }, [jobId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function saveMeta(e: FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    const res = await fetch(`/api/jobs/${jobId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, siteAddress, description }),
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
    await fetch(`/api/jobs/${jobId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ archive }),
    });
    setPending(false);
    await load();
  }

  async function permanentDelete() {
    if (!job) return;
    if (
      !window.confirm(
        `Permanently delete job "${job.title}" and all notes/photos? This cannot be undone.`,
      )
    ) {
      return;
    }
    setPending(true);
    const res = await fetch(`/api/jobs/${jobId}`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ confirmTitle }),
    });
    const data = await res.json().catch(() => ({}));
    setPending(false);
    if (!res.ok) {
      setError(data.error || "Delete failed");
      return;
    }
    router.replace("/app/jobs");
    router.refresh();
  }

  if (!job && !error) return <p className="muted">Loading…</p>;
  if (!job) return <p className="error">{error}</p>;

  return (
    <div className="stack">
      {error ? <p className="error">{error}</p> : null}

      <div className="job-header">
        <div>
          <p className="muted small">
            Client:{" "}
            <Link href={`/app/clients/${job.client.id}`}>{job.client.name}</Link>
            {job.archivedAt ? " · archived" : ""}
          </p>
          <h1 className="page-title tight">{job.title}</h1>
        </div>
      </div>

      <form className="form-grid" onSubmit={saveMeta}>
        <div className="field">
          <label htmlFor="title">Title</label>
          <input
            id="title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
          />
        </div>
        <div className="field">
          <label htmlFor="site">Site address</label>
          <input
            id="site"
            value={siteAddress}
            onChange={(e) => setSiteAddress(e.target.value)}
            placeholder="Optional"
          />
        </div>
        <div className="field full">
          <label htmlFor="desc">Scope / description</label>
          <textarea
            id="desc"
            rows={3}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>
        <div className="actions full">
          <button className="btn" type="submit" disabled={pending}>
            Save
          </button>
          {job.archivedAt ? (
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
        <h2>Stages</h2>
        <p className="muted small">
          Placeholders for Phase 3 (Estimate → Prep → Tree Work → Cleanup).
        </p>
        <ul className="stage-list">
          {job.stagesPlaceholder.map((s) => (
            <li key={s.key} className={`stage-chip stage-${s.key}`}>
              <strong>{s.label}</strong>
              <span>{s.progress}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="section-block">
        <h2>Notes & photos</h2>
        <NoteComposer jobId={jobId} onSaved={() => void load()} />
        <div className="notes-feed">
          {job.notes.length === 0 ? (
            <p className="empty">No notes yet.</p>
          ) : (
            job.notes.map((n) => (
              <article key={n.id} className="note-card">
                <header>
                  <time dateTime={n.createdAt}>
                    {new Date(n.createdAt).toLocaleString()}
                  </time>
                  <span className="muted small">
                    {n.author.name || n.author.email}
                  </span>
                </header>
                {n.text ? <p className="note-text">{n.text}</p> : null}
                {n.attachments.length > 0 ? (
                  <div className="thumb-row">
                    {n.attachments.map((a) => (
                      <a
                        key={a.id}
                        href={a.downloadUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="thumb-link"
                        title={a.originalFilename}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={a.thumbUrl} alt={a.originalFilename} />
                      </a>
                    ))}
                  </div>
                ) : null}
              </article>
            ))
          )}
        </div>
      </section>

      <section className="section-block danger-zone">
        <h2>Permanent delete</h2>
        <p className="muted small">
          Type the job title to confirm. Removes notes and photo files.
        </p>
        <div className="inline-form">
          <input
            value={confirmTitle}
            onChange={(e) => setConfirmTitle(e.target.value)}
            placeholder={job.title}
            aria-label="Confirm job title"
          />
          <button
            className="btn danger"
            type="button"
            disabled={pending || confirmTitle !== job.title}
            onClick={permanentDelete}
          >
            Delete forever
          </button>
        </div>
      </section>
    </div>
  );
}
