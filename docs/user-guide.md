# Canopy user guide (owner)

**Live app:** https://canopy.squarethisup.com  
**Who signs in:** Owner (and later optional schedulers). Workers are display names on the roster only — they do not log in.

Timezone default: **America/Detroit**.

---

## Sign in

1. Open the live URL → **Sign in** with your owner email and password.
2. You land on **Today**. Use the nav for Clients, Calendar, Board, Workers, Settings.
3. Sign out from the app header when finished.

---

## Clients

1. **Clients** → enter a name (required). Phone, email, and address are optional.
2. Open a client folder to edit details or add jobs.
3. **Archive** hides a client from the default list; **permanent delete** requires typing the exact name to confirm.
4. Keep demo/acceptance data labeled `TEST — …` so it is easy to find and remove.

---

## Jobs

1. From a client (or Jobs), create a job with a **title** (required). Site address and description are optional.
2. Open the job for overview, visits, stages, tasks, notes/photos, and activity.
3. Mark **ready for scheduling** when the job should appear as Ready on the board.
4. **Archive** vs **permanent delete** (confirm exact title). Archive keeps history; delete removes the job and its photo files.

---

## Scheduling visits

1. On the job, use the visit scheduler: pick a start/end range, then **explicitly select which days** (weekends are never auto-skipped).
2. Choose all-day or start/end times. Multi-day ranges create **one visit per selected day**.
3. Optional: copy job-level workers onto new visits.
4. Calendar (month / week / day / agenda) shows visits; cards open the job with that visit in context.

---

## Workers and assignments

1. **Workers** → add roster names (phone/role optional). No login accounts.
2. Assign workers at **job**, **visit**, **stage**, or **task** level (all optional).
3. Overlapping **timed** assignments for the same worker across jobs show a conflict; you can proceed with an override reason.
4. Worker views and the Unassigned filter live with Calendar / Workers for planning.

---

## Kanban board

Columns: **Ready → Estimate → Prep → Tree Work → Cleanup → Complete**.

1. Set the **work date for moves** at the top of the board.
2. Use **Move to** on a card (works on touch; no hover-only control).
3. **Past / today** moves update the primary column and log calendar badges. If the job has no visit that day, Canopy creates an **Unplanned work** visit.
4. **Future** moves only set the **planned stage** on that day’s visit — the board column does not jump ahead.
5. Leaving a column **never** silently completes a stage. Use explicit Complete / Reopen / Not needed / Start / Resume on the job or calendar card.
6. If a move fails (network or version conflict), the card returns to its previous column and an error is shown. Reload and retry after a conflict.

---

## Stage progress

Each job has four stages (Estimate, Prep, Tree Work, Cleanup) with progress: Not started / In progress / Completed / Not needed.

- Complete or reopen from job detail (or Start / Resume from a calendar day card).
- Parallel stage chips can show on cards without bouncing the primary kanban column from dump/tasks.

---

## Dump runs

1. On the job, add a task with kind **Dump**.
2. Advance **Depart → Return → Done** (repeatable). Brown dump badges appear on the calendar for that work date.
3. Dump progress does **not** move the primary kanban column.

---

## Notes and photos

1. On job detail, add text and/or photos (JPEG, PNG, HEIC — HEIC converts for preview when needed).
2. Upload shows progress. If save fails, **draft text stays** (and photo previews stay for retry).
3. Partial photo failures keep the note and successful files; retry failed ones.
4. Photos download only through signed-in attachment URLs — not public links.

---

## Archive

- Archive clients or jobs when work is done but you may need history.
- Permanent delete is irreversible and requires typing the exact name/title.

---

## Exports and backups

**Settings → Export**

| Format | Contents |
| --- | --- |
| JSON | Clients, jobs, visits, workers, assignments, tasks, activity events, notes, attachments ID manifest |
| CSV | Same entity sections (plus notes + attachments manifest after Phase 4 deploy) |

Photo **files** are not inside the export. They live in private `canopy-uploads` on Hostinger.

**Recommended**

1. Export JSON weekly and before any deploy.
2. Keep Hostinger plan backups on if available.
3. Restore MySQL and `canopy-uploads` together so attachment IDs still match files.
4. After restore: check `/api/health`, sign in, open one job with a photo.

Full operator notes: repo `HOSTINGER_DEPLOYMENT.md`.

---

## Test vs production data

Prefix drills with `TEST —`. Archive or permanently delete them when finished so the live folders stay production-only.
