"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";

type Worker = {
  id: string;
  name: string;
  phone: string | null;
  role: string | null;
  archivedAt: string | null;
};

export function WorkersPanel() {
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [showArchived, setShowArchived] = useState(false);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [role, setRole] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [editId, setEditId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [editRole, setEditRole] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    params.set("archived", showArchived ? "1" : "0");
    const res = await fetch(`/api/workers?${params}`);
    const data = await res.json().catch(() => ({}));
    if (res.ok) setWorkers(data.workers || []);
    else setError(data.error || "Failed to load workers");
    setLoading(false);
  }, [showArchived]);

  useEffect(() => {
    void load();
  }, [load]);

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    const res = await fetch("/api/workers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, phone: phone || null, role: role || null }),
    });
    const data = await res.json().catch(() => ({}));
    setPending(false);
    if (!res.ok) {
      setError(data.error || "Could not add worker");
      return;
    }
    setName("");
    setPhone("");
    setRole("");
    await load();
  }

  function startEdit(w: Worker) {
    setEditId(w.id);
    setEditName(w.name);
    setEditPhone(w.phone || "");
    setEditRole(w.role || "");
  }

  async function saveEdit(e: FormEvent) {
    e.preventDefault();
    if (!editId) return;
    setPending(true);
    const res = await fetch(`/api/workers/${editId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: editName,
        phone: editPhone || null,
        role: editRole || null,
      }),
    });
    setPending(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "Save failed");
      return;
    }
    setEditId(null);
    await load();
  }

  async function setArchive(id: string, archive: boolean) {
    setPending(true);
    await fetch(`/api/workers/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ archive }),
    });
    setPending(false);
    await load();
  }

  async function permanentDelete(w: Worker) {
    const confirmName = window.prompt(
      `Type "${w.name}" to permanently delete this worker:`,
    );
    if (confirmName !== w.name) return;
    setPending(true);
    const res = await fetch(`/api/workers/${w.id}`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ confirmName }),
    });
    setPending(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "Delete failed");
      return;
    }
    await load();
  }

  return (
    <div className="stack">
      <p className="muted">
        Roster names only — workers do not log in. Assign them on jobs, visits,
        stages, or tasks.
      </p>

      {error ? <p className="error">{error}</p> : null}

      <form className="inline-form wrap" onSubmit={onCreate}>
        <div className="field grow">
          <label htmlFor="w-name">Name</label>
          <input
            id="w-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
        </div>
        <div className="field">
          <label htmlFor="w-phone">Phone</label>
          <input
            id="w-phone"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="w-role">Role / skills</label>
          <input
            id="w-role"
            value={role}
            onChange={(e) => setRole(e.target.value)}
          />
        </div>
        <button className="btn" type="submit" disabled={pending}>
          Add worker
        </button>
      </form>

      <label className="check">
        <input
          type="checkbox"
          checked={showArchived}
          onChange={(e) => setShowArchived(e.target.checked)}
        />
        Show archived
      </label>

      {loading ? (
        <p className="muted">Loading…</p>
      ) : workers.length === 0 ? (
        <p className="empty">No workers yet.</p>
      ) : (
        <ul className="list">
          {workers.map((w) => (
            <li key={w.id} className="list-row">
              {editId === w.id ? (
                <form className="inline-form wrap" onSubmit={saveEdit}>
                  <input
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    required
                    aria-label="Name"
                  />
                  <input
                    value={editPhone}
                    onChange={(e) => setEditPhone(e.target.value)}
                    placeholder="Phone"
                    aria-label="Phone"
                  />
                  <input
                    value={editRole}
                    onChange={(e) => setEditRole(e.target.value)}
                    placeholder="Role"
                    aria-label="Role"
                  />
                  <button className="btn small" type="submit" disabled={pending}>
                    Save
                  </button>
                  <button
                    className="btn secondary small"
                    type="button"
                    onClick={() => setEditId(null)}
                  >
                    Cancel
                  </button>
                </form>
              ) : (
                <>
                  <div>
                    <div className="list-title">{w.name}</div>
                    <div className="muted small">
                      {[w.role, w.phone].filter(Boolean).join(" · ") ||
                        "No role / phone"}
                      {w.archivedAt ? " · archived" : ""}
                    </div>
                  </div>
                  <div className="actions">
                    <button
                      className="btn secondary small"
                      type="button"
                      onClick={() => startEdit(w)}
                    >
                      Edit
                    </button>
                    {w.archivedAt ? (
                      <button
                        className="btn secondary small"
                        type="button"
                        disabled={pending}
                        onClick={() => setArchive(w.id, false)}
                      >
                        Unarchive
                      </button>
                    ) : (
                      <button
                        className="btn secondary small"
                        type="button"
                        disabled={pending}
                        onClick={() => setArchive(w.id, true)}
                      >
                        Archive
                      </button>
                    )}
                    <button
                      className="btn danger small"
                      type="button"
                      disabled={pending}
                      onClick={() => permanentDelete(w)}
                    >
                      Delete
                    </button>
                  </div>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
