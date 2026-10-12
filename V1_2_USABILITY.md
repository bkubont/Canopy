# Canopy V1.2 usability update

V1.2 is a local-browser usability update based on the approved `staging`
checkpoint. It does not use the Step 2 Supabase foundation, start shared planner
integration, or authorize deployment. Use fictional sample records only.

## Implemented

- The Kanban order is Lead, Estimate, Approved, Work Scheduled, Prep & Rigging,
  Tree Work, Cleanup, Complete. On Hold, Declined and Cancelled are optional job
  flags rather than columns. Workflow moves append dated history; entering
  Approved also appends a dated approval entry. Moves and visits never create
  completed-work records.
- Jobs use their stable UUID internally and the contact name as the visible
  heading. A contact may own multiple jobs. Job scope is stored as an array of
  fixed keys plus an optional custom Other value; multiline job notes are stored
  separately. Job creation accepts an existing contact or creates a basic one
  and has no worker controls.
- Cards show contact, address, telephone link, scope, workflow and optional flag.
- Visits have a structured type and their own optional worker list. Estimate
  visits default to two hours and dump runs to one hour; the end time remains
  editable. Other visit types require the user to supply an end time if desired.
- The overview consolidates contact, scope, notes, workflow, next visit, upcoming
  visit crew and dump-run count. Four expandable phase rows contain assignment,
  actual-work, completion/reopening controls and recent dated history.
- Workers have an arborist-specific primary-position selector, an Other value,
  and multiline notes.
- The sample-only staging build still uses `canopy-testing-v1`, retains its
  warning banner and reset control, disables backup import, contains no Supabase
  configuration, and defaults to fictional records.

## Local data migration

On first load, a schema-1 workspace is converted in memory and saved as schema 2.
The conversion is additive:

- `ready` becomes `lead`; `scheduled` becomes `work_scheduled`; other known phase
  stages keep their meaning.
- Old project titles are retained as `legacyTitle` for fallback display. Old
  combined descriptions become `jobNotes`. New structured scope starts empty so
  the migration does not invent work.
- Existing project and phase worker arrays remain present. Existing visit worker
  arrays remain attached to their original visits. A legacy visit gets type
  Other because its purpose cannot be inferred safely.
- A worker's old free-text role is retained as the custom position value.
- IDs, client/project relationships, visits, tasks, notes, photos and every dated
  history record remain unchanged.

Backup restore in the development app applies the same migration. Import remains
disabled in the sample-only artifact. No automatic rollback is needed because
the migration never deletes legacy fields; exporting a backup before testing is
still recommended.

## Verification and limits

Automated tests cover structured multi-scope jobs, optional notes, two jobs for
one contact, contact-derived headings, phone links, visit-only crew assignment,
different visit crews, duration defaults and override, exact workflow order,
approval history, work-log separation, phase completion/reopening, persistence,
schema-1 migration, sample reset, disabled staging import, and desktop/mobile
Chromium layouts.

The mobile run uses an iPhone-sized Chromium profile, not physical Safari.
Legacy free-text scope is preserved as job notes and requires manual selection of
new structured scope choices. The local prototype still has no synchronization,
authentication, shared database, production photo service, or deployment.
