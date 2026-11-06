# Canopy Phase 4 — Acceptance results (§12)

**Ran:** 2026-11-06 against live `https://canopy.squarethisup.com`  
**Auth:** Owner-only (`owner@canopy.local`)  
**Method:** API acceptance harness for all §12 scenarios; desktop UI smoke for login / board Move to / Settings export (see notes). iPhone paths not fully executed in this agent environment — essential daily API paths covered.

## Verdict

**PASS** — 24/24 §12 scenarios after correcting two harness false-fails (trailing-space in result parsing). Live product behavior matched Phase 3 + export expectations. Phase 4 code polish (optimistic kanban restore, CSV notes/attachments sections, docs) is in a draft PR and is **not deployed** pending owner overwrite confirmation.

## Scenario matrix

| ID | Scenario | Result | Evidence |
| --- | --- | --- | --- |
| 12.0a | Health / DB | PASS | `GET /api/health` → `database:ok` |
| 12.0b | Unauthed API rejected | PASS | `GET /api/board` → 401 |
| 12.0c | Owner login | PASS | Session cookie + `/api/auth/me` |
| 12.1 | Minimum input (name-only client) + full client | PASS | Both `201` |
| 12.2 | Client isolation | PASS | Separate jobs under A vs B |
| 12.3 | Multi-day schedule | PASS | Visits on three selected days only |
| 12.4a | Worker roster | PASS | Two workers created |
| 12.4b | Parallel assignments | PASS | Job-level + Prep stage-level |
| 12.5 | Kanban sync + unplanned visit | PASS | Today → Prep; board + visit for work date |
| 12.6 | No silent stage complete | PASS | Prep progress `in_progress`, not `completed` |
| 12.7 | Idempotent retry | PASS | Same `requestId` double-POST, single apply |
| 12.8 | Concurrency | PASS | Stale `expectedVersion` → `409 VERSION_CONFLICT` |
| 12.9 | Explicit stage complete | PASS | Prep `completed`; board stayed Tree Work |
| 12.10 | History retention | PASS | Activity events on job detail |
| 12.11 | Future planned-only | PASS | Board unchanged; `plannedStageKey=cleanup` |
| 12.12 | Dump runs | PASS | Depart → `departed`; kanban unchanged |
| 12.13 | Dump calendar badge | PASS | Day calendar payload includes dump |
| 12.14 | Notes / isolation | PASS | Note on A absent from B |
| 12.15 | Corrections / reversals | PASS | Reverse valid `stage_move` → 200 |
| 12.16 | Archive | PASS | `PATCH { archive: true }` sets `archivedAt` |
| 12.17a | CSV export core | PASS | clients/jobs/visits/assignments/tasks/events |
| 12.17b | JSON notes + attachment manifest | PASS | Present on live |
| 12.18 | Conflicts + override | PASS | Timed overlap → 409; override reason → 201 |
| 12.19 | Test cleanup | PASS | `TEST —` clients/jobs permanently deleted |

Raw machine log: `/tmp/phase4-acceptance-results.json` (harness initially marked 12.11/12.12 FAIL due to a print bug; recheck confirmed PASS).

## Desktop UI (essential)

| Path | Result |
| --- | --- |
| `/login` loads; unauthed `/app` redirects | PASS (HTTP) |
| Board columns Ready → Complete | PASS (API `/api/board`) |
| Settings Export JSON/CSV links | Present in app Settings panel |
| Failed-save kanban restore + note draft preservation | Implemented in Phase 4 PR (optimistic UI); live still uses reload-on-error until deploy |

## Known limitations

1. **Owner-only auth** — workers are roster names; no worker login (Section 14 deferred).
2. **Photo binaries** not embedded in export — ID manifest only; restore MySQL + `canopy-uploads` together.
3. **CSV notes/attachments sections** land with Phase 4 deploy; live CSV already has core entity sections; JSON already has notes + manifest.
4. **iPhone** camera/photo library and narrow-viewport gesture paths were not run on a physical device in this pass — re-check on owner phone after deploy.
5. **Jose CompressionStream** Edge Runtime warning may still appear in Hostinger logs (non-blocking).
6. **Pilot import** adds records; does not replace. Prefer `TEST —` prefixes for drills.

## Backup / restore (owner)

See `HOSTINGER_DEPLOYMENT.md` in the repo and [user-guide.md](./user-guide.md):

- Weekly Settings → Export JSON (and CSV).
- Enable Hostinger plan backups when available.
- Restore MySQL + `canopy-uploads` from the same backup point.
- Spot-check `/api/health`, login, one note photo after restore.

## Test records

Acceptance used `TEST —` prefixed clients/jobs/workers and permanently deleted them. Live client list had no leftover `TEST` names after cleanup. Owner should keep the same naming convention for any future drills.
