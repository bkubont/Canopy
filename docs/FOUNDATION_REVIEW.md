# Issue #1 — first implementation stage for review

V1 stores each device's records in a disconnected browser database and has no
accounts or server authorization. This change adds a separate cloud entry point
using managed Supabase authentication and an organization-scoped PostgreSQL
schema, while preserving the local pilot and its data.

## Review order

1. [Audit and architecture](ISSUE_1_AUDIT.md): existing behavior, defects and the
   staged plan. Hostinger Business serves static HTTPS files; Supabase supplies
   authentication/database and later private storage. The owner approved Supabase;
   no paid service or hosted project has been provisioned.
2. [Database migration](../supabase/migrations/202610120001_foundation.sql):
   normalized organization/membership/client/project/worker/phase/visit/task/note/
   photo-metadata/event models; composite organization foreign keys; RLS and grants;
   immutable dated history; locked, version-checked stage RPC.
3. [Cloud client](../cloud/cloud.js): in-memory managed sessions, login/logout,
   invitation password setup, organization access, owner/admin client creation,
   assigned-only employee project reads, refresh and failures. V1 imports and
   actual file storage are deliberately disabled in this stage.
4. [Setup and provisioning](CLOUD_FOUNDATION.md): locked build, public-key checks,
   local stack, trusted account/membership provisioning, hosted prerequisites,
   costs, rollback constraints and remaining work.

## Executed validation

| Check | Result |
| --- | --- |
| Clean `npm ci` from committed lockfile | Passed |
| `npm test` | 6 passed (5 original V1 rules + configuration/key boundary test) |
| `npm run test:db` | 57 real PostgreSQL policy/business-rule assertions passed |
| `npm run test:integration` | 17 real local Supabase Auth/REST assertions passed |
| Browser suite, invoked by integration runner | 12 passed; desktop and iPhone-sized Chromium; no skips |
| `npm audit --audit-level=high` | 0 reported vulnerabilities |
| Original V1 application and core tests | Unchanged |
| Integration fixtures | Synthetic users/organizations cleaned up; local counts verified zero |

The browser checks cover V1 CRUD/scheduling/history/storage, real cloud login,
shared client creation/refresh, assigned-only employee reads, outsider denial,
invitation password setup, sign-out and no persisted login tokens. SQL/API checks
cover cross-company read/write isolation, cross-company relationship rejection,
privilege escalation denial, revocation with a live JWT, append-only events,
date validation, repeatable dump runs, independent phase completion, and stale/
concurrent stage writes.

The full local Supabase image exceeded sandbox disk during extraction; official
digest-pinned slim images worked. BusyBox container health probes incorrectly
used the sandbox proxy for loopback requests. The documented opt-in workaround
tolerates that probe only while checking the actual Auth HTTP response; real
Auth/REST/browser tests passed. This does not disable TLS or image verification.

## Remaining work and release boundary

This stage does **not** close Issue #1. Shared planner editing/calendar/kanban UI,
employee write permissions, private photo bytes/quotas/deletion, strict V1
dry-run/import/rollback, automatic refresh/conflict UX, full audit coverage,
backups/restore drill and physical iPhone/Safari checks remain future stages.
Hosted email, redirect, rate-limit, backup and security configuration is untested.
V1's documented unsafe-import/photo finding remains in the unchanged local pilot.
Do not use the current foundation as a complete production system.

No deployment or merge was performed. Production use needs completion of those
stages, auth/security review, cost/hosting confirmation and explicit owner approval.
Related issue: [#1](https://github.com/bkubont/Canopy/issues/1) (not closed).
