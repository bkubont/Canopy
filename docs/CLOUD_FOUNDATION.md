# Authentication and shared-database foundation (Stage 2)

This is a reviewable, opt-in first stage for Issue #1, **not the complete cloud
planner or a deployment**. V1's `index.html`, `app.js`, `styles.css`, and IndexedDB
database are unchanged. `cloud.html` is a separate entry point in the built output.
It supports login/logout, provider invitation/recovery password setup,
organization selection, client creation for owner/admin, permitted client/project
reads, explicit refresh, and error/loading states. It never imports V1 data.

## Runtime requirements and costs

Hostinger Business can serve the built static files over HTTPS. This architecture
does not use its PHP/MySQL runtime. No Node process is required on Hostinger;
Node >=22 is needed only on the build/development machine. Confirm a new, empty
site's document root and HTTPS before any approved deployment. Git integration
is optional. The built JavaScript calls an approved Supabase project's HTTPS API.

Supabase provides Auth and PostgreSQL; private Storage is deferred to Stage 3.
No hosted project or paid plan was created. Evaluate free-tier limits separately;
production backups/PITR, SMTP, storage/egress and paid subscriptions need explicit
owner approval. Local Supabase uses Docker on a development machine, not shared
Hostinger hosting. Pinning packages/lockfile and bundling the official SDK avoids
loading executable JavaScript from a third-party CDN at runtime.

## Local setup

```sh
cd /path/to/Canopy
npm ci
npm test
npm run test:db
npm run supabase:start
```

Docker is required for database/integration checks. The isolated `test:db` runner
starts a disposable PostgreSQL 17 container with **no network or published ports**,
applies the migration to a minimal Supabase identity fixture, runs real RLS and
business-rule assertions, and removes only its own container. It does not test
Auth token signatures. `supabase:start` runs the real local Auth/PostgREST/API/DB
stack, disables public sign-up, and applies migrations to the local project.
It is not a hosted deployment. Do not run `db reset` against user databases.

In sandboxed machines, set `SUPABASE_HOME=/tmp/canopy-supabase-cli` and npm's
`--cache /tmp/canopy-npm-cache` if the default config/cache locations are unwritable.
If the default image registry is blocked, Supabase supports
`SUPABASE_INTERNAL_IMAGE_REGISTRY=docker.io` for its official Docker Hub images.
On machines with limited disk, `SUPABASE_USE_SLIM_IMAGES=true` selects the CLI's
official digest-pinned slim images. In the cloud sandbox, BusyBox's container
health probe sent loopback requests through the proxy even with `NO_PROXY` set;
the direct Auth HTTP endpoint succeeded. For that diagnosed case only, set
`CANOPY_LOCAL_PROXY_HEALTH_WORKAROUND=1`: startup tolerates the faulty container
probe but still requires an actual successful Auth HTTP response, followed by
the real `test:integration` checks. Ordinary development machines should leave
the workaround unset. Container probe status and application checks are separate.
Do not bypass TLS or checksums. Local services are for development only; keep them
on a private development machine/network and stop them with `npx supabase stop`
when finished. Do not expose local API keys or database ports publicly.

Copy `.env.example` to ignored `.env`, then supply the local project's URL and
**public publishable key** (or legacy `anon` key) from `npx supabase status`.
Use secure settings for hosted values. Never put a `service_role` JWT,
`sb_secret_...` key, database URL/password, or customer data in frontend settings.
The build rejects missing/placeholder and privileged key types.

```sh
npm run build:cloud
python3 -m http.server 8765 --bind 127.0.0.1
```

The built cloud entry is `dist/cloud.html`; the untouched pilot is `dist/index.html`.
Sessions stay in memory; reloading normally requires signing in again. Supabase
handles access-token refresh and email-link parsing. Provider account recovery
and invitations use this cloud entry, followed by **Set or change password**.
No password reset email UI or self-signup UI is included yet. No email link or
token is written to local storage by this app. Configure short session lifetimes
and provider rate limits for production. Sign-out revokes the refresh session;
already issued JWTs can remain valid until expiry, while deactivating a membership
immediately removes company data access through RLS.

