# Canopy V1.1 audit and implementation plan

## Review gate and scope

This completes **Step 1 only** of the owner's V1.1 instructions. Those instructions
state: **“Do not begin Step 2 until I review the plan.”** No new backend, application,
database migration, permission policy, or deployment changes are included in this
audit branch. The previously implemented foundation is audited as existing code;
its presence does not authorize the next stage under these new instructions.

Branch: `issue-1/v1-1-audit-plan`, based on `f44c390` from
`issue-1/auth-database-foundation`. The original V1 baseline is `bc7ca59`.
Supabase was approved in the earlier conversation. Hostinger Business with
PHP/MySQL is available, but this proposal does not require that backend runtime.

## Repository audit

Reviewed the tracked application, styles/HTML, cloud client, dependency manifest
and lockfile, SQL migration/policies/provisioning, build/start/test helpers, CI,
automated tests, README, deployment guide and acceptance/review documentation.
No AGENTS.md was found in the checkout. No existing user changes were present.

### Existing application and data

`index.html`, `styles.css` and `app.js` implement a responsive planner with an
overview, clients, projects, worker directory, calendar, Kanban, project detail
tabs, phase assignments/completion/work logging, visits, tasks/dump runs,
timestamped notes, compressed photos and JSON backup/restore.

IndexedDB database `canopy-v1`, version 1, has a `data` object store. Its
`workspace` entry holds a schema-1 object with arrays `clients`, `workers`,
`projects`, `visits`, `tasks`, `notes`, `photos` and `history`. Entire workspace
objects are rewritten after edits. Records use UUIDs and references such as
`clientId`, `projectId` and `workerIds`; phases are nested in projects. Photos
contain data URLs. History keeps both a business `date` and timestamp `time`.
There is no hosted persistence in the V1 entry point.

The additive `cloud/` preview uses the official Supabase SDK for real login,
invitation password setup, logout, organization selection, shared client creation
and permitted project/client reads. Tokens stay in memory. It is not the existing
planner's shared-storage adapter; the calendar, Kanban and detail workflows still
use IndexedDB. Only explicit refresh is implemented in the preview.

The existing SQL migration defines organizations, memberships, clients, workers,
projects, job/phase/visit/task assignments, phases, visits, tasks (including dump
runs), notes, photo metadata and immutable events. It has composite organization
foreign keys, RLS, assignment-based employee reads, protected event writes and
versioned stage transitions. Public signup is disabled in local configuration;
hosted configuration has not been applied. Storage and realtime are disabled.

Dependencies are locked: `@supabase/supabase-js` 2.117.3; development tools
`esbuild` 0.28.2, `@playwright/test` 1.64.0 and Supabase CLI 2.120.0.
Node >=22 is required. Python serves static development files; Docker runs
PostgreSQL/Supabase checks. No application server runs on Hostinger in this design.

### Retain versus modify

| Feature | Retain | Required modification |
| --- | --- | --- |
| Existing navigation, forms and responsive layout | Existing interface and workflow concepts | Add login/role states and a shared-data layer incrementally; keep the local pilot available during transition. |
| Client → many projects | UUID/reference relationships and independent job scope | Normalize into organization-scoped rows; avoid exposing administrative client notes/contact details to field users. |
| Project/phase/visit assignments | Optional independent assignments | Add crew assignments and server-enforced permissions; preserve distinct assignments for different visit days. |
| Multi-day calendar | Inclusive visit dates, linked projects, mobile scrolling | Separate planned visits from actual work; display status/progress for the relevant business date. |
| Kanban | Drag/drop and mobile Move action | Separate scheduling status from work progress; movement alone must not imply performed work. |
| Phase completion | Independent completion/reopen operation | Authorize by role/project; preserve dated completion and reopen events. |
| Tasks and dump runs | Multiple independent entries per project | Keep `tasks.kind='dump'` with optional date/destination/assignees/details and completion; no uniqueness constraint preventing repeat runs. |
| Notes/photos | Timestamped project attachments and previews | Protected storage, safe rendering, server content/size/quota checks, ownership and deletion rules. |
| History | Original dates/messages and chronological display | Typed append-only server events; corrections append rather than rewrite history. |
| Backup/restore | Export and explicit import workflow | Validated cloud migration with dry-run, deduplication, photo staging and recoverable failure handling. |

