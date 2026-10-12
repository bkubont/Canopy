# V1.1 Step 2: shared backend and authentication upgrade

Branch: `issue-1/v1-1-backend-auth-upgrade`. This continues the foundation at
`f44c390` and includes the approved plan commit. Step 3 is **not authorized until
the owner reviews this step**. No main-branch change, merge, hosted deployment,
live Supabase operation, Hostinger change or paid provisioning was performed.

## Implemented

- Forward migrations `202610120002`–`202610120013`; the applied foundation
  migration is unchanged. Existing employees become workers, preserving active/
  revoked status. Existing projects retain legacy stage, version, references and
  history; ready/scheduled do not invent work. Notes retain timestamps and unknown
  authors; existing photos remain pending verification.
- Organization timezone validation, account profiles, named crews and crew
  memberships; direct project/phase/visit assignments plus project/visit/task crew
  assignments. Composite organization foreign keys prevent cross-company links.
- Owner/admin/crew-lead/worker permissions, enforced through RLS, grants and
  protected RPCs. Field users cannot read raw client private/contact records or
  administrative team emails. A safe assigned-job/client-name projection is used.
  Profiles expose display identity only to self/shared organization; edits are self-only.
- Workers can record actual work and add notes on assigned jobs, and complete
  tasks assigned to themselves/their crew. Crew leads can also change progress
  and complete/reopen phases on authorized jobs. Only administrators can schedule,
  manage workers/crews/assignments or perform audited note correction/deletion.
- Independent scheduling status and work progress, optimistic versions and typed
  append-only events. Card moves, scheduling changes and reopening do not become
  performed-work facts. Explicit work/completion are separately dated. Legacy
  events remain distinguishable. Revoked-user RPC writes fail closed, including
  the nullable-SQL-permission case covered by regression tests.
- A real Supabase Edge Function for invitations, membership role/access changes
  and invitation revocation. It verifies caller identity using Auth.getUser, ignores
  caller-supplied actors, validates bounded input/CORS and calls service-only SQL
  operations that recheck current permissions under an organization lock.
- Owners can administer all roles; admins cannot grant administrative privileges
  or modify owners/admins. The last active owner cannot be demoted/revoked.
  Membership creation occurs only through trusted provisioning or verified,
  recipient-bound invitation acceptance. It never trusts editable Auth metadata.
- Invitations bind recipient, role, organization, request ID, inviter and expiry.
  Delivery creates no company membership. Acceptance requires confirmed email
  and current inviter authority; it is idempotent and cannot overwrite/elevate
  existing membership. Delivery claims prevent concurrent sends for the same
  request, with a five-minute crash lease; SMTP is not an exactly-once transaction.
  Invitations expire after seven days. Expired/revoked/unverified/wrong-recipient
  acceptance is denied. Preparation is limited to 20 new requests per actor/hour.
- The cloud preview now supports owner/admin invitation and team-access controls,
  recipient acceptance, self profile edits, password-recovery request/email link/
  new password, and the existing managed login/logout. Sessions remain in memory,
  with SDK refresh; reload normally requires signing in again. Public signup and
  anonymous login remain disabled. Reset responses do not expose account existence.
- Private `canopy-photos` bucket, 10 MiB limit, JPEG/PNG/WebP allowlist, pending/
  verified/rejected metadata, author/checksum columns and restrictive Storage RLS.
  **Direct browser upload, download, deletion and signing are closed** until the
  later server-verified photo pipeline. This prevents accidental exposure and
  unbounded browser-signed URLs. Real Storage API denials were tested.
- Locked SDK bundling for Edge Runtime, server configuration example, updated
  local startup helpers, and tests for the foundation, seeded upgrade, fresh
  installation, all roles, crews, invitations, revocation, recovery and storage.

## Validation performed locally

| Check | Result |
| --- | --- |
| `npm test` | 7 passed; original five V1 rules retained |
| `npm run test:db` | 57 foundation + 82 upgraded-schema + 7 fresh-install assertions passed |
| `npm run test:integration` | 36 real local Auth/REST/Edge/SMTP/Storage assertions passed |
| Browser suite run by integration | 16 desktop/mobile Chromium tests passed, no skips |
| `npm audit --audit-level=high` | 0 reported dependency vulnerabilities |
| V1 application, HTML/styles, original core tests, foundation migration | Unchanged |

Successful authentication and email flows use real local Supabase services, not
mock identities. A login-error scenario intentionally intercepts a failure; a
unit guard test rejects unauthenticated/CORS/method requests before an Auth client
is used. SQL identity/Storage fixtures are explicitly separate from real service
integration. The migration runner tests a separate fresh database and a committed
legacy dataset with preserved versions/history/relationships/revocation. Storage
tests include a permissive competing policy to prove the restrictive boundary.
Integration fixtures/accounts/private object bytes are synthetic and cleaned up.

The sandbox's proxy configuration initially misrouted local Docker requests, and
its Edge Runtime did not trust the proxy for runtime npm downloads. Local Docker
proxy exemptions fixed internal routing without dropping the external egress
proxy. Bundling the lockfile-verified official SDK removed runtime dependency
fetches; TLS/image/checksum verification stayed enabled. The previously diagnosed
BusyBox container probe issue remains distinct from successful real HTTP/API tests.

## Local reproduction

Prerequisites: Node >=22, Docker, Python 3, Chromium/Playwright browser. Use the
existing checkout; do not create a worktree unless explicitly requested.

```sh
npm ci
npm test
npm run test:db
npm run supabase:start
```

Storage is now enabled. If reusing a previously running storage-disabled stack,
stop/restart **only that local Canopy stack**, preserving its database volumes;
do not reset data. Supabase Storage must initialize before migration 009. Then
apply pending migrations with `npx supabase db push --local`. No command in this
procedure should be changed to a linked/remote project.

