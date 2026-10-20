"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  addDays,
  monthGridOrigin,
  startOfMonth,
  weekOrigin,
} from "@/lib/scheduling";

type Worker = { id: string; name: string };

type Badge = {
  key: string;
  kind: "stage" | "dump" | "planned";
  label: string;
};

type Card = {
  visitId: string;
  jobId: string;
  jobTitle: string;
  clientName: string;
  workDate: string;
  allDay: boolean;
  startTime: string | null;
  endTime: string | null;
  workers: Worker[];
  unassigned: boolean;
  href: string;
  status?: string;
  badges?: Badge[];
  canStart?: boolean;
  canResume?: boolean;
  resumeStageKey?: string | null;
  startStageKey?: string | null;
};

type View = "month" | "week" | "day" | "agenda";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function newRequestId(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `req_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

export function CalendarPanel() {
  const [view, setView] = useState<View>("month");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [cards, setCards] = useState<Card[]>([]);
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [filterWorker, setFilterWorker] = useState("");
  const [unassignedOnly, setUnassignedOnly] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [jobVersions, setJobVersions] = useState<Record<string, number>>({});
  const [pendingVisit, setPendingVisit] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const params = new URLSearchParams({ view, date });
    if (unassignedOnly) params.set("unassigned", "1");
    else if (filterWorker) params.set("workerId", filterWorker);

    const [calRes, workersRes] = await Promise.all([
      fetch(`/api/calendar?${params}`),
      fetch("/api/workers?archived=0"),
    ]);
    const calData = await calRes.json().catch(() => ({}));
    const workersData = await workersRes.json().catch(() => ({}));
    if (!calRes.ok) setError(calData.error || "Failed to load calendar");
    else setCards(calData.cards || []);
    if (workersRes.ok) setWorkers(workersData.workers || []);
    setLoading(false);
  }, [view, date, filterWorker, unassignedOnly]);

  useEffect(() => {
    void load();
  }, [load]);

  const byDate = useMemo(() => {
    const map = new Map<string, Card[]>();
    for (const c of cards) {
      const list = map.get(c.workDate) || [];
      list.push(c);
      map.set(c.workDate, list);
    }
    return map;
  }, [cards]);

  async function ensureVersion(jobId: string): Promise<number | null> {
    if (jobVersions[jobId] !== undefined) return jobVersions[jobId];
    const res = await fetch(`/api/jobs/${jobId}`);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return null;
    const version = data.job?.version as number;
    setJobVersions((prev) => ({ ...prev, [jobId]: version }));
    return version;
  }

  async function startOrResume(card: Card, action: "start" | "resume") {
    const stageKey =
      action === "resume" ? card.resumeStageKey : card.startStageKey;
    if (!stageKey) return;
    setPendingVisit(card.visitId);
    setError(null);
    const version = await ensureVersion(card.jobId);
    if (version == null) {
      setError("Could not load job version");
      setPendingVisit(null);
      return;
    }
    const res = await fetch(`/api/jobs/${card.jobId}/stages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        stageKey,
        action,
        workDate: card.workDate,
        visitId: card.visitId,
        requestId: newRequestId(),
        expectedVersion: version,
      }),
    });
    const data = await res.json().catch(() => ({}));
    setPendingVisit(null);
    if (!res.ok) {
      setError(data.error || "Action failed");
      setJobVersions((prev) => {
        const next = { ...prev };
        delete next[card.jobId];
        return next;
      });
      await load();
      return;
    }
    if (typeof data.version === "number") {
      setJobVersions((prev) => ({ ...prev, [card.jobId]: data.version }));
    }
    await load();
  }

  function shift(delta: number) {
    if (view === "month") {
      const [y, m] = date.split("-").map(Number);
      const next = new Date(Date.UTC(y, m - 1 + delta, 1));
      setDate(
        `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, "0")}-01`,
      );
    } else if (view === "week") {
      setDate(addDays(date, delta * 7));
    } else {
      setDate(addDays(date, delta));
    }
  }

  const title = useMemo(() => {
    const [y, m, d] = date.split("-").map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d));
    if (view === "month") {
      return dt.toLocaleDateString("en-US", {
        month: "long",
        year: "numeric",
        timeZone: "UTC",
      });
    }
    if (view === "week") {
      const start = weekOrigin(date);
      return `Week of ${start}`;
    }
    return dt.toLocaleDateString("en-US", {
      weekday: "long",
      month: "short",
      day: "numeric",
      year: "numeric",
      timeZone: "UTC",
    });
  }, [date, view]);

  const cardProps = {
    pendingVisit,
    onStart: (c: Card) => void startOrResume(c, "start"),
    onResume: (c: Card) => void startOrResume(c, "resume"),
  };

  return (
    <div className="stack">
      <div className="toolbar cal-toolbar">
        <div className="actions">
          {(["month", "week", "day", "agenda"] as View[]).map((v) => (
            <button
              key={v}
              type="button"
              className={view === v ? "btn small" : "btn secondary small"}
              onClick={() => setView(v)}
            >
              {v[0].toUpperCase() + v.slice(1)}
            </button>
          ))}
        </div>
        <div className="actions">
          <button
            type="button"
            className="btn secondary small"
            onClick={() => shift(-1)}
          >
            ‹
          </button>
          <button
            type="button"
            className="btn secondary small"
            onClick={() => setDate(new Date().toISOString().slice(0, 10))}
          >
            Today
          </button>
          <button
            type="button"
            className="btn secondary small"
            onClick={() => shift(1)}
          >
            ›
          </button>
        </div>
      </div>

      <h2 className="cal-heading">{title}</h2>

      <div className="toolbar">
        <div className="field" style={{ marginBottom: 0, minWidth: 180 }}>
          <label htmlFor="cal-worker">Worker schedule</label>
          <select
            id="cal-worker"
            value={unassignedOnly ? "__unassigned__" : filterWorker}
            onChange={(e) => {
              const v = e.target.value;
              if (v === "__unassigned__") {
                setUnassignedOnly(true);
                setFilterWorker("");
              } else {
                setUnassignedOnly(false);
                setFilterWorker(v);
              }
            }}
          >
            <option value="">Everyone</option>
            <option value="__unassigned__">Unassigned</option>
            {workers.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
              </option>
            ))}
          </select>
        </div>
        <Link className="btn secondary small" href="/app/workers">
          Manage roster
        </Link>
      </div>

      <p className="muted small">
        Badges are projections of dated activity (and dump runs in brown). Start
        / Resume on a day card logs work without moving the board column.
      </p>

      {error ? <p className="error">{error}</p> : null}
      {loading ? <p className="muted">Loading…</p> : null}

      {!loading && view === "month" ? (
        <MonthGrid date={date} byDate={byDate} {...cardProps} />
      ) : null}
      {!loading && view === "week" ? (
        <WeekGrid date={date} byDate={byDate} {...cardProps} />
      ) : null}
      {!loading && view === "day" ? (
        <DayList date={date} cards={byDate.get(date) || []} {...cardProps} />
      ) : null}
      {!loading && view === "agenda" ? (
        <AgendaList cards={cards} {...cardProps} />
      ) : null}
    </div>
  );
}

