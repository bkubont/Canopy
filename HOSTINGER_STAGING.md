# CANOPY TESTING — private Hostinger staging

Deploy only after the owner's explicit deployment approval. This preparation is
not permission to publish, use customer data, or start Step 3. The approved Step 2
checkpoint remains on `issue-1/v1-1-backend-auth-upgrade` at
`0f24d688d8193674ee2bdb02bb03af9acb1feb0b`. Staging is a separate branch; main is
unchanged. Use a new, empty staging subdomain/site and its own document root.
Never select another existing Hostinger website's directory.

This artifact retains the existing V1 interface and workflows. It is a local-only
prototype, not the shared authenticated planner. Phone and computer each have
independent IndexedDB records. Supabase code remains in the repository but no
cloud HTML, SDK, keys, migrations or Edge Functions are included in this build.
There is no cloud preview in this release and no environment variables are needed.

## Exact build settings

| Setting | Value |
| --- | --- |
| Repository branch | `staging` |
| Framework | None / custom static HTML |
| Node version | Node 22 or newer **on build machine only**; no hosting Node runtime |
| Installation command | `npm ci` |
| Build command | `npm run build:staging` |
| Output directory | `dist` |
| Start command | None; Hostinger serves static files |
| Environment variables | None |
| Artifact | `artifacts/canopy-testing.zip` |

Build on Linux/macOS with Node, npm and `zip` installed (the cloud workspace
already has these). `npm ci` uses the existing lockfile. The build clears only
generated `dist/`, generates sample-only copies, and packages exactly:
`index.html`, `app.js`, `styles.css`, `robots.txt`, `.htaccess`. The ZIP is ignored
by Git and must be generated/downloaded from the reviewed staging commit.
Repeat builds include dotfiles and cannot accidentally retain a cloud bundle.

Do not use Hostinger's Node.js application template, run `npm start`, or upload the
repository root. Hostinger Business static hosting needs no PHP/MySQL/Node app for
this test. Hostinger hPanel Git support does not establish that it runs build
commands or publishes a generated subdirectory. This setup does **not** rely on
that capability. If your hPanel lacks explicit build/output settings, use the
artifact procedure below. Do not configure Git to publish the source branch root.

## Artifact deployment procedure (only after approval)

1. Create a **new** staging subdomain or separate static website in hPanel. Record
   its exact document root; confirm it is empty and belongs to that new site.
2. Enable the site's SSL certificate in hPanel (Security → SSL; labels may vary).
   Wait for a valid certificate for the exact staging hostname. Use HTTPS only.
3. Open Advanced → Password Protect Directories for that site's root and configure
   hosting-layer Basic authentication with a unique test username/password. Store
   credentials privately in a password manager, never in Git or this ZIP. If the
   tool is unavailable, ask Hostinger to configure HTTP Basic authentication at
   the new document root; do not substitute a JavaScript login screen. Any Apache
   password file must be **outside** the web root. Ensure PHP/server handlers and
   static files are all protected. Do not publish without this protection.
4. Generate the ZIP from the approved staging commit. In File Manager, upload it
   only into that new root and extract there; files must be directly at the root,
   not inside `dist/`. Remove the uploaded ZIP from the web root immediately.
   Keep hidden files visible when checking `.htaccess`.
5. The supplied `.htaccess` starts with `Require all denied`, so an accidental
   unprotected upload denies access. **Do not overwrite hPanel-generated Basic
   authentication directives.** Merge the artifact's HTTPS/header/directory rules
   into the root's existing `.htaccess`, retaining the deny rule initially. Save
   an offline copy first. Once SSL and server-side authentication are configured,
   remove ONLY the artifact's `Require all denied` line. Retain the hosting
   `AuthType Basic`, `AuthName`, `AuthUserFile` and `Require valid-user` protection
   (or the hosting equivalent). If unsure about combining rules, stop and have
   Hostinger check the new directory configuration.
6. Use a fresh browser and the checks below. Denial, an absent password challenge,
   server error or missing HTTPS means the site is not ready. Reinstate deny-all
   until corrected. No automatic deployment, Git webhook or scheduled sync is
   configured by this repository.