Copy `supabase/functions/.env.example` to ignored `supabase/functions/.env` and
set the exact local origin `http://127.0.0.1:8765` and redirect
`http://127.0.0.1:8765/dist/cloud.html`. Supabase supplies the local server URL/
service key to its Edge Runtime; never put that key in frontend configuration.
In a separate persistent execution session, run:

```sh
npm run supabase:functions
```

This builds the official SDK bundle first and runs the local function. An
alternate ignored environment file can be selected with `CANOPY_EDGE_ENV_FILE`.
Then run `npm run test:integration`; it builds the cloud entry with the local
public key, creates synthetic data, exercises real services and browsers, and
cleans up its own data. The runner rejects non-loopback API URLs. Never use this
runner against a hosted project, even a development project.

For manual cloud-preview work, configure the public frontend `.env` as described
in `CLOUD_FOUNDATION.md`, run `npm run build:cloud`, and serve `dist/cloud.html`.
The unchanged V1 entry is `dist/index.html`. There is no automatic IndexedDB upload
or cloud-to-local fallback. `npm run build:edge` is also required before any later
approved function deployment; generated SDK bundles are ignored, reproducible
artifacts. No server credentials are embedded in that bundle.

In this sandbox, use `SUPABASE_HOME=/tmp/canopy-supabase-cli` if the default path
is unwritable, official slim images with `SUPABASE_USE_SLIM_IMAGES=true`, and the
documented loopback health workaround only for its diagnosed BusyBox issue.
Docker proxy `noProxy` must include `kong`, `supabase_kong_Canopy`, localhost and
127.0.0.1, while preserving the existing external proxies. Configure this through
Docker's supported client proxy settings before creating local containers; adding
NO_PROXY only to a function's virtual environment does not change runtime routing.
Do not disable TLS, replace certificate checks or change expected checksums.

## Existing-data compatibility and operational limits

Apply migrations in order, on a backed-up reviewed database. Do not rewrite the
foundation, replay applied migrations, reset populated databases or drop legacy
columns/history as a rollback. Migration 009 refuses an existing incompatible
Canopy bucket rather than making destructive or silently insecure changes.
Keep application/API access in maintenance during the complete migration batch;
do not serve traffic against partially upgraded policies or RPCs. Reopen access
only after all migrations, including the fail-closed helper upgrade, are verified.
Legacy `stage` is retained as evidence, not the authoritative new state. The
compatibility `change_project_stage` endpoint delegates to separate operations;
callers must read `schedule_status`/`work_progress`. Historical `work` events count
as actual work; ambiguous legacy `phase` and move events are not relabeled as
performed work. Organization timezone defaults to UTC pending owner confirmation.

Administration uses the current database role at every operation. Deactivating a
membership removes reads/writes on subsequent requests even with an existing JWT.
Logout revokes the refresh session; already issued access JWTs can remain valid
until provider expiry, so membership revocation is the business-data boundary.
Previously downloaded data cannot be remotely erased.

An invitation send and SQL state are not one transaction. A crash after SMTP
delivery can leave a pending claimed invitation; wait for the five-minute lease
and inspect status before retrying. Provider failure marks a request failed;
use the explicit new-request control after correcting SMTP/configuration. Failed
delivery may leave an Auth account with no organization membership; trusted
operators should reconcile it, not blindly delete user accounts. Admin requests
and invitation preparation/acceptance/revocation are retained in account audit.

The bootstrap provisioning SQL is a trusted operator escape hatch for initial
owner setup, not a browser endpoint; database administrators remain trusted.
Auth user deletion/organization deletion is not a retention workflow: referenced
membership/history/records are intentionally protected. Use deactivation instead.

## Incomplete by design; not part of Step 2

- Step 3's shared planner/service layer and full client/project/worker/crew/visit
  editing forms; calendar/Kanban integration and reliable automatic refresh/conflict
  UI. Backend role operations exist, but the preview is not the full shared planner.
- Scheduling conflict warnings, day-specific crew UX and complete audit triggers
  for assignment/visit editing belong to the later scheduling stage. This step
  provides the tables, scoped policies, statuses, RPCs and typed event vocabulary.
- Server byte verification, authenticated photo proxy/download with bounded
  signing, upload/preview/quotas/deletion and actual crew photo controls remain
  the photo stage. Private Storage is intentionally closed to direct browser use.
- Validated IndexedDB dry-run/import/deduplication/rollback and import batch models
  remain the migration stage. No local records were moved or removed.
- Hosted Auth/SMTP/redirect/password/rate-limit configuration, backups/PITR and
  restore drill, security headers, physical iPhone/Safari checks and deployment
  acceptance remain release preparation. V1's known unsafe-import/photo issue is
  unchanged in its local pilot. No production readiness claim is made.

Before eventual production hosting, fix the pilot's unsafe import/photo rendering
or keep that unpatched pilot on a separate origin from real authenticated cloud
sessions. Serving both built entries on one development origin is not a production
isolation guarantee.

## Owner intervention

No hosted credentials are needed to review the commits or rerun local tests.
Before proceeding, review Step 2 and authorize Step 3 if desired. For eventual
hosted preparation, identify/create the approved Supabase project and region,
approve budget/SMTP/backups, confirm organization timezone/initial owner accounts,
and securely configure exact HTTPS origin/redirects and server-only settings.
Keep the email/password provider enabled while disabling **public signup**.
Do not provide secrets in chat or copy service keys into frontend settings.
Confirm the new Hostinger Business site/document root/HTTPS/header configuration
and perform physical phone tests later; this work must not alter the live site.