### Bugs, security concerns and V1.1 gaps

1. **Scheduling and progress are conflated.** V1's `STAGES` combines ready,
   scheduled and work phases. Postponed/cancelled are absent. The foundation
   reproduces this combined `projects.stage`; a forward migration must split it.
2. **Kanban movement can appear as performed work.** `statusFor()` includes
   `stage` history alongside `work` and `phase`. A card move therefore produces a
   phase badge without actual work. The existing core test asserts that behavior;
   it must be deliberately revised when the new semantics are implemented.
3. **Reopening can also appear as progress.** Both completion and reopen use a
   generic `phase` event. The new event model must carry an explicit action and
   distinguish completed/reopened from actual work.
4. **No crew model or crew-lead role.** Existing membership roles are owner,
   admin and read-only employee. User profiles, crew membership and authorized
   worker/crew-lead updates need additive models and policies.
5. **Field-user privacy needs refinement.** Existing employee policies allow
   assigned clients' entire rows. RLS alone does not hide columns; protect raw
   administrative client records and expose a safe field-job projection for crew
   users, with tests preventing access to client private notes/unrelated contacts.
6. **Unsafe imports/photo rendering.** Restore checks array presence only, then
   accepts arbitrary records/fields. Photo `data` is interpolated unescaped into
   an HTML attribute. Crafted backups can inject markup/script or corrupt state.
   Validate import structures and image bytes, render safely, and disallow SVG/
   arbitrary URLs. Do not import untrusted backups into the unchanged pilot.
7. **Failed saves leave changed memory.** Edits mutate `db` before persistence;
   failure does not roll it back. Some async action/drop errors escape handling.
   Shared mutations must commit server-side before updating visible state, or
   explicitly revert optimistic changes and show actionable failures.
8. **Whole-workspace saves are not concurrent-safe.** Avoid using a cloud JSON
   blob as a replacement. Use per-record version checks/transactions and refresh.
9. **Date handling has gaps.** `dateRange()` silently stops at 365 days. Visit
   times lack organization timezone rules, overlap detection or explicit crew
   coordination. Current SQL validates date order/length but not crew conflicts.
10. **Audit coverage is incomplete.** Foundation events cover creation, stage,
    phase and work; visit changes, assignments, notes/tasks and attachment actions
    need typed audit events. They must not count as performed work.
11. **Access operations and recovery are incomplete.** Trusted provisioning is
    documented, but there is no owner-facing invitation/role-management flow or
    reset-email request UI. Privileged Auth operations require server-only code.
12. **Production operations are unverified.** No hosted project, private bucket,
    provider SMTP, backup/restore drill or physical Safari/iPhone validation exists.
    The current CI runs unit/SQL/V1 browser checks, not the complete real-auth
    cloud integration suite. Passing current tests is not V1.1 completion.

### Baseline checks rerun for this audit

| Command | Result |
| --- | --- |
| `npm test` | 6 passed, 0 failed, 0 skipped |
| `npm run test:db` | 57 real PostgreSQL authorization/business assertions passed |
| `npm run test:integration` | 17 real local Supabase Auth/REST assertions passed |
| Browser suite inside integration runner | 12 desktop/mobile Chromium tests passed, 0 skipped |

The login-failure browser scenario intentionally intercepts an error response;
successful auth/role/invitation tests use real local Supabase. Local PostgreSQL's
identity fixture is distinguished from the real Auth integration. Tests use
synthetic data; the integration runner cleans up its own records/accounts.
Mobile coverage is iPhone-sized Chromium, not physical iPhone/Safari. The full
manual acceptance checklist remains unexecuted. No existing automated failures
were found; the semantic/security gaps above remain despite passing baseline tests.

## Proposed architecture

