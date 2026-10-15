"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useState } from "react";

type ClientRow = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  archivedAt: string | null;
  activeJobCount: number;
};

export function ClientsPanel() {
  const [clients, setClients] = useState<ClientRow[]>([]);
  const [q, setQ] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (q.trim()) params.set("q", q.trim());
    params.set("archived", showArchived ? "1" : "0");
    const res = await fetch(`/api/clients?${params}`);
    const data = await res.json().catch(() => ({}));
    if (res.ok) setClients(data.clients || []);
    else setError(data.error || "Failed to load clients");
    setLoading(false);
  }, [q, showArchived]);

  useEffect(() => {
    void load();
  }, [load]);

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    const res = await fetch("/api/clients", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    const data = await res.json().catch(() => ({}));
    setPending(false);
    if (!res.ok) {
      setError(data.error || "Could not create client");
      return;
    }
    setName("");
    await load();
  }

  return (
    <div className="stack">
      <form className="inline-form" onSubmit={onCreate}>
        <div className="field grow">
          <label htmlFor="client-name">New client (name only is OK)</label>
          <input
            id="client-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Client name"
            required
            maxLength={200}
          />
        </div>
        <button className="btn" type="submit" disabled={pending || !name.trim()}>
          {pending ? "Saving…" : "Save client"}
        </button>
      </form>

      <div className="toolbar">
        <input
          className="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search clients"
          aria-label="Search clients"
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
      ) : clients.length === 0 ? (
        <p className="empty">No clients yet.</p>
      ) : (
        <ul className="list">
          {clients.map((c) => (
            <li key={c.id} className="list-row">
              <div>
                <Link href={`/app/clients/${c.id}`} className="list-title">
                  {c.name}
                </Link>
                <p className="muted small">
                  {[c.phone, c.email, c.address, `${c.activeJobCount} active jobs`]
                    .filter(Boolean)
                    .join(" · ")}
                  {c.archivedAt ? " · archived" : ""}
                </p>
              </div>
              <Link className="btn secondary small" href={`/app/clients/${c.id}`}>
                Open
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
