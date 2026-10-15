# Legacy IndexedDB pilot (V1)

This folder holds the original static Canopy pilot (browser-only IndexedDB).
It is **not** the production app entry point.

## Run locally (reference / UX only)

```sh
cd legacy-pilot
python -m http.server 8000
```

Open `http://localhost:8000`.

## JSON import path (later phases)

1. In the pilot UI, open **Backup** and export a JSON file.
2. Keep that file offline; it may contain client PII and photos.
3. Phase 1+ of the production app will provide an authenticated **Import pilot JSON** flow that maps compatible fields (clients, jobs, notes) into MySQL.
4. Until that importer ships, do not treat the pilot export as production data.

Pilot acceptance checklist: `V1_ACCEPTANCE_TESTS.md`.
