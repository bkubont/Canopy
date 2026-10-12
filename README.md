# Canopy · Tree Work Planner

A lightweight, mobile-friendly tree-service scheduling and job-organizing web app. **V1 is a local-first pilot**, not yet a secure shared production system.

## What V1 does

- Clients: name, phone, email, property address, client notes.
- Projects: any number of distinct jobs per client, each with its own scope and job-site address.
- Workers: optional crew directory, project assignments, phase assignments, and visit assignments.
- Schedule: month calendar, single- or multi-day site visits, worker assignments, start/end times, linked project cards.
- Kanban: Ready → Scheduled → Estimate → Prep & Rigging → Tree Work → Cleanup → Complete, with drag and drop (desktop) or Move action (mobile).
- Project phases: record work on a specified day, mark complete/reopen separately, optionally assign workers.
- Daily history: date-stamped changes and phase activity remain attached to the project. A stage change never overwrites previous dates. Calendar badges show actual recorded phase progress for each visit day.
- Tasks: general tasks and unlimited brush/dump runs, dates, destinations, crew assignments, completion.
- Notes/photos: timestamped project notes and compressed job photos stored with that project.
- Backups: export JSON and restore JSON.

**Not included:** estimates/invoices, GPS/timeclock, server-side database, user authentication, live multi-device sync, role-based permissions, reminders, automated cloud backups, email/SMS, or cost/profit reporting.

## Run locally

1. Download or clone this repo.
2. From its root run `python -m http.server 8000` or `py -m http.server 8000`.
3. Open `http://localhost:8000` in a modern browser.
4. Add a client, project, worker, and visit. Test moving phases, notes, tasks, photos.
5. Go to **Backup** and export a JSON copy before clearing browser data.

No API keys, packages, credentials, or build command are required. The deployable web files are `index.html`, `styles.css`, and `app.js`.

## Verify changes

With Node 22+:

```sh
npm test
```

This checks JavaScript syntax and core V1 state/history rules. You should also manually run through [V1_ACCEPTANCE_TESTS.md](V1_ACCEPTANCE_TESTS.md) on desktop and iPhone before deployment.

## Data and privacy

This app uses browser **IndexedDB**, not a hosted database. A public repository exposes the source code, **not** records entered into your browser. But an HTTPS URL is not a login system. Each browser/device is its own disconnected workspace. Anyone visiting the site sees their own blank local database.

There is no server-based access control, shared crew portal, or automated backup. Browser data can be lost, and local photos inflate JSON backups. Do not use V1 as the sole record of client contact information, job photos, or business activity; do not publish real private client records for testing. Keep independent backups.

## Next production milestone (before relying on it daily)

1. Add real authentication (owner/admin and optional workers), secure password reset, session handling.
2. Add a hosted relational database with per-user/per-organization authorization enforced server-side.
3. Store photos in protected object storage; implement safe uploads, file limits, signed URLs, backups.
4. Migrate existing IndexedDB data through a validated import process.
5. Add automatic backup/restore, change audit trail, and cross-device data synchronization.
6. Test permission boundaries, multi-day calendar status, photo upload and mobile UX.

Keep secrets, database credentials, and private API keys **out of this public repository**.

## Hostinger

See [HOSTINGER_DEPLOYMENT.md](HOSTINGER_DEPLOYMENT.md). Do not deploy over an existing live website. You can host the static pilot after testing; this does not change local-only data storage.