Run browser checks with `npm run test:browser` after building. Install Chromium
through your system package manager and set `CHROMIUM_PATH` to its executable,
or adapt the Playwright launcher to its managed Chromium installation. Desktop
and iPhone-sized Chromium coverage does not substitute for physical Safari/iPhone
camera, photo-library, storage-quota, or touch acceptance checks.

`npm run test:integration` uses the running **local** Supabase instance, creates
random synthetic users/organizations, exercises real Auth and REST requests, and
builds/runs the authenticated browser smoke test. Its local admin key is read in
the test process only, never printed or bundled. It refuses non-loopback API
URLs. It cleans up only its own sample data/users. No hosted credentials are
needed and no real client information should be used.

## Hosted project configuration (later, after review)

1. Create/approve a separate Supabase project, hosting region, costs and backups.
2. Apply `supabase/migrations/202610120001_foundation.sql` to an **empty** reviewed
   project through Supabase's migration workflow. The migration is transactional
   and intentionally not idempotent; migration history tracks successful application.
   Do not run the test identity bootstrap on Supabase.
3. Disable public signup and anonymous users in hosted Auth settings. Local
   `config.toml` does not automatically configure hosted Auth. Require confirmed
   email, password policy, rate limits and appropriate SMTP. Allow only the exact
   HTTPS cloud-entry site/redirect URLs (no production wildcard redirects).
4. Invite or explicitly create confirmed users through trusted Supabase Auth
   administration. No user-supplied metadata determines organization or role.
5. A trusted owner/operator creates the organization through SQL and provisions
   memberships using `supabase/ops/provision-membership.sql` with its UUID,
   the Auth user's UUID, and `owner`, `admin`, or `employee`. Provisioning requires
   privileged database access, not the browser key. Browser owners/admins cannot
   create memberships in this first stage. For employee project access, create
   a worker linked to that membership and the appropriate job/phase/visit assignment.
6. Revoke access by setting `memberships.active=false`; optionally revoke the
   user's Auth sessions as well. Do not delete a referenced worker/member to revoke
   access. Database references and history are retained.
7. Build with public configuration for the approved project. Review the final
   static output and server headers. Set `Content-Security-Policy: frame-ancestors
   'none'` and HSTS at the HTTPS host; frame restrictions cannot be enforced by
   the app's CSP meta tag. The bundle permits API connections only to that origin.
8. Complete hosted auth/security review, full planner/migration/photo stages,
   restore testing and mobile acceptance **before** using customer data.
9. Deploy/merge only after explicit owner approval. Upload only reviewed static
   output; never `.env`, SQL/admin scripts, `.git`, or `node_modules`.

## Database behavior and remaining stages

Every application table has RLS. Organization membership is checked on every
request. Owners/admins may edit their organization's records; employees initially
have read-only access to assigned projects (job, phase, or visit) and their clients,
tasks, notes and dated events. They cannot enumerate coworkers' directory records,
memberships, unassigned projects, or another company. Tables/foreign keys enforce
organization consistency even if the browser changes request bodies.

Project stage writes are allowed only through `change_project_stage`, with an
expected version and explicit business date. The RPC locks the record, changes
the stage/version and appends an event atomically. Rejected or repeated transitions
append nothing. Phase completion is independent of stage; its trigger appends
completion/reopen events. `record_phase_work` records past dated activity. Worker
assignments never create phase-progress events. Ordinary project/phase creation
and completion use the database's current date; the complete planner must supply
organization time-zone/business-date behavior before production.

Events cannot be updated/deleted through the API; a trigger also prohibits those
mutations by an ordinary trusted operator. Database superusers can change schema
and disable triggers; append-only history is not a claim of tamper-proof storage
against the database administrator. Record/project deletion is intentionally
restricted by immutable history and foreign keys; retention/archive workflows
are deferred. Photo metadata exists but browser writes and actual file storage
are disabled until authenticated upload/download/validation policies are reviewed.

Future stages still need the shared planner UI, worker write permissions, private
photos/quotas/deletion, explicit validated V1 migration with preview/rollback,
paginated search (the preview caps lists at 100), reliable automatic refresh,
conflict UX, immutable business audit for other mutations, private backups and a
restore drill. Reverting this static preview leaves V1 intact. Do not drop a
populated cloud database as a rollback; use a tested backup and forward migration.
