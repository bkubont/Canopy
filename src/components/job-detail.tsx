"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { NoteComposer } from "@/components/note-composer";
import { VisitScheduler } from "@/components/visit-scheduler";

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

type Stage = {
  id: string;
  key: string;
  label: string;
  progress: string;
  progressLabel: string;
};

type Visit = {
  id: string;
  workDate: string;
  allDay: boolean;
  startTime: string | null;
  endTime: string | null;
  status: string;
  notes: string | null;
  assignments: { id: string; workerId: string; workerName: string }[];
};

type Assignment = {
  id: string;
  workerId: string;
  workerName: string;
  visitId: string | null;
  stageId: string | null;
  taskId: string | null;
  level: string;
  stage: { id: string; key: string; label: string } | null;
  task: { id: string; title: string } | null;
  visit: { id: string; workDate: string } | null;
  conflictOverrideReason: string | null;
};

type Task = { id: string; title: string; kind: string; done: boolean };

type WorkerOpt = { id: string; name: string };

type Job = {
  id: string;
  title: string;
  siteAddress: string | null;
  description: string | null;
  archivedAt: string | null;
  readyForScheduling: boolean;
  canceledAt: string | null;
  schedulingState: string;
  version: number;
  client: {
    id: string;
    name: string;
    phone: string | null;
    email: string | null;
    address: string | null;
  };
  stages: Stage[];
  visits: Visit[];
  assignments: Assignment[];
  tasks: Task[];
  notes: Note[];
};

