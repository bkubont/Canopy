import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  deriveSchedulingState,
  enumerateDateRange,
  findTimedConflicts,
  resolveSelectedDays,
} from "./scheduling";

describe("enumerateDateRange", () => {
  it("lists inclusive days", () => {
    assert.deepEqual(enumerateDateRange("2026-10-15", "2026-10-17"), [
      "2026-10-15",
      "2026-10-16",
      "2026-10-17",
    ]);
  });

  it("includes weekends in the range (no silent skip)", () => {
    const days = enumerateDateRange("2026-10-16", "2026-10-19");
    assert.ok(days.includes("2026-10-17")); // Saturday
    assert.ok(days.includes("2026-10-18")); // Sunday
  });
});

describe("resolveSelectedDays", () => {
  it("requires explicit selection", () => {
    const r = resolveSelectedDays("2026-10-15", "2026-10-17", []);
    assert.equal(r.ok, false);
  });

  it("rejects days outside the range", () => {
    const r = resolveSelectedDays("2026-10-15", "2026-10-16", [
      "2026-10-15",
      "2026-10-20",
    ]);
    assert.equal(r.ok, false);
  });

  it("accepts a weekday-only subset chosen by the owner", () => {
    const r = resolveSelectedDays("2026-10-16", "2026-10-19", [
      "2026-10-16",
      "2026-10-19",
    ]);
    assert.equal(r.ok, true);
    if (r.ok) assert.deepEqual(r.days, ["2026-10-16", "2026-10-19"]);
  });
});

describe("deriveSchedulingState", () => {
  it("derives unscheduled / ready / scheduled / canceled", () => {
    assert.equal(
      deriveSchedulingState({
        canceledAt: null,
        readyForScheduling: false,
        visits: [],
      }),
      "unscheduled",
    );
    assert.equal(
      deriveSchedulingState({
        canceledAt: null,
        readyForScheduling: true,
        visits: [],
      }),
      "ready",
    );
    assert.equal(
      deriveSchedulingState({
        canceledAt: null,
        readyForScheduling: true,
        visits: [{ status: "scheduled" }],
      }),
      "scheduled",
    );
    assert.equal(
      deriveSchedulingState({
        canceledAt: null,
        readyForScheduling: false,
        visits: [{ status: "canceled" }],
      }),
      "unscheduled",
    );
    assert.equal(
      deriveSchedulingState({
        canceledAt: new Date(),
        readyForScheduling: true,
        visits: [{ status: "scheduled" }],
      }),
      "canceled",
    );
  });
});

describe("findTimedConflicts", () => {
  it("flags overlapping timed slots for the same worker across jobs", () => {
    const hits = findTimedConflicts([
      {
        workerId: "w1",
        jobId: "j1",
        visitId: "v1",
        workDate: "2026-10-15",
        startTime: "08:00",
        endTime: "12:00",
      },
      {
        workerId: "w1",
        jobId: "j2",
        visitId: "v2",
        workDate: "2026-10-15",
        startTime: "11:00",
        endTime: "15:00",
      },
    ]);
    assert.equal(hits.length, 1);
  });

  it("ignores same-job overlaps and non-overlapping times", () => {
    assert.equal(
      findTimedConflicts([
        {
          workerId: "w1",
          jobId: "j1",
          visitId: "v1",
          workDate: "2026-10-15",
          startTime: "08:00",
          endTime: "10:00",
        },
        {
          workerId: "w1",
          jobId: "j1",
          visitId: "v2",
          workDate: "2026-10-15",
          startTime: "09:00",
          endTime: "11:00",
        },
      ]).length,
      0,
    );
    assert.equal(
      findTimedConflicts([
        {
          workerId: "w1",
          jobId: "j1",
          visitId: "v1",
          workDate: "2026-10-15",
          startTime: "08:00",
          endTime: "10:00",
        },
        {
          workerId: "w1",
          jobId: "j2",
          visitId: "v2",
          workDate: "2026-10-15",
          startTime: "10:00",
          endTime: "12:00",
        },
      ]).length,
      0,
    );
  });
});
