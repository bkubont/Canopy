# Issue #1: V1 audit and staged production foundation

Baseline: `bc7ca59`, reviewed against [Issue #1](https://github.com/bkubont/Canopy/issues/1).

## Existing behavior

V1 is three static files. It stores one workspace object in IndexedDB and saves
the entire object after edits. There is no network persistence, identity,
organization boundary, employee access control, or backend. Client/project,
multi-day visits, independent phase completion, assignments, notes, photos,
dump runs, and dated history are present.

The original `npm test` passes all five tests. They execute app internals in a VM, deliberately
leave IndexedDB startup unresolved, and stub the DOM. They cover empty state,
inclusive date ranges, stage/history preservation, assignments not counting as
progress, and text escaping. They do not test storage, rendered workflows,
photo handling, backup imports, sessions, authorization, or cross-device writes.

## Findings

| Priority | Finding | Consequence / follow-up |
| --- | --- | --- |
| Blocker for real shared data | No identity or server-enforced authorization | Add managed auth and database row-level security before sharing records. |
| High | Restore checks only that eight fields are arrays; arbitrary fields and record shapes are accepted | Stage 3 needs strict schema/reference validation, limits, dry-run, and transactional import. Never automatically upload V1 records. |
| High | Photo `data` is inserted into an HTML `src` attribute without escaping or validating its format | A crafted imported backup can inject markup/script. Validate uploads/imports and render private photos safely in Stage 3. Do not import untrusted V1 backups. |
| High | Writes mutate `db` before persistence; failure does not roll back memory | A failed write can appear successful in later screens. Cloud mutations must await server confirmation and report errors. |
| High | History is part of the replaceable backup object | V1 history is dated, but not immutable. Cloud events need protected append-only storage and transactional stage changes. |
| Medium | Entire workspace overwritten on each save, with no version | Unsuitable for concurrent devices. Use per-record mutations and compare versions on stage transitions. |
| Medium | Date range helper silently truncates at 365 days | Explicitly validate allowed date ranges instead of silently losing calendar days. |
| Medium | Errors in asynchronous actions/drop handlers can escape the UI | Cloud requests need explicit loading/error handling. |
| Gap | No automated browser/mobile coverage or authorization tests | Add real Chromium workflows and PostgreSQL RLS tests; retain the five core tests. |

Existing V1 remains the local pilot, with its original IndexedDB database name and
entry page unchanged. This first stage does not make V1 safe for production data.

## Architecture recommendation

Serve static HTML/CSS/bundled JavaScript over HTTPS from an **empty, separate
Hostinger site/subdomain**. Use Supabase's maintained Auth service, PostgreSQL with
row-level security, and (in Stage 3) private Storage. This does not require Node,
PHP, a persistent application process, Docker, or PostgreSQL on Hostinger. The
hosting plan must support uploading static files, custom domain/subdomain,
HTTPS, and the correct document root. Git deployment is optional, plan dependent;
a locally built static upload works without it. Confirm the owner's actual plan
and site before any deployment.

Supabase is an external integration, not included in Hostinger. Local development
is free. A hosted free tier may support evaluation but has quota/availability and
backup limits; production usage, backups/PITR, storage, egress, email delivery,
and a paid plan require the owner's explicit approval. No hosted project or paid
service is provisioned by this change. Self-hosting Supabase would require a VPS
with Docker and operations ownership, so it is not the default recommendation.

Authentication is handled by the official Supabase JavaScript SDK and Auth API.
The cloud client keeps sessions in memory (no login tokens in IndexedDB or local
storage). Invitations/recovery use the provider's email links; explicit account
provisioning is also supported. Disable public sign-up in Auth configuration.
Even an authenticated user has no company access until an operator provisions a
membership. Public project keys are allowed in the browser; service-role keys,
database credentials, and admin Auth operations are never shipped to Hostinger.

Database policies derive identity from `auth.uid()`, not request-supplied user IDs.
Owners/admins manage their organization; employees initially have read-only
access to projects assigned at job, phase, or visit level and the corresponding
clients. Other organizations, unassigned jobs, and membership administration are
denied. Composite organization foreign keys prevent cross-company relationships.
Employment and account membership are separate concepts: an optional worker
directory record links to a provisioned user. Phase assignment alone is not
progress. Changes of stage append immutable dated events in the same transaction.

## Reviewable stages

1. **Audit and architecture**: this document and a reproducible V1 browser baseline.
2. **Authentication/shared database foundation (this change)**: additive cloud
   entry page; managed login/logout/invitation password setup; fail-closed config;
   organization-scoped models, RLS, provisioning, versioned stage RPC; minimal
   shared client creation/listing and assigned project reads. Test actual SQL
   policies and desktop/mobile UI. Keep V1 intact; no automatic data migration.
3. **Shared planner and migration**: port project/calendar/kanban/tasks/notes UI;
   explicit worker editing permissions; photo policies, authenticated upload,
   verified content/size/quota controls; strict V1 dry-run/import with rollback;
   polling/conflict UI, private backups and tested restore.
4. **Production review**: complete integration and mobile acceptance matrix,
   provider SMTP/rate limits/redirect URLs, auth/security review, backup/restore
   drill and cost approval. Deploy only after the owner's explicit approval.

Stage 2 is deliberately not a replacement for the full V1 planner and does not
close Issue #1. No merge or deployment is authorized. Hosted-provider testing
requires an approved project/configuration; local and mocked checks must be
reported separately from that verification.