Keep the existing planner interface and progressively replace its storage and
mutation boundaries. Use Supabase Auth, PostgreSQL/PostgREST with RLS and private
Storage. Add small Supabase Edge Functions only where privileged account
administration or authoritative image verification requires a server. They must
authenticate the caller and independently check organization/role; possession of
a user token alone must never grant admin capability. Keep service credentials
only in server secret configuration.

Use a repository/service layer that converts SQL rows to the existing view data
shape, so rendering can be retained while mutations become explicit RPC/record
operations. Local pilot and cloud mode must be visibly distinguished. Cloud mode
must not silently fall back to local saves when offline or an API call fails.
Preserve IndexedDB; do not upload or delete it on login, logout or migration.

Reuse in-memory sessions initially; clearly communicate that reload requires
sign-in. Add provider-supported password recovery and invitation completion;
reconsider persistence only with an explicit session/threat-model review. Hosted
public signup stays disabled. Self-registration must never create a membership.

For synchronization, start with reliable scoped polling (proposed 15 seconds),
refresh on focus/reconnection and refresh after confirmed mutations. Refresh only
authorized records. Ignore stale responses across logout/organization changes;
preserve unsaved forms and present version conflicts instead of overwriting.
Realtime can be added later if polling does not meet operational needs.

### Hostinger compatibility and costs

Hostinger Business serves the reviewed static build over HTTPS from a new empty
site/subdomain. Node >=22 is a build-machine requirement only. PHP/MySQL, Docker,
a persistent Node server and PostgreSQL are not required on Hostinger. Confirm
the exact site/document root, HTTPS and available security-header configuration
before any deployment proposal; do not modify the live site.

Supabase is separate hosting. Evaluation may fit a free tier; production database,
storage/egress, Edge Functions, email delivery and backup/PITR requirements may
require recurring paid services. No new subscription or account is provisioned
by this plan. Obtain owner approval before selecting a paid plan; verify current
provider pricing/limits for expected usage rather than quoting stale prices.

## Database and permission design

Use **forward, versioned migrations** from the existing foundation. Do not rewrite
an applied migration, reset a populated database or drop legacy data to make the
new model fit. Validate the upgrade on both a fresh database and seeded prior
schema, including constraints, policies, historical data and rollback procedures.

| Model | Proposed purpose/change |
| --- | --- |
| organizations | Existing business boundary; add an IANA timezone for business dates and visit times. |
| user_profiles | New account display identity, with self/shared-organization visibility; never expose Auth internals or all users' emails. |
| memberships | Roles `owner`, `admin`, `crew_lead`, `worker`; active/revoked state. Migrate legacy `employee` to `worker` explicitly. |
| crews, crew_memberships | New named crews and linked workers/lead; organization-scoped references. |
| clients, projects | Existing relationships; split `schedule_status` and `work_progress`; retain legacy stage for traceable conversion until verified. |
| project_assignments, project_crew_assignments | Direct worker assignments plus optional crew responsibility. |
| visits, visit_assignments, visit_crew_assignments | Inclusive date ranges, planned times, worker/crew resource assignments; separate visits when crews differ by date. |
| job_phases, phase_assignments | Optional workers; completion independent from current progress and scheduling. |
| tasks, task_assignments | General tasks and repeatable dump activities; optional date/destination/details/assignees; completion and actor audit. |
| notes | Authorized project notes with creator and immutable creation time. |
| photos | Private object metadata, creator, checksum, preview, size/type, validation state and retention/deletion state. |
| events | Immutable typed activity; organization/project, actor, business date, UTC recorded timestamp, action/payload, optional source/import IDs. |
| import_batches, import_items | Source checksum/IDs, validation report, idempotency mapping, completion/failure state and rollback evidence. |

Index organization/parent IDs and worker/crew/date access paths. Use composite
organization foreign keys for every cross-record relationship. Prevent changing
record identity/organization through ordinary updates. Apply RLS and least-
privilege grants to tables, views, RPCs and Storage objects. Validate both old and
new row state; do not derive permissions from user-editable Auth metadata.