type CardHandlers = {
  pendingVisit: string | null;
  onStart: (card: Card) => void;
  onResume: (card: Card) => void;
};

function CardButton({
  card,
  pendingVisit,
  onStart,
  onResume,
  compact,
}: {
  card: Card;
  compact?: boolean;
} & CardHandlers) {
  const time = card.allDay
    ? "All day"
    : `${card.startTime || "?"}–${card.endTime || "?"}`;
  return (
    <div className={`cal-card-wrap${card.status === "unplanned" ? " unplanned" : ""}`}>
      <Link href={card.href} className="cal-card">
        <strong>{card.jobTitle}</strong>
        <span className="muted small">
          {card.clientName} · {time}
          {card.status === "unplanned" ? " · Unplanned" : ""}
          {card.unassigned
            ? " · Unassigned"
            : card.workers.length
              ? ` · ${card.workers.map((w) => w.name).join(", ")}`
              : ""}
        </span>
        {card.badges && card.badges.length > 0 ? (
          <div className="badge-row">
            {card.badges.map((b) => (
              <span
                key={`${b.kind}-${b.key}`}
                className={`stage-badge ${b.kind === "dump" ? "dump-badge" : b.kind === "planned" ? "planned-badge" : `stage-${b.key}`}`}
              >
                {b.label}
              </span>
            ))}
          </div>
        ) : null}
      </Link>
      {!compact ? (
        <div className="cal-card-actions">
          {card.canResume ? (
            <button
              type="button"
              className="btn secondary small"
              disabled={pendingVisit === card.visitId}
              onClick={() => onResume(card)}
            >
              Resume
            </button>
          ) : null}
          {card.canStart ? (
            <button
              type="button"
              className="btn secondary small"
              disabled={pendingVisit === card.visitId}
              onClick={() => onStart(card)}
            >
              Start
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function MonthGrid({
  date,
  byDate,
  ...handlers
}: {
  date: string;
  byDate: Map<string, Card[]>;
} & CardHandlers) {
  const origin = monthGridOrigin(startOfMonth(date));
  const month = date.slice(0, 7);
  const cells = Array.from({ length: 42 }, (_, i) => addDays(origin, i));

  return (
    <div className="cal-month">
      {WEEKDAYS.map((d) => (
        <div key={d} className="cal-weekday">
          {d}
        </div>
      ))}
      {cells.map((d) => {
        const inMonth = d.startsWith(month);
        const list = byDate.get(d) || [];
        return (
          <div
            key={d}
            className={`cal-day${inMonth ? "" : " other"}${d === new Date().toISOString().slice(0, 10) ? " today" : ""}`}
          >
            <div className="cal-daynum">{Number(d.slice(8))}</div>
            <div className="cal-day-cards">
              {list.slice(0, 4).map((c) => (
                <CardButton
                  key={c.visitId}
                  card={c}
                  compact
                  {...handlers}
                />
              ))}
              {list.length > 4 ? (
                <span className="muted small">+{list.length - 4} more</span>
              ) : null}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function WeekGrid({
  date,
  byDate,
  ...handlers
}: {
  date: string;
  byDate: Map<string, Card[]>;
} & CardHandlers) {
  const origin = weekOrigin(date);
  const days = Array.from({ length: 7 }, (_, i) => addDays(origin, i));
  return (
    <div className="cal-week">
      {days.map((d, i) => (
        <div key={d} className="cal-week-col">
          <div className="cal-weekday">
            {WEEKDAYS[i]} {d.slice(5)}
          </div>
          <div className="cal-day-cards">
            {(byDate.get(d) || []).map((c) => (
              <CardButton key={c.visitId} card={c} {...handlers} />
            ))}
            {(byDate.get(d) || []).length === 0 ? (
              <span className="muted small">—</span>
            ) : null}
          </div>
        </div>
      ))}
    </div>
  );
}

function DayList({
  date,
  cards,
  ...handlers
}: { date: string; cards: Card[] } & CardHandlers) {
  return (
    <section className="section-block" style={{ borderTop: "none" }}>
      <h3 className="cal-heading">{date}</h3>
      {cards.length === 0 ? (
        <p className="empty">Nothing scheduled.</p>
      ) : (
        <div className="stack-sm">
          {cards.map((c) => (
            <CardButton key={c.visitId} card={c} {...handlers} />
          ))}
        </div>
      )}
    </section>
  );
}

function AgendaList({ cards, ...handlers }: { cards: Card[] } & CardHandlers) {
  if (!cards.length) return <p className="empty">Nothing in the next 28 days.</p>;
  let last = "";
  return (
    <div className="stack-sm">
      {cards.map((c) => {
        const showDate = c.workDate !== last;
        last = c.workDate;
        return (
          <div key={c.visitId}>
            {showDate ? (
              <h3 className="cal-agenda-date">{c.workDate}</h3>
            ) : null}
            <CardButton card={c} {...handlers} />
          </div>
        );
      })}
    </div>
  );
}
