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
          Owner export of clients and jobs (JSON includes note IDs and an
          attachment manifest). Photo binaries stay on disk — see backup notes
          below.
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
            Use Export JSON regularly for client/job records. Attachment binaries
            are listed by ID in the export manifest but not embedded.
          </li>
          <li>
            Prefer Hostinger hPanel backups before major changes. Automated
            schedule: enable Hostinger account backups if available on the plan;
            otherwise export weekly from Settings.
          </li>
          <li>
            Restore: import clients/jobs via Export JSON (manual merge) or
            restore MySQL +{" "}
            <code>canopy-uploads</code> from Hostinger backup together.
          </li>
        </ul>
      </section>
    </div>
  );
}
