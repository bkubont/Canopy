import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  isFutureWorkDate,
  nextDumpStatus,
  parallelStageKeys,
  projectBadgesForDay,
} from "./board";

describe("isFutureWorkDate", () => {
  it("treats today and past as non-future", () => {
    assert.equal(isFutureWorkDate("2026-10-20", "2026-10-20"), false);
    assert.equal(isFutureWorkDate("2026-10-19", "2026-10-20"), false);
  });

  it("detects future dates", () => {
    assert.equal(isFutureWorkDate("2026-10-21", "2026-10-20"), true);
  });
});

describe("projectBadgesForDay", () => {
  it("projects stage badges from valid work events", () => {
    const badges = projectBadgesForDay([
      { type: "stage_move", stageKey: "prep", status: "valid" },
      { type: "stage_start", stageKey: "cleanup", status: "valid" },
    ]);
    assert.deepEqual(
      badges.map((b) => b.key).sort(),
      ["cleanup", "prep"],
    );
  });

  it("ignores reversed events", () => {
    const badges = projectBadgesForDay([
      { type: "stage_move", stageKey: "prep", status: "reversed" },
      { type: "stage_move", stageKey: "estimate", status: "valid" },
    ]);
    assert.deepEqual(
      badges.map((b) => b.key),
      ["estimate"],
    );
  });

  it("adds brown dump badge without duplicating", () => {
    const badges = projectBadgesForDay([
      { type: "dump_depart", stageKey: "dump", status: "valid" },
      { type: "dump_return", stageKey: "dump", status: "valid" },
    ]);
    assert.equal(badges.filter((b) => b.kind === "dump").length, 1);
  });

  it("falls back to planned stage when no work events", () => {
    const badges = projectBadgesForDay([], "tree_work");
    assert.equal(badges.length, 1);
    assert.equal(badges[0].kind, "planned");
    assert.equal(badges[0].key, "tree_work");
  });

  it("does not emit planned badge when work badges exist", () => {
    const badges = projectBadgesForDay(
      [{ type: "stage_resume", stageKey: "prep", status: "valid" }],
      "tree_work",
    );
    assert.ok(!badges.some((b) => b.kind === "planned"));
  });
});

describe("parallelStageKeys", () => {
  it("lists non-board active stages", () => {
    const keys = parallelStageKeys("prep", [
      { key: "estimate", progress: "completed" },
      { key: "prep", progress: "in_progress" },
      { key: "tree_work", progress: "in_progress" },
      { key: "cleanup", progress: "not_started" },
    ]);
    assert.deepEqual(keys.sort(), ["estimate", "tree_work"]);
  });
});

describe("nextDumpStatus", () => {
  it("walks Depart → Return → Done", () => {
    assert.equal(nextDumpStatus(null), "departed");
    assert.equal(nextDumpStatus("departed"), "returned");
    assert.equal(nextDumpStatus("returned"), "done");
    assert.equal(nextDumpStatus("done"), null);
  });
});