The ZIP extraction/layout has been verified locally; no Hostinger upload or
hPanel configuration has been performed. Python's local test server ignores
`.htaccess`. HTTPS, Basic authentication and security headers therefore still
require verification on the actual hosting site. Expected hPanel navigation is
based on Hostinger's directory protection/File Manager workflow; account-specific
labels or permissions may differ.

## Verification checklist after deployment

- [ ] HTTP redirects to the correct HTTPS hostname; TLS certificate is valid.
- [ ] In a private/incognito browser without credentials, `/`, `/index.html`,
  `/app.js`, `/styles.css` and `/robots.txt` return a password challenge (401),
  never site contents. Wrong password also fails. Check each file directly.
- [ ] Correct hosting password opens the site. There is no frontend password gate.
- [ ] Responses include `X-Robots-Tag: noindex, nofollow, noarchive`, `no-store`,
  `nosniff`, and Content-Security-Policy. HTML robots meta and robots.txt are
  indexing hints only; passwords provide access control.
- [ ] `CANOPY TESTING — SAMPLE DATA ONLY` is clearly visible on phone/computer.
- [ ] Only fictional SAMPLE Client/Worker/Tree Job appears on a fresh browser.
  Create only fictional records and use non-sensitive sample images.
- [ ] Overview, clients, projects, calendar, kanban, notes, visits and assignments
  work; refresh preserves local edits. Separate devices do not synchronize.
- [ ] Settings has no restore/import input; exported filename explicitly says
  `CANOPY-TESTING-SAMPLE`. Never restore these records into a future production app.
- [ ] Reset testing samples replaces only this browser's staging records after
  confirmation. It does not affect original V1 storage (`canopy-v1`). Staging uses
  `canopy-testing-v1`; use a separate origin to avoid any existing app.
- [ ] Network requests contain no Supabase traffic, no credentials and no third
  party SDK. The artifact contains no `.env`, customer backup, SQL, or source repo.
- [ ] Test on actual iOS/Safari and desktop. Local mobile checks emulate iPhone
  size in Chromium; physical device behavior is not certified by that run.

For an unauthenticated check, run `curl -I https://YOUR-NEW-TEST-HOST/app.js`
without `-u`; expect 401. Check `curl -I http://YOUR-NEW-TEST-HOST/` for redirect.
Use your browser/password manager for authenticated checks rather than placing a
password into shell history. Hosting Basic auth does not encrypt browser-local
IndexedDB, enforce fictional input, or give per-worker backend permissions. Test
users must follow the sample-only rule; this is not suitable for client records.

## Rollback and retirement

Before any later approved upload, save the prior **static artifact** offline and
back up the staging root's hosting authentication configuration separately. Do
not store passwords in Git or package hPanel's password file into an artifact.
If testing fails, restore `Require all denied` first, then restore only the prior
staging static files and rules while preserving Basic authentication. Recheck
401/HTTPS before reopening. Roll back only this site's root; never revert another
website or a Supabase project. A file rollback does not undo browser records.
Reset staging samples in each browser or clear that staging origin's site data
when retiring a test. To end testing, deny access and remove the dedicated staging
site/files through hPanel after owner approval. Never delete other sites.

## Local preparation evidence

Commands: `npm test` (7 passed), `npm run test:staging` (desktop/mobile passed),
`npx --no-install playwright test tests/browser/v1.spec.cjs` (desktop/mobile V1
passed), `unzip -l artifacts/canopy-testing.zip` (exact five files including
`.htaccess`), `node --check dist/app.js`, and `git diff --check`.
Staging browser checks cover visible warning, no horizontal overflow, seed records,
create/edit persistence, reset, disabled import and original IndexedDB preservation.
Initial test invocation had an ambiguous sample locator and concurrent browser
servers collided on port 8765; the locator was narrowed, the required client selection added, and suites rerun
sequentially. No app change was needed for those test harness errors.

Further hosting verification and actual deployment require owner approval.
