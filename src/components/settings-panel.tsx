"use client";

import { FormEvent, useState } from "react";

export function SettingsPanel() {
  const [importResult, setImportResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onImport(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const fileInput = form.elements.namedItem("file") as HTMLInputElement;
    const file = fileInput.files?.[0];
    if (!file) {
      setError("Choose a V1 JSON backup file");
      return;
    }
    if (
      !window.confirm(
        "Import will ADD clients/jobs/notes from the pilot JSON into this business (does not replace existing). Continue?",
      )
    ) {
      return;
    }
    setPending(true);
    setError(null);
    setImportResult(null);
    const body = new FormData();
    body.set("file", file);
    const res = await fetch("/api/import/pilot", { method: "POST", body });
    const data = await res.json().catch(() => ({}));
    setPending(false);
    if (!res.ok) {
      setError(data.error || "Import failed");
      return;
    }
    const r = data.result;
    setImportResult(
      [
        `Clients: ${r.clientsCreated}`,
        `Jobs: ${r.jobsCreated}`,
        `Notes: ${r.notesCreated}`,
        `Photos imported: ${r.photosImported}`,
        `Photos skipped: ${r.photosSkipped}`,
        r.skipped?.length ? `Notes: ${r.skipped.join("; ")}` : null,
      ]
        .filter(Boolean)
        .join(" · "),
    );
    fileInput.value = "";
  }

  return (
    <div className="stack">
      <section className="section-block">
        <h2>Export</h2>
        <p className="muted small">
          Owner export of clients, jobs, visits, assignments, tasks, activity
          events, notes, and an attachments ID manifest (CSV and JSON). Photo
          binaries stay on disk — see backup notes below.
        </p>
        <div className="actions">
          <a className="btn" href="/api/export?format=json">
            Download JSON
          </a>
          <a className="btn secondary" href="/api/export?format=csv">
            Download CSV
          </a>
        </div>
      </section>

      <section className="section-block">
        <h2>Test records</h2>
        <p className="muted small">
          Keep acceptance and demo data clearly labeled (e.g. client names
          starting with <code>TEST —</code>). Archive or permanently delete them
          from Clients / Jobs when done so production folders stay clean. Do not
          mix real customer PII into test jobs.
        </p>
      </section>

      <section className="section-block">
        <h2>Import V1 IndexedDB JSON</h2>
        <p className="muted small">
          Maps clients, projects→jobs, notes, and photos where fields align.
          Visits, tasks, and workers are skipped until later phases.
        </p>
        <form onSubmit={onImport} className="stack-sm">
          <input
            name="file"
            type="file"
            accept="application/json,.json"
            required
          />
          <button className="btn" type="submit" disabled={pending}>
            {pending ? "Importing…" : "Import pilot backup"}
          </button>
        </form>
        {error ? <p className="error">{error}</p> : null}
        {importResult ? <p className="pill-block">{importResult}</p> : null}
      </section>

      <section className="section-block">
        <h2>Backup notes</h2>
        <ul className="doc-list">
          <li>
            Hostinger plan backups cover MySQL. Photo files live under a private{" "}
            <code>canopy-uploads</code> directory on the account (outside public
            URLs) and persist across Node.js redeploys when the path is under the
            domain root.
          </li>
          <li>
            Export JSON/CSV weekly (and before deploys) for clients, jobs,
            visits, assignments, tasks, events, notes, and the attachment ID
            manifest. Photo binaries are not embedded.
          </li>
          <li>
            Prefer Hostinger hPanel backups before major changes. Enable plan
            backups when available; otherwise rely on weekly Settings export.
          </li>
          <li>
            Restore MySQL + <code>canopy-uploads</code> from the same Hostinger
            backup point. Then verify <code>/api/health</code>, sign-in, and one
            note photo. Full procedure:{" "}
            <code>HOSTINGER_DEPLOYMENT.md</code>.
          </li>
        </ul>
      </section>
    </div>
  );
}
