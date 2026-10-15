# Deploying Canopy to Hostinger (production Node.js + MySQL)

Canopy production is a **Next.js (App Router)** app with **Prisma** and **MySQL**, not the static IndexedDB pilot. The pilot lives under [`legacy-pilot/`](legacy-pilot/) for UX reference and a future JSON import path.

## Costs (document before paid add-ons)

Recurring Hostinger charges typically include:

| Item | Notes |
| --- | --- |
| Business or Cloud hosting plan | Required for Node.js apps on Shared/Cloud |
| Domain (optional) | Free `*.hostingersite.com` subdomain works for Phase 0 |
| MySQL | Included with the hosting plan for website databases |
| SSL | Included; keep HTTPS redirect on |

Do **not** purchase domains, VPS, or other paid catalog items from automation without an explicit owner confirmation.

## Prerequisites

1. An active Hostinger **Business** or **Cloud** order that supports Node.js.
2. Prefer a **new empty** website. Never overwrite SquareThisUp or another live site without explicit confirmation.
3. Secrets only via Hostinger Node.js environment variables (never commit `.env`).

## Environment variables

Set these on the Node.js website (hPanel or `hosting_nodejs_replace-environment-variables`). Prefer `hosting_databases_setup-website` to create MySQL and inject `DATABASE_URL` / `DB_*` automatically.

| Key | Purpose |
| --- | --- |
| `DATABASE_URL` | Prisma MySQL URL. **From the app use `127.0.0.1:3306`**, not `localhost` and not the external `srv….hstgr.io` host |
| `SESSION_SECRET` | Long random string (≥16 chars) for signed session cookies |
| `SESSION_SECURE` | `true` on HTTPS production |
| `SEED_OWNER_EMAIL` / `SEED_OWNER_PASSWORD` | Used once with `npm run db:seed` (optional; remove password after seed) |
| `UPLOAD_DIR` (optional) | Absolute path for private photo files. Default on Hostinger: `<domain-root>/canopy-uploads` (survives `hbuilds` redeploys). Never under `public/` |

Copy shapes from [`.env.example`](.env.example).

## Backups (Phase 1)

| What | Where |
| --- | --- |
| Clients / jobs / notes metadata | MySQL — Hostinger account backups + owner Export JSON/CSV from **Settings** |
| Photo binaries | Private `canopy-uploads` on the hosting account (auth-gated downloads only; no public URLs) |
| Pilot import | Settings → Import V1 IndexedDB JSON (maps clients, jobs, notes, photos) |

Recommended: enable Hostinger plan backups if available; otherwise export JSON weekly from Settings before major changes. Restore MySQL and `canopy-uploads` together for a full recovery.

## First deploy (MCP / archive)

1. Create or select an empty website (`hosting_websites_create` or reuse a free subdomain).
2. Wait until `hosting_websites_list-setups` reports `status: completed` for that domain.
3. Deploy Node.js source with `hosting_deploy-js-application` (or upload `app.zip` + `hosting_nodejs_start-build`). Archive must exclude `node_modules/`, `.next/`, and `.env*`.
4. Build settings: framework Next.js; build command `npm run build`; start via Hostinger’s Node runner (`next start` / detected entry).
5. Create DB: `hosting_databases_setup-website`.
6. Add `SESSION_SECRET` (and seed vars if needed) via env replace — **full replace**; list existing keys first and keep all of them. Do this **before** the first Node build so `npm run build` can migrate and seed (Hostinger loads Node env into the build).
7. Deploy / rebuild. The production `build` script runs `prisma migrate deploy` and `tsx prisma/seed.ts` before `next build`. Seed is idempotent (skips if the owner email already exists). After the first successful seed, remove `SEED_OWNER_PASSWORD` from env when convenient.
8. Verify:
   - `GET https://DOMAIN/api/health` → `{"ok":true,"database":"ok",...}`
   - `https://DOMAIN/login` loads
   - Owner can sign in and reach `/app`

## Git auto-deploy (optional)

1. Connect GitHub in hPanel → Advanced → Git (one-time; API cannot create the OAuth link).
2. Point auto-deploy at `bkubont/Canopy` and the production branch.
3. First Node build still needs `hosting_nodejs_start-build` with `source_type: "git"`.

## Local development

```sh
cp .env.example .env.local
# point DATABASE_URL at a local MySQL 8 database
npm install
npx prisma migrate deploy
npm run db:seed
npm run dev
```

## Legacy static pilot

Do not deploy `legacy-pilot/` as the production site. See [`legacy-pilot/README.md`](legacy-pilot/README.md) for the IndexedDB JSON export path used by a later import feature.

## Hostinger Node layout (Business)

Published app lives under `hbuilds/` (not only `public_html`):

- Current: `/home/<user>/domains/<domain>/hbuilds/current/nodejs`
- Versioned: `/home/<user>/domains/<domain>/hbuilds/versions/<build-uuid>/nodejs`

`public_html/.htaccess` points Passenger at the current build. File-browser listings of `public_html` may show little more than `.htaccess` after a Node deploy.
