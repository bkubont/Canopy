# Legacy IndexedDB pilot (V1)

This folder holds the original static Canopy pilot (browser-only IndexedDB).
It is **not** the production app entry point.

## Run locally (reference / UX only)

```sh
cd legacy-pilot
python -m http.server 8000
```

Open `http://localhost:8000`.

## JSON import path (production Phase 1+)

1. In the pilot UI, open **Backup** and export a JSON file.
2. Keep that file offline; it may contain client PII and photos.
3. In the production app (owner signed in), open **Settings → Import V1 IndexedDB JSON** and upload the file.
4. Mapped fields: `clients` → clients; `projects` → jobs; `notes` → notes; `photos` (data URLs) → notes + protected attachments.
5. Not imported yet: visits, tasks, workers, history (later phases).

Pilot acceptance checklist: `V1_ACCEPTANCE_TESTS.md`.