export function JobDetail({ jobId }: { jobId: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const selectedVisit = searchParams.get("visit");

  const [job, setJob] = useState<Job | null>(null);
  const [workers, setWorkers] = useState<WorkerOpt[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [siteAddress, setSiteAddress] = useState("");
  const [description, setDescription] = useState("");
  const [confirmTitle, setConfirmTitle] = useState("");
  const [pending, setPending] = useState(false);
  const [assignWorkerId, setAssignWorkerId] = useState("");
  const [assignLevel, setAssignLevel] = useState<"job" | "visit" | "stage" | "task">(
    "job",
  );
  const [assignTargetId, setAssignTargetId] = useState("");
  const [overrideReason, setOverrideReason] = useState("");
  const [conflictMsg, setConflictMsg] = useState<string | null>(null);
  const [taskTitle, setTaskTitle] = useState("");

  const load = useCallback(async () => {
    const [jobRes, workersRes] = await Promise.all([
      fetch(`/api/jobs/${jobId}`),
      fetch("/api/workers?archived=0"),
    ]);
    const data = await jobRes.json().catch(() => ({}));
    const workersData = await workersRes.json().catch(() => ({}));
    if (!jobRes.ok) {
      setError(data.error || "Not found");
      return;
    }
    const j = data.job as Job;
    setJob(j);
    setTitle(j.title);
    setSiteAddress(j.siteAddress || "");
    setDescription(j.description || "");
    if (workersRes.ok) {
      const list = (workersData.workers || []) as WorkerOpt[];
      setWorkers(list);
      setAssignWorkerId((prev) => prev || list[0]?.id || "");
    }
  }, [jobId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!selectedVisit) return;
    const el = document.getElementById(`visit-${selectedVisit}`);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [selectedVisit, job]);

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

  async function patchJob(body: Record<string, unknown>) {
    setPending(true);
    setError(null);
    const res = await fetch(`/api/jobs/${jobId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    setPending(false);
    if (!res.ok) {
      setError(data.error || "Update failed");
      return;
    }
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

  async function cancelVisit(visitId: string, cancel: boolean) {
    setPending(true);
    await fetch(`/api/visits/${visitId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cancel }),
    });
    setPending(false);
    await load();
  }

  async function deleteVisit(visitId: string) {
    if (!window.confirm("Delete this visit?")) return;
    setPending(true);
    await fetch(`/api/visits/${visitId}`, { method: "DELETE" });
    setPending(false);
    await load();
  }

  async function createAssignment(e: FormEvent) {
    e.preventDefault();
    if (!assignWorkerId) return;
    setPending(true);
    setError(null);
    setConflictMsg(null);
    const body: Record<string, unknown> = {
      workerId: assignWorkerId,
      jobId,
    };
    if (assignLevel === "visit") body.visitId = assignTargetId;
    if (assignLevel === "stage") body.stageId = assignTargetId;
    if (assignLevel === "task") body.taskId = assignTargetId;
    if (overrideReason.trim()) {
      body.conflictOverrideReason = overrideReason.trim();
    }
    const res = await fetch("/api/assignments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    setPending(false);
    if (res.status === 409 && data.requiresOverride) {
      setConflictMsg(data.message || "Conflict");
      return;
    }
    if (!res.ok) {
      setError(data.error || "Assign failed");
      return;
    }
    setOverrideReason("");
    setConflictMsg(null);
    await load();
  }

  async function removeAssignment(id: string) {
    setPending(true);
    await fetch(`/api/assignments/${id}`, { method: "DELETE" });
    setPending(false);
    await load();
  }

  async function addTask(e: FormEvent) {
    e.preventDefault();
    if (!taskTitle.trim()) return;
    setPending(true);
    const res = await fetch(`/api/jobs/${jobId}/tasks`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: taskTitle }),
    });
    setPending(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "Could not add task");
      return;
    }
    setTaskTitle("");
    await load();
  }

  if (!job && !error) return <p className="muted">Loading…</p>;
  if (!job) return <p className="error">{error}</p>;

  const stateLabel =
    job.schedulingState.charAt(0).toUpperCase() + job.schedulingState.slice(1);

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
          <p className="muted small">
            Scheduling:{" "}
            <span className={`pill state-${job.schedulingState}`}>
              {stateLabel}
            </span>
          </p>
        </div>
        <div className="actions">
          {!job.canceledAt && job.schedulingState === "unscheduled" ? (
            <button
              className="btn secondary small"
              type="button"
              disabled={pending}
              onClick={() => patchJob({ readyForScheduling: true })}
            >
              Mark ready
            </button>
          ) : null}
          {!job.canceledAt && job.readyForScheduling && job.schedulingState === "ready" ? (
            <button
              className="btn secondary small"
              type="button"
              disabled={pending}
              onClick={() => patchJob({ readyForScheduling: false })}
            >
              Unmark ready
            </button>
          ) : null}
          {job.canceledAt ? (
            <button
              className="btn secondary small"
              type="button"
              disabled={pending}
              onClick={() => patchJob({ cancel: false })}
            >
              Restore job
            </button>
          ) : (
            <button
              className="btn secondary small"
              type="button"
              disabled={pending}
              onClick={() => {
                if (window.confirm("Cancel this job?")) {
                  void patchJob({ cancel: true });
                }
              }}
            >
              Cancel job
            </button>
          )}
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
              onClick={() => patchJob({ archive: false })}
            >
              Unarchive
            </button>
          ) : (
            <button
              className="btn secondary"
              type="button"
              disabled={pending}
              onClick={() => patchJob({ archive: true })}
            >
              Archive
            </button>
          )}
        </div>
      </form>

      <section className="section-block">
        <h2>Visits</h2>
        {job.visits.length === 0 ? (
          <p className="empty">No visits scheduled.</p>
        ) : (
          <ul className="list">
            {job.visits.map((v) => (
              <li
                key={v.id}
                id={`visit-${v.id}`}
                className={`list-row${selectedVisit === v.id ? " selected-visit" : ""}`}
              >
                <div>
                  <div className="list-title">
                    {v.workDate}
                    {v.status === "canceled" ? " (canceled)" : ""}
                  </div>
                  <div className="muted small">
                    {v.allDay
                      ? "All day"
                      : `${v.startTime || "?"}–${v.endTime || "?"}`}
                    {v.assignments.length
                      ? ` · ${v.assignments.map((a) => a.workerName).join(", ")}`
                      : " · Unassigned"}
                    {v.notes ? ` · ${v.notes}` : ""}
                  </div>
                </div>
                <div className="actions">
                  {v.status === "canceled" ? (
                    <button
                      className="btn secondary small"
                      type="button"
                      disabled={pending}
                      onClick={() => cancelVisit(v.id, false)}
                    >
                      Restore
                    </button>
                  ) : (
                    <button
                      className="btn secondary small"
                      type="button"
                      disabled={pending}
                      onClick={() => cancelVisit(v.id, true)}
                    >
                      Cancel
                    </button>
                  )}
                  <button
                    className="btn danger small"
                    type="button"
                    disabled={pending}
                    onClick={() => deleteVisit(v.id)}
                  >
                    Delete
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
        {!job.canceledAt ? (
          <VisitScheduler
            jobId={jobId}
            workers={workers}
            onCreated={() => void load()}
          />
        ) : null}
      </section>

      <section className="section-block">
        <h2>Assignments</h2>
        <p className="muted small">
          Optional at job, visit, stage, or task level. Timed overlaps warn;
          owner can override with a reason.
        </p>
        {conflictMsg ? (
          <div className="warn-inline stack-sm">
            <p>{conflictMsg}</p>
            <div className="field">
              <label htmlFor="asg-override">Override reason</label>
              <input
                id="asg-override"
                value={overrideReason}
                onChange={(e) => setOverrideReason(e.target.value)}
                placeholder="Required to save despite conflict"
              />
            </div>
          </div>
        ) : null}
        <form className="inline-form wrap" onSubmit={createAssignment}>
          <div className="field">
            <label htmlFor="asg-worker">Worker</label>
            <select
              id="asg-worker"
              value={assignWorkerId}
              onChange={(e) => setAssignWorkerId(e.target.value)}
              required
            >
              {workers.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="asg-level">Level</label>
            <select
              id="asg-level"
              value={assignLevel}
              onChange={(e) => {
                const level = e.target.value as typeof assignLevel;
                setAssignLevel(level);
                setAssignTargetId("");
              }}
            >
              <option value="job">Whole job</option>
              <option value="visit">Visit</option>
              <option value="stage">Stage</option>
              <option value="task">Task</option>
            </select>
          </div>
          {assignLevel === "visit" ? (
            <div className="field">
              <label htmlFor="asg-visit">Visit</label>
              <select
                id="asg-visit"
                value={assignTargetId}
                onChange={(e) => setAssignTargetId(e.target.value)}
                required
              >
                <option value="">Choose…</option>
                {job.visits
                  .filter((v) => v.status !== "canceled")
                  .map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.workDate}
                    </option>
                  ))}
              </select>
            </div>
          ) : null}
          {assignLevel === "stage" ? (
            <div className="field">
              <label htmlFor="asg-stage">Stage</label>
              <select
                id="asg-stage"
                value={assignTargetId}
                onChange={(e) => setAssignTargetId(e.target.value)}
                required
              >
                <option value="">Choose…</option>
                {job.stages.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                  </option>
                ))}
              </select>
            </div>
          ) : null}
          {assignLevel === "task" ? (
            <div className="field">
              <label htmlFor="asg-task">Task</label>
              <select
                id="asg-task"
                value={assignTargetId}
                onChange={(e) => setAssignTargetId(e.target.value)}
                required
              >
                <option value="">Choose…</option>
                {job.tasks.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.title}
                  </option>
                ))}
              </select>
            </div>
          ) : null}
          <button className="btn" type="submit" disabled={pending || !workers.length}>
            Assign
          </button>
        </form>
        {job.assignments.length === 0 ? (
          <p className="empty">No assignments yet.</p>
        ) : (
          <ul className="list">
            {job.assignments.map((a) => (
              <li key={a.id} className="list-row">
                <div>
                  <div className="list-title">{a.workerName}</div>
                  <div className="muted small">
                    {a.level}
                    {a.visit ? ` · ${a.visit.workDate}` : ""}
                    {a.stage ? ` · ${a.stage.label}` : ""}
                    {a.task ? ` · ${a.task.title}` : ""}
                    {a.conflictOverrideReason
                      ? ` · override: ${a.conflictOverrideReason}`
                      : ""}
                  </div>
                </div>
                <button
                  className="btn secondary small"
                  type="button"
                  disabled={pending}
                  onClick={() => removeAssignment(a.id)}
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="section-block">
        <h2>Stages</h2>
        <p className="muted small">
          Placeholders for Phase 3 kanban. Assignments can already target a
          stage.
        </p>
        <ul className="stage-list">
          {job.stages.map((s) => (
            <li key={s.key} className={`stage-chip stage-${s.key}`}>
              <strong>{s.label}</strong>
              <span>{s.progressLabel}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="section-block">
        <h2>Tasks (placeholder)</h2>
        <p className="muted small">
          Minimal tasks for assignment targets. Dump-run depth arrives in Phase
          3.
        </p>
        <form className="inline-form" onSubmit={addTask}>
          <div className="field grow">
            <label htmlFor="task-title">Title</label>
            <input
              id="task-title"
              value={taskTitle}
              onChange={(e) => setTaskTitle(e.target.value)}
              placeholder="e.g. Brush dump run"
            />
          </div>
          <button className="btn secondary" type="submit" disabled={pending}>
            Add task
          </button>
        </form>
        {job.tasks.length === 0 ? (
          <p className="empty">No tasks yet.</p>
        ) : (
          <ul className="list">
            {job.tasks.map((t) => (
              <li key={t.id} className="list-row">
                <span>
                  {t.done ? "✓ " : "○ "}
                  {t.title}{" "}
                  <span className="muted small">({t.kind})</span>
                </span>
              </li>
            ))}
          </ul>
        )}
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
          Type the job title to confirm. Removes notes, photos, visits, and
          assignments.
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
