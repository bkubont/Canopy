import { CalendarPanel } from "@/components/calendar-panel";

export default function CalendarPage() {
  return (
    <section className="app-main wide">
      <h1 className="page-title">Calendar</h1>
      <p className="muted">
        Month, week, day, and agenda views. Cards open the job with that visit
        selected.
      </p>
      <CalendarPanel />
    </section>
  );
}
