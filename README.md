# Canopy · Tree Work Planner

Production app for tree-service job planning: **Next.js (App Router) + Prisma + MySQL** on Hostinger, with owner email/password sign-in.

The original browser-only IndexedDB pilot is quarantined in [`legacy-pilot/`](legacy-pilot/).

## Phase 0 (this branch)

- Signed-in owner shell (`/login`, `/app`)
- Health check (`/api/health`)
- Prisma models: `Business`, `User`, `Client`, `Job`
- Secure HTTP-only session cookies (HTTPS in production)

Phases 1–4 (clients UI, photos, visits, kanban, etc.) are not built yet.

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

## Pilot JSON import (later)

Export JSON from the legacy pilot Backup screen. Phase 1+ will add an authenticated importer for mapped fields. Details: [`legacy-pilot/README.md`](legacy-pilot/README.md).
