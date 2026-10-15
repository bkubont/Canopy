"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import {
  isSupportedImageFile,
  prepareImageForUpload,
  type PreparedImage,
} from "@/lib/heic-client";

type Props = {
  jobId: string;
  onSaved: () => void;
};

type Progress = { loaded: number; total: number; percent: number };

const DRAFT_KEY = (jobId: string) => `canopy-note-draft:${jobId}`;

export function NoteComposer({ jobId, onSaved }: Props) {
  const [text, setText] = useState("");
  const [previews, setPreviews] = useState<PreparedImage[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [progress, setProgress] = useState<Progress | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    try {
      const saved = sessionStorage.getItem(DRAFT_KEY(jobId));
      if (saved) setText(saved);
    } catch {
      // ignore
    }
  }, [jobId]);

  useEffect(() => {
    try {
      if (text.trim()) sessionStorage.setItem(DRAFT_KEY(jobId), text);
      else sessionStorage.removeItem(DRAFT_KEY(jobId));
    } catch {
      // ignore
    }
  }, [jobId, text]);

  useEffect(() => {
    return () => {
      for (const p of previews) URL.revokeObjectURL(p.previewUrl);
    };
  }, [previews]);

  async function onPickFiles(files: FileList | null) {
    if (!files?.length) return;
    setError(null);
    const next: PreparedImage[] = [];
    for (const file of Array.from(files)) {
      if (!isSupportedImageFile(file)) {
        setError(`${file.name}: use JPEG, PNG, or HEIC`);
        continue;
      }
      try {
        next.push(await prepareImageForUpload(file));
      } catch {
        setError(`${file.name}: could not prepare HEIC preview — try again`);
      }
    }
    setPreviews((prev) => [...prev, ...next]);
    if (inputRef.current) inputRef.current.value = "";
  }

  function removePreview(index: number) {
    setPreviews((prev) => {
      const copy = [...prev];
      const [removed] = copy.splice(index, 1);
      if (removed) URL.revokeObjectURL(removed.previewUrl);
      return copy;
    });
  }

  function uploadWithProgress(form: FormData): Promise<{
    ok: boolean;
    status: number;
    data: Record<string, unknown>;
  }> {
    return new Promise((resolve) => {
      const xhr = new XMLHttpRequest();
      xhr.open("POST", `/api/jobs/${jobId}/notes`);
      xhr.upload.onprogress = (ev) => {
        if (!ev.lengthComputable) return;
        setProgress({
          loaded: ev.loaded,
          total: ev.total,
          percent: Math.round((ev.loaded / ev.total) * 100),
        });
      };
      xhr.onload = () => {
        let data: Record<string, unknown> = {};
        try {
          data = JSON.parse(xhr.responseText) as Record<string, unknown>;
        } catch {
          data = {};
        }
        resolve({
          ok: xhr.status >= 200 && xhr.status < 300,
          status: xhr.status,
          data,
        });
      };
      xhr.onerror = () =>
        resolve({ ok: false, status: 0, data: { error: "Network error" } });
      xhr.send(form);
    });
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!text.trim() && previews.length === 0) {
      setError("Add text and/or photos");
      return;
    }
    setPending(true);
    setError(null);
    setHint(null);
    setProgress({ loaded: 0, total: 1, percent: 0 });

    const form = new FormData();
    if (text.trim()) form.set("text", text.trim());
    for (const p of previews) form.append("photos", p.file);

    const result = await uploadWithProgress(form);
    setPending(false);
    setProgress(null);

    const failed = (result.data.failed as Array<{ filename: string }> | undefined) || [];
    if (!result.ok && failed.length === 0) {
      setError(
        (result.data.error as string) ||
          "Save failed — your draft text is still here. Retry.",
      );
      return;
    }

    if (failed.length > 0) {
      setHint(
        (result.data.draftHint as string) ||
          "Some photos failed. Draft text is preserved; remove failed previews or retry.",
      );
      // Keep draft text; drop successful uploads from previews by clearing all
      // only when fully successful. On partial, keep previews for retry.
      onSaved();
      return;
    }

    for (const p of previews) URL.revokeObjectURL(p.previewUrl);
    setPreviews([]);
    setText("");
    try {
      sessionStorage.removeItem(DRAFT_KEY(jobId));
    } catch {
      // ignore
    }
    onSaved();
  }

  return (
    <form className="note-composer" onSubmit={onSubmit}>
      <div className="field">
        <label htmlFor="note-text">Note</label>
        <textarea
          id="note-text"
          rows={3}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Field note (optional if attaching photos)"
        />
      </div>

      <div className="field">
        <label htmlFor="note-photos">Photos (JPEG, PNG, HEIC)</label>
        <input
          id="note-photos"
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/heic,image/heif,.jpg,.jpeg,.png,.heic,.heif"
          multiple
          onChange={(e) => void onPickFiles(e.target.files)}
        />
      </div>

      {previews.length > 0 ? (
        <div className="thumb-row">
          {previews.map((p, i) => (
            <div key={p.previewUrl} className="thumb-item">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={p.previewUrl} alt={p.file.name} />
              <button
                type="button"
                className="btn secondary small"
                onClick={() => removePreview(i)}
              >
                Remove
              </button>
              {p.convertedFromHeic ? (
                <span className="muted small">HEIC → JPEG</span>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}

      {progress ? (
        <div className="progress" role="progressbar" aria-valuenow={progress.percent}>
          <div className="progress-bar" style={{ width: `${progress.percent}%` }} />
          <span className="muted small">Uploading {progress.percent}%</span>
        </div>
      ) : null}

      {error ? <p className="error">{error}</p> : null}
      {hint ? <p className="warn-inline">{hint}</p> : null}

      <div className="actions">
        <button className="btn" type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save note"}
        </button>
        {error || hint ? (
          <button
            className="btn secondary"
            type="submit"
            disabled={pending}
          >
            Retry upload
          </button>
        ) : null}
      </div>
    </form>
  );
}
