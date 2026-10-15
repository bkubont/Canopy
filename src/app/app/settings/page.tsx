import { SettingsPanel } from "@/components/settings-panel";

export default function SettingsPage() {
  return (
    <section className="app-main">
      <h1 className="page-title">Settings</h1>
      <p className="muted">
        Export, V1 pilot import, and backup notes. Timezone and stage colors
        stay as seeded defaults for now.
      </p>
      <SettingsPanel />
    </section>
  );
}
