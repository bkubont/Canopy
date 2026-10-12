# Step 2 independent approval review — 2026-10-12

Reviewed branch: `issue-1/v1-1-backend-auth-upgrade`, implementation through
`e80e4e3`. This review adds regression tests only; no application or migration
changes were necessary. Main, hosted Supabase, Hostinger and Step 3 were untouched.
All users, companies, mail and photos used here were synthetic local fixtures.

## Commands and results

Run from `/workspace/Canopy` with the existing local stack and account-admin
function running. Stack reproduction and proxy requirements are documented in
`STEP_2_BACKEND_AUTH_REVIEW.md`; no production credentials are needed.

| Exact command | Result |
| --- | --- |
| `npm test` | 7 tests passed, zero failures/skips |
| `npm run test:db > /tmp/canopy-independent-db.log 2>&1` | Baseline: 57 foundation + 82 upgrade + 7 fresh assertions passed |
| `npm run test:integration > /tmp/canopy-independent-integration.log 2>&1` | Baseline: 36 local-service assertions + 16 browser tests passed |
| `npm run test:db > /tmp/canopy-independent-db-expanded.log 2>&1` | Final: 57 foundation + 105 upgrade + 7 fresh assertions = 169 passed |
| `npm run test:integration > /tmp/canopy-independent-integration-final.log 2>&1` | Final: 41 local-service assertions + 16 browser tests passed |
| `git diff --check` | Passed after removing a trailing blank line |

Browser tests include original V1 smoke coverage and actual local Auth sessions
on desktop Chromium and an iPhone viewport. Integration builds the cloud bundle
with local public configuration and exercises the deployed local Edge handler.
The SQL runner creates and removes its own network-isolated PostgreSQL container.
Full local logs are temporary, not committed, because service output can contain
synthetic authentication links. Pass totals above exclude intentional denied
operations: those are assertions that the operation fails with the expected code.

Review failures: the first added Detroit test attempted to call internal
`business_day` as authenticated and received `permission denied for function
business_day`. This was a test error: the internal helper intentionally has no
browser grant. The test now verifies the owner's authorized timezone update,
then checks the internal date helper as the database test administrator. The
expanded database rerun passed. No permission grant was weakened. Initial
`git diff --check` identified an extra blank line at EOF; it was removed.

## Approval checklist: verified locally

- [x] Owner, admin, crew lead and worker cannot read foreign-company jobs or
  private clients, or retrieve foreign administrative team identities. Every
  role also fails to bypass competing permissive private Storage policies.
- [x] Owner/admin have company administrative access. Workers/leads lack raw
  private client rows; assigned-job projection exposes only approved fields.
  Worker/lead unrelated-job access, self-assignment and administrative escalation
  are denied. Lead progress/phase rights differ from administrative scheduling.
  Last-owner protections and admin restrictions on granting administrative roles
  are enforced. Revoked sessions lose reads and RPC writes without logging out.
- [x] Service-only account functions cannot be invoked by browser roles; real
  Edge requests verify identity and disregard a forged actor. Cross-company
  invitations are denied before delivery.
- [x] Real local SMTP invitations deliver, retries of sent requests are
  idempotent, and verified acceptance grants exactly the invited role. SQL tests
  reject wrong identities, unconfirmed email, expiry and revoked inviter access.
  Explicit revocation and replay rejection are exercised via the real Edge API.
- [x] Provider rejection and thrown transport failure grant no membership.
  These are **fault injections at the delivery method only**, using the actual
  handler, real Auth token validation and real database RPCs. They are not tests
  of an actual SMTP outage. Rejection returns 502 and records `failed`; an
  exception returns 503 and retains `pending` under its delivery lease.
  Immediate retries return 409; revocation blocks replay. A new request after
  revocation sends via actual local SMTP and still grants no premature access.
- [x] Actual password recovery sends local mail, verifies the provider token,
  changes the password and permits login on both browser viewports. Invitation
  account setup alone grants no organization membership.
- [x] All migrations apply both to a fresh SQL database and a populated original
  foundation schema. Legacy role activity, project versions/stages, dated events,
  multi-day visits, repeated dumps, notes and photo metadata survive. Organization
  foreign keys and assignment scope protections remain enforced.
- [x] Actual Storage API denies browser download/signing/upload; unauthenticated
  public-object URL does not return private bytes. Application owner cannot make
  the protected bucket public. SQL competing `FOR ALL USING(true)` policies on
  objects and buckets cannot bypass restrictive guards. Other buckets retain
  their own permissions. Direct photo access is intentionally closed for all
  browser roles pending the later verified upload/download service.
- [x] Owner can set `America/Detroit`; business date uses that IANA timezone.
  Spring 2026: 06:59:59Z → 01:59:59, 07:00Z → 03:00. Fall: both 05:30Z and
  06:30Z → 01:30 local. Local midnight, rather than UTC midnight, determines
  date rollover. These conversion assertions use explicit instants, not the
  wall clock on the day this review runs.

## Remaining risks and owner decisions

- [ ] Hosted Auth/SMTP delivery, retry limits, redirect allowlists and hosted
  password recovery remain untested. Owner must configure and review them before
  a later authorized staging/production rollout. No hosted project was contacted.
- [ ] A transport exception can leave a pending claim for five minutes. Access
  remains closed, but email delivery may be uncertain; check the invitation ledger
  before retrying. Revocation followed by a new request is verified. Process crash,
  concurrent SMTP outage and real external-provider failure were not simulated.
- [ ] Migration fixtures cover the **prior SQL foundation**, not a customer's
  browser IndexedDB backup or every real-world legacy dataset. Validated import,
  dry run and rollback of IndexedDB records remain the planned later stage.
  No customer data was used and V1 storage was not altered.
- [ ] Visits store civil dates and optional local times. An ambiguous fall-back
  01:30 has two possible instants; a spring-gap 02:30 has none. The database IANA
  conversion works, but the future shared scheduling UI must define how to reject
  or disambiguate these inputs. This review does not certify that UI or calendar
  rendering. Work-date validation currently permits business day + 1; this is
  existing behavior, not proof that tomorrow's work occurred.
- [ ] Verified photo processing, previews, authorized file proxy, quotas/deletion,
  backup restoration and the shared planner are later-stage work. Service-role or
  database-operator privileges can bypass RLS; those credentials must remain
  server-only. These tests do not defend against a compromised operator.
- [ ] Mobile coverage is Chromium viewport emulation, not physical iOS/Safari.
  Real-service integration currently requires local execution and is not in CI.
- [ ] Owner review and explicit merge approval are still required. Step 3 stays
  on hold; this report does not authorize merging or deployment.

Recommendation: the tested Step 2 boundaries pass locally. Review the documented
operational limitations before approving Step 2; this is not release approval for
real client data.
