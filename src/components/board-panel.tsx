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

function moveCardOptimistically(
  cols: Column[],
  cardId: string,
  destination: string,
): Column[] {
  let moved: Card | null = null;
  const without = cols.map((col) => {
    const idx = col.cards.findIndex((c) => c.id === cardId);
    if (idx < 0) return col;
    moved = { ...col.cards[idx], boardColumn: destination };
    return { ...col, cards: col.cards.filter((c) => c.id !== cardId) };
  });
  if (!moved) return cols;
  return without.map((col) =>
    col.key === destination
      ? { ...col, cards: [moved as Card, ...col.cards] }
      : col,
  );
}

export function BoardPanel() {
  const [columns, setColumns] = useState<Column[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [workDate, setWorkDate] = useState(todayLocal);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [failedId, setFailedId] = useState<string | null>(null);
  const [moveFor, setMoveFor] = useState<Card | null>(null);

  const load = useCallback(async (opts?: { quiet?: boolean }) => {
    if (!opts?.quiet) setLoading(true);
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
    const priorColumns = columns;
    setPendingId(card.id);
    setFailedId(null);
    setError(null);
    setMoveFor(null);
    // Optimistic: show the card in the destination lane immediately.
    setColumns((cols) => moveCardOptimistically(cols, card.id, destination));

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
    if (!res.ok) {
      // Restore prior kanban position; clear pending; mark failed briefly.
      setColumns(priorColumns);
      setFailedId(card.id);
      setError(
        data.code === "VERSION_CONFLICT"
          ? "Someone else updated this job — board restored. Reload and try again."
          : data.error || "Move failed — card restored to its previous column.",
      );
      // Reconcile with server in case another tab changed the board.
      await load({ quiet: true });
      window.setTimeout(() => setFailedId((id) => (id === card.id ? null : id)), 4000);
      return;
    }
    setFailedId(null);
    await load({ quiet: true });
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
                  <article
                    key={card.id}
                    className={`kanban-card${pendingId === card.id ? " is-pending" : ""}${failedId === card.id ? " is-failed" : ""}`}
                    aria-busy={pendingId === card.id}
                  >
                    <Link href={card.href} className="kanban-card-title">
                      {card.title}
                    </Link>
                    <p className="muted small">{card.clientName}</p>
                    {pendingId === card.id ? (
                      <p className="muted small">Saving move…</p>
                    ) : null}
                    {failedId === card.id ? (
                      <p className="error small">Move failed — restored</p>
                    ) : null}
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
