"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { enumerateDateRange, isDateString } from "@/lib/scheduling";

type WorkerOpt = { id: string; name: string };

type Props = {
  jobId: string;
  workers: WorkerOpt[];
  onCreated: () => void;
};

export function VisitScheduler({ jobId, workers, onCreated }: Props) {
  const today = new Date().toISOString().slice(0, 10);
  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState(today);
  const [selectedDays, setSelectedDays] = useState<string[]>([today]);
  const [allDay, setAllDay] = useState(true);
  const [startTime, setStartTime] = useState("08:00");
  const [endTime, setEndTime] = useState("16:00");
  const [notes, setNotes] = useState("");
  const [workerIds, setWorkerIds] = useState<string[]>([]);
  const [copyJobWorkers, setCopyJobWorkers] = useState(false);
  const [overrideReason, setOverrideReason] = useState("");
  const [conflictMsg, setConflictMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const rangeDays = useMemo(() => {
    if (!isDateString(startDate) || !isDateString(endDate)) return [];
    return enumerateDateRange(startDate, endDate);
  }, [startDate, endDate]);

  useEffect(() => {
    // Default-select every day in the range; owner must uncheck days to skip
    // (including weekends — never auto-skipped).
    setSelectedDays([...rangeDays]);
  }, [rangeDays]);

  function toggleDay(day: string) {
    setSelectedDays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day].sort(),
    );
  }

  function toggleWorker(id: string) {
    setWorkerIds((prev) =>
      prev.includes(id) ? prev.filter((w) => w !== id) : [...prev, id],
    );
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    setConflictMsg(null);

    const payload: Record<string, unknown> = {
      startDate,
      endDate,
      selectedDays,
      allDay,
      notes: notes || null,
      copyJobWorkers,
      workerIds,
    };
    if (!allDay) {
      payload.startTime = startTime;
      payload.endTime = endTime;
    }
    if (overrideReason.trim()) {
      payload.conflictOverrideReason = overrideReason.trim();
    }

    const res = await fetch(`/api/jobs/${jobId}/visits`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => ({}));
    setPending(false);

    if (res.status === 409 && data.requiresOverride) {
      setConflictMsg(data.message || "Overlapping timed assignment");
      return;
    }
    if (!res.ok) {
      setError(data.error || "Could not schedule visits");
      return;
    }
    setOverrideReason("");
    setConflictMsg(null);
    setNotes("");
    onCreated();
  }

  const weekday = (d: string) => {
    const [y, m, day] = d.split("-").map(Number);
    return new Date(Date.UTC(y, m - 1, day)).toLocaleDateString("en-US", {
      weekday: "short",
      timeZone: "UTC",
    });
  };

  return (
    <form className="visit-scheduler" onSubmit={onSubmit}>
      <h3>Schedule visits</h3>
      <p className="muted small">
        Multi-day ranges create one visit per selected day. Weekends are never
        skipped automatically — uncheck any day you do not want.
      </p>

      {error ? <p className="error">{error}</p> : null}
      {conflictMsg ? (
        <div className="warn-inline stack-sm">
          <p>{conflictMsg}</p>
          <div className="field">
            <label htmlFor="override">Override reason (required to save)</label>
            <input
              id="override"
              value={overrideReason}
              onChange={(e) => setOverrideReason(e.target.value)}
              placeholder="e.g. Same crew covering two nearby sites"
              required
            />
          </div>
        </div>
      ) : null}

      <div className="form-grid">
        <div className="field">
          <label htmlFor="vs-start">Start date</label>
          <input
            id="vs-start"
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            required
          />
        </div>
        <div className="field">
          <label htmlFor="vs-end">End date</label>
          <input
            id="vs-end"
            type="date"
            value={endDate}
            min={startDate}
            onChange={(e) => setEndDate(e.target.value)}
            required
          />
        </div>
      </div>

      {rangeDays.length > 0 ? (
        <fieldset className="day-picker">
          <legend>Which days?</legend>
          <div className="day-checks">
            {rangeDays.map((d) => (
              <label key={d} className="check day-check">
                <input
                  type="checkbox"
                  checked={selectedDays.includes(d)}
                  onChange={() => toggleDay(d)}
                />
                <span>
                  {weekday(d)} {d.slice(5)}
                </span>
              </label>
            ))}
          </div>
          <div className="actions">
            <button
              type="button"
              className="btn secondary small"
              onClick={() => setSelectedDays([...rangeDays])}
            >
              Select all
            </button>
            <button
              type="button"
              className="btn secondary small"
              onClick={() =>
                setSelectedDays(
                  rangeDays.filter((d) => {
                    const [y, m, day] = d.split("-").map(Number);
                    const dow = new Date(Date.UTC(y, m - 1, day)).getUTCDay();
                    return dow !== 0 && dow !== 6;
                  }),
                )
              }
            >
              Weekdays only
            </button>
            <button
              type="button"
              className="btn secondary small"
              onClick={() => setSelectedDays([])}
            >
              Clear
            </button>
          </div>
        </fieldset>
      ) : null}

      <label className="check">
        <input
          type="checkbox"
          checked={allDay}
          onChange={(e) => setAllDay(e.target.checked)}
        />
        All-day visit
      </label>

      {!allDay ? (
        <div className="form-grid">
          <div className="field">
            <label htmlFor="vs-st">Start time</label>
            <input
              id="vs-st"
              type="time"
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
              required
            />
          </div>
          <div className="field">
            <label htmlFor="vs-et">End time</label>
            <input
              id="vs-et"
              type="time"
              value={endTime}
              onChange={(e) => setEndTime(e.target.value)}
              required
            />
          </div>
        </div>
      ) : null}

      <div className="field">
        <label htmlFor="vs-notes">Visit notes</label>
        <textarea
          id="vs-notes"
          rows={2}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
      </div>

      <fieldset className="day-picker">
        <legend>Assign workers (optional)</legend>
        <label className="check">
          <input
            type="checkbox"
            checked={copyJobWorkers}
            onChange={(e) => setCopyJobWorkers(e.target.checked)}
          />
          Copy job workers onto these visits
        </label>
        <div className="day-checks">
          {workers.length === 0 ? (
            <span className="muted small">No workers on roster yet.</span>
          ) : (
            workers.map((w) => (
              <label key={w.id} className="check">
                <input
                  type="checkbox"
                  checked={workerIds.includes(w.id)}
                  onChange={() => toggleWorker(w.id)}
                />
                {w.name}
              </label>
            ))
          )}
        </div>
      </fieldset>

      <div className="actions">
        <button className="btn" type="submit" disabled={pending || !selectedDays.length}>
          {pending
            ? "Saving…"
            : `Schedule ${selectedDays.length} visit${selectedDays.length === 1 ? "" : "s"}`}
        </button>
      </div>
    </form>
  );
}
