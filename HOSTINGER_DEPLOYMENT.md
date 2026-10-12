# Deploying Canopy to Hostinger (static pilot)

For Issue #1's separate Supabase cloud foundation, read
[CLOUD_FOUNDATION.md](docs/CLOUD_FOUNDATION.md). It can use Hostinger Business for
static HTTPS hosting without a Node/PHP backend. This pilot guide does not deploy
or configure authentication, a shared database, or private photo storage.

The V1.1 Step 2 upgrade is documented in
[STEP_2_BACKEND_AUTH_REVIEW.md](docs/STEP_2_BACKEND_AUTH_REVIEW.md). Its migrations
and Edge Function were tested locally only. Do not apply them to a live Supabase
project or deploy the preview to Hostinger under the current authorization.

**Do not deploy yet if you intend to enter real customer records.** V1 uses IndexedDB local browser storage only, no accounts, no database, and no cloud backups.

## Before deploying
1. Run `npm test` and complete `V1_ACCEPTANCE_TESTS.md` using sample jobs.
2. Set up a **new empty** Hostinger custom HTML website or subdomain. Do not overwrite SquareThisUp or another active site.
3. Confirm your Hostinger plan's supported Git integration and document root. Keep database credentials and API keys out of this public repo.

## Git deployment (supported hosting plans)
1. In hPanel open **Websites → Dashboard** for the new custom website.
2. Find **Advanced → Git** (availability varies by hosting plan). Connect GitHub and choose `bkubont/Canopy`, branch `main`.
3. Deploy into the correct site's empty public directory (often `public_html`). Verify the correct directory first: deploying into an existing site may replace it.
4. Over HTTPS, verify the site loads on desktop/mobile and complete the manual smoke tests.
5. Keep regular JSON backups. Expect records made in one browser **not** to appear on other devices.

If your Hostinger plan cannot deploy from GitHub, use File Manager to upload **only** `index.html`, `app.js`, and `styles.css` into the new site's document root.

## Production deployment is a separate milestone
To support real worker logins and shared data, implement a secure hosted backend with authorization, relational persistence, private photo storage, sync, audit history, and automated backups before allowing customers' records to be entered.

Hostinger guide: https://www.hostinger.com/support/1583302-how-to-deploy-a-git-repository-in-hostinger/
