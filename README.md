# Canopy · Tree Work Planner

Production app for tree-service job planning: **Next.js (App Router) + Prisma + MySQL** on Hostinger, with owner email/password sign-in.

The original browser-only IndexedDB pilot is quarantined in [`legacy-pilot/`](legacy-pilot/).

## Current phase

**Phase 3** — stages, tasks, dump runs, kanban, calendar badges:

- Four JobStage rows per job (Not started / In progress / Completed / Not needed)
- Board: Ready → Estimate → Prep → Tree Work → Cleanup → Complete
- Kanban moves with work date, visit, requestId, expected version (idempotent)
- Past/today moves update board + events; future moves set planned stage only
- Missing visit → Unplanned work visit; explicit stage complete/reopen
- Dump runs (Depart / Return / Done) with brown calendar badges
- Daily badges as activity-event projections; Start/Resume without column change

## Local setup

1. Copy [`.env.example`](.env.example) to `.env.local` and set `DATABASE_URL` + `SESSION_SECRET`.
2. `npm install`
3. `npx prisma migrate deploy`
4. `npm run db:seed` (uses `SEED_OWNER_*` env vars)
5. `npm run dev` → http://localhost:3000

## Scripts

| Script | Purpose |
| --- | --- |
| `npm run dev` | Local Next.js dev server |
| `npm run build` / `npm start` | Production build & serve |
| `npm test` | Lint + TypeScript check |
| `npm run db:migrate` | Apply Prisma migrations |
| `npm run db:seed` | Create business + owner |

## Auth model

- **Owner** (and later optional schedulers) sign in with email/password.
- **Workers** are roster display names only — no login in this release.

## Deploy

See [HOSTINGER_DEPLOYMENT.md](HOSTINGER_DEPLOYMENT.md). Prefer a new empty Node.js site; never overwrite a live site without confirmation. Secrets stay in Hostinger env vars only.

## Pilot JSON import

Export JSON from the legacy pilot Backup screen, then use **Settings → Import** in the signed-in app. Details: [`legacy-pilot/README.md`](legacy-pilot/README.md).
