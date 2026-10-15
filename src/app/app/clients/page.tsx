import { ClientsPanel } from "@/components/clients-panel";

export default function ClientsPage() {
  return (
    <section className="app-main">
      <h1 className="page-title">Clients</h1>
      <p className="muted">
        Client folders — save with a name only. Add jobs from a client or the
        Jobs screen.
      </p>
      <ClientsPanel />
    </section>
  );
}
