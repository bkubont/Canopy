"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

type StageChip = {
  key: string;
  label: string;
  progress: string;
  progressLabel: string;
};

type Card = {
  id: string;
  title: string;
  version: number;
  boardColumn: string;
  clientName: string;
  clientId: string;
  schedulingState: string;
  stages: StageChip[];
  parallelStages: StageChip[];
  openDumpRuns: number;
  nextVisitDate: string | null;
  href: string;
};

type Column = {
  key: string;
  label: string;
  cards: Card[];
};

function newRequestId(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `req_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

function todayLocal(): string {
  return new Date().toISOString().slice(0, 10);
}

export function BoardPanel() {
  const [columns, setColumns] = useState<Column[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [workDate, setWorkDate] = useState(todayLocal);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [moveFor, setMoveFor] = useState<Card | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const res = await fetch("/api/board");
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(data.error || "Failed to load board");
      setLoading(false);
      return;
    }
    setColumns(data.columns || []);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function moveCard(card: Card, destination: string) {
    setPendingId(card.id);
    setError(null);
    const res = await fetch(`/api/jobs/${card.id}/kanban`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        destination,
        workDate,
        requestId: newRequestId(),
        expectedVersion: card.version,
      }),
    });
    const data = await res.json().catch(() => ({}));
    setPendingId(null);
    setMoveFor(null);
    if (!res.ok) {
      setError(
        data.code === "VERSION_CONFLICT"
          ? "Someone else updated this job — reload and try again."
          : data.error || "Move failed",
      );
      await load();
      return;
    }
    await load();
  }

  return (
    <div className="stack board-wrap">
      <div className="toolbar">
        <div className="field" style={{ marginBottom: 0 }}>
          <label htmlFor="board-work-date">Work date for moves</label>
          <input
            id="board-work-date"
            type="date"
            value={workDate}
            onChange={(e) => setWorkDate(e.target.value)}
          />
        </div>
        <p className="muted small" style={{ margin: 0, maxWidth: 360 }}>
          Past/today moves update the primary column and log badges. Future dates
          only set planned stage on that visit. Stages never auto-complete when
          a card leaves a column.
        </p>
      </div>

      {error ? <p className="error">{error}</p> : null}
      {loading ? <p className="muted">Loading board…</p> : null}

      <div className="kanban">
        {columns.map((col) => (
          <section
            key={col.key}
            className={`kanban-lane lane-${col.key}`}
            data-column={col.key}
          >
            <header className="kanban-lane-head">
              <h3>{col.label}</h3>
              <span className="muted small">{col.cards.length}</span>
            </header>
            <div className="kanban-lane-body">
              {col.cards.length === 0 ? (
                <p className="muted small empty-lane">Empty</p>
              ) : (
                col.cards.map((card) => (
                  <article key={card.id} className="kanban-card">
                    <Link href={card.href} className="kanban-card-title">
                      {card.title}
                    </Link>
                    <p className="muted small">{card.clientName}</p>
                    {card.parallelStages.length > 0 ? (
                      <div className="badge-row">
                        {card.parallelStages.map((s) => (
                          <span
                            key={s.key}
                            className={`stage-badge stage-${s.key}`}
                            title={`Parallel: ${s.progressLabel}`}
                          >
                            {s.label}
                          </span>
                        ))}
                      </div>
                    ) : null}
                    {card.openDumpRuns > 0 ? (
                      <span className="stage-badge dump-badge">
                        {card.openDumpRuns} dump
                      </span>
                    ) : null}
                    <div className="toolbar kanban-card-actions">
                      <Link
                        className="btn secondary small"
                        href={card.href}
                      >
                        Open
                      </Link>
                      <button
                        type="button"
                        className="btn small"
                        disabled={pendingId === card.id}
                        onClick={() => setMoveFor(card)}
                      >
                        Move to
                      </button>
                    </div>
                  </article>
                ))
              )}
            </div>
          </section>
        ))}
      </div>

      {moveFor ? (
        <div
          className="dialog-back"
          role="presentation"
          onClick={() => setMoveFor(null)}
        >
          <div
            className="dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="move-title"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="move-title">Move “{moveFor.title}”</h2>
            <p className="muted small">
              Work date: {workDate}. Current column: {moveFor.boardColumn}.
            </p>
            <div className="move-grid">
              {columns.map((col) => (
                <button
                  key={col.key}
                  type="button"
                  className="btn secondary"
                  disabled={
                    pendingId === moveFor.id || col.key === moveFor.boardColumn
                  }
                  onClick={() => void moveCard(moveFor, col.key)}
                >
                  {col.label}
                </button>
              ))}
            </div>
            <div className="actions">
              <button
                type="button"
                className="btn secondary"
                onClick={() => setMoveFor(null)}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
