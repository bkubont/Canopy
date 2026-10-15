import { JobsPanel } from "@/components/jobs-panel";

export default function JobsPage() {
  return (
    <section className="app-main">
      <h1 className="page-title">Jobs</h1>
      <p className="muted">
        Jobs need a client and a title. Open a job for site details, stage
        placeholders, and the notes feed.
      </p>
      <JobsPanel />
    </section>
  );
}
