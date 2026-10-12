# V1 manual acceptance checks

Use **fake/sample clients and job details** for these tests. Do not use real sensitive records in the browser-only pilot.

## Core workflow
- [ ] Add a client with phone/email/address; edit it. Add two independent projects under the same client; each keeps its own scope.
- [ ] Create two workers. Assign one to the whole job, another to only Prep & Rigging. Verify assignments are optional.
- [ ] Schedule a project for three days. Verify it appears on **each** scheduled calendar day and links back to the correct project.
- [ ] Move the project from Scheduled → Prep & Rigging in the kanban. Today's calendar card reflects Prep. Earlier dated entries remain in Daily History.
- [ ] Log Prep work for yesterday. Verify its badge appears only on the matching scheduled day; future days do not automatically inherit yesterday's progress.
- [ ] Mark Prep completed; verify completion is tracked separately from the current kanban stage.
- [ ] Move to Tree Work, then Cleanup on later days. Check the dated history records all changes.
- [ ] Add two brush dump-run tasks to a single project, each with a different date/destination/worker. Mark one complete.
- [ ] Add a timestamped note and photo to Project A. Verify they do not appear on Project B.
- [ ] Export backup JSON. In a separate test browser profile, import it and verify clients/projects/visits/notes/photos are restored.

## Small-screen test
- [ ] On iPhone or narrow mobile viewport, open every tab, save a client, and move a project using **Move** (not drag-and-drop).
- [ ] Add a picture from the camera/photo library and confirm the image renders.
- [ ] Verify the calendar scrolls on a narrow screen.
- [ ] Cancel each editor without changing saved data.

## Known limitations; not pass/fail for static V1
- Each browser/device has its **own** isolated local data.
- No password/login or crew access, no cloud sync, no automatic backup.
- No live GPS, clock-in/out, accounting, estimate document generation, or alerts.
- Calendar phase badges indicate recorded activity on a date, not hours worked or verified task completion.
- Job photos are compressed and held in browser storage; heavy use may reach storage quotas.

**Release gate:** Do not treat it as a real multi-worker production app until hosted authentication, permission-checked storage, backups, and protected photo storage are built and tested.