| Capability | Owner/admin | Crew lead | Worker |
| --- | --- | --- | --- |
| All organization jobs/schedules and private client administration | Yes | Assigned jobs/crew schedule projection only | Assigned jobs/schedule projection only |
| Worker/crew management, invitations, role changes, scheduling/rescheduling/assignments | Yes | No, initially | No |
| Record actual work, add notes/photos | Own organization | Authorized assigned jobs | Authorized assigned jobs |
| Complete assigned tasks/dump runs | Yes | Authorized assigned jobs | Tasks assigned to self or assigned crew |
| Change Kanban work progress; complete/reopen a phase | Yes | Authorized assigned jobs | No, initially; workers use explicit work updates |
| Import/export company backup and administrative settings | Yes | No | No |

These are proposed least-privilege defaults for review, not existing capabilities.
Crew visibility requires an authorized crew assignment and membership; it must
not expose all company schedules. Reassignment/revocation removes access on the
next server request. Record creators cannot choose another user as the author or
overwrite another user's notes. Corrections/deletions need explicit permissions
and audit rather than unrestricted employee update/delete grants.

## Scheduling and progress semantics

Scheduling status: `ready`, `scheduled`, `postponed`, `cancelled`.
Work progress: no recorded progress initially, then `estimate`, `prep`, `tree`,
`cleanup`, `complete`. The empty initial value must not imply an estimate occurred.
Kanban lanes reflect work progress; scheduling status is a separate badge/control.
Retain ready/scheduled workflow visibility through scheduling filters, rather than
mixing those states back into progress. Completion does not erase past visits.

Separate event actions: `progress_changed`, `work_recorded`, `phase_completed`,
`phase_reopened`, `assignment_changed`, `visit_scheduled`, `visit_rescheduled`,
`schedule_status_changed`, `task_completed`, and appropriate note/photo actions.
Only actual work and explicit phase-completion events contribute to dated actual-
progress badges. A move or assignment remains visible in history but does not
prove work. Reopen events show reopening without masquerading as work performed.

October 12 Prep work, October 13 Tree Work and October 14 Cleanup remain distinct
dated facts when the current card moves again. No future visit automatically
inherits a prior day's progress. Backdated work preserves its business date and
records the actual submission timestamp/actor separately. Organization timezone,
local date validation and daylight-saving transitions need dedicated tests.

Schedule separate visits for different crews/daily workers. Flag worker/crew time
overlaps when both times are known; show potential conflicts for all-day/unknown-
time visits. Prefer clear warnings over rigid rejection of legitimate split-day
work. Keep optional phase assignments and unlimited separate dump-run entries.
Postponed/cancelled visits remain historically traceable and must not display as
active scheduled work or automatically clear completion history.

## Safe migration from IndexedDB

1. Export/retain an independent V1 backup. Read the existing database without
   altering it; require an authorized owner's explicit target organization.
2. Parse a bounded schema-1 backup; strictly validate allowed fields, types, UUIDs,
   unique IDs, references, stage/phase enums, dates/times, text lengths and counts.
   Reject dangerous/unsupported shapes and report record-level errors. Require
   confirmation of organization timezone before resolving ambiguous legacy dates.
3. Produce a dry-run preview of clients/jobs/visits/tasks/assignments/history and
   separate photo bytes. Report missing references, duplicates and uncertainties;
   never silently discard records or overwrite existing cloud rows.
4. Map source IDs to new organization-scoped IDs, and maintain batch/source
   checksum mappings. Repeat imports must be idempotent; ambiguous duplicates
   require explicit handling, not name-based merging.
5. Preserve raw legacy stage/history values as import evidence. Convert ready/
   scheduled into scheduling status and phase/complete into progress without
   inventing actual work. A legacy `stage` event remains a card-move event, not
   proof of work. Preserve original dates/messages and retain ambiguous legacy
   completion/reopen records with their original labels rather than guessing.
6. Decode/verify images separately, rejecting arbitrary URLs/SVG/HTML. Stage
   private objects under a batch-scoped path; authoritative byte/type/size checks
   and organization quota enforcement precede publishing photo metadata. Keep
   source records for failed images and report retryable failures explicitly.
7. Commit relational records, mappings and imported events transactionally through
   a narrowly authorized import operation. Uploaded objects and SQL are not one
   transaction: keep durable batch state, reconcile failures and remove orphaned
   staged objects. Do not mark an incomplete import successful.
8. Provide a batch report and verified counts/reference/date checks. Retain the
   local source. Rollback before batch finalization removes only unreferenced
   staged objects and uncommitted rows. For finalized history use audited reversal/
   archive operations or tested restore to a separate database; do not bypass
   append-only controls or wipe records modified after import.

## Development stages after owner review

1. **Step 1 — audit/plan (this branch):** documentation and baseline validation
   only. Stop here pending the owner's review.
2. **Shared backend/auth upgrade:** forward migrations for profiles, roles, crews,
   status separation and event types; RLS/RPC/Storage boundaries; trusted admin
   invitations and password recovery. Test cross-role/org/crew isolation on fresh
   and upgraded databases before integrating planner writes.
3. **Preserved planner on shared records:** add the data service layer and port
   existing client/project/worker/visit/forms and mobile views incrementally.
   Confirm server saves, two-device refresh, conflicts and fail-closed offline
   behavior; retain V1 until parity is verified.
4. **Crew scheduling and actual progress:** integrate calendar/Kanban separation,
   crew/day assignments, dated work/completion/reopen actions, repeat dump runs
   and conflict warnings. Revise legacy tests intentionally and add regressions
   proving moves/assignments/reschedules never generate false performed-work badges.
5. **Private attachments and migration:** verified uploads/downloads/previews,
   quotas and audited deletion; bounded dry-run/import/deduplication and failure/
   rollback workflows; preserve original IndexedDB data.
6. **Release preparation:** expand CI to real Auth/REST/browser coverage, perform
   multi-user and physical phone testing, backup/restore drill, hosted Auth/SMTP/
   redirect/header review, README/Hostinger instructions and owner action checklist.
   Propose production deployment only after verification; never deploy or modify
   the live Hostinger website under these instructions. Merging still requires
   the owner's approval from the earlier request.

Use small descriptive commits and reviewable changes. No new worktree is needed;
the existing cloud workspace is isolated. Run relevant tests after each major
change; do not disable current assertions merely to get a green run. Keep secrets
and customer data out of source, logs, test fixtures and commits.

## V1.1 verification and owner actions

Required tests include real Auth login/logout/invitation/recovery, signup and role-
escalation denial; cross-user/org/crew isolation; private file guessing/expired URL/
type/size/quota attacks; owner client/job creation and scheduling; authorized crew
updates; two independent browser sessions/devices refreshing the same records;
concurrent updates; timezone/DST/multi-day scheduling; optional phase assignments;
Kanban versus performed-work history; migration validation, duplicate retries,
partial photo failures and recovery; backward-schema upgrades and restore drills.
Use narrow/mobile Chromium plus physical iPhone/Safari for touch, camera/library,
viewport scrolling and session behavior. Include all relevant tabs, editor
cancellation, notes/photos, task/dump completion and backup scenarios from V1.

Owner intervention, when needed after this plan review:

- Approve/refine the proposed role matrix and scheduling/progress UI semantics.
- Create or identify the approved Supabase project/region and hosting budget.
- Configure credentials through secure settings; only project URL/public key go
  to the frontend. Never send secret values in chat.
- Confirm organization timezone, initial owner/admin accounts and crew roster.
- Approve/configure SMTP, exact HTTPS invitation/recovery redirects, password/rate-
  limit settings, private buckets, storage quotas and backup retention/costs.
- Identify a safe new Hostinger site/document root and HTTPS/header controls for
  eventual review; the existing live website must remain untouched.
- Supply a backed-up legacy dataset through a secure migration workflow and
  perform physical phone acceptance tests; no production records in GitHub.

V1.1 is complete only when owner scheduling, separate-device real logins, assigned
crew views/updates, cross-device calendar/Kanban synchronization, original dated
history, server/file permissions and migration/restore behavior are verified and
documentation is complete. Current foundation test success establishes a baseline,
not production readiness or completion of this definition of done.
