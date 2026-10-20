import { BoardPanel } from "@/components/board-panel";

export default function BoardPage() {
  return (
    <section className="app-main wide">
      <h1 className="page-title">Board</h1>
      <p className="muted">
        Ready → Estimate → Prep → Tree Work → Cleanup → Complete. Parallel stage
        chips show work that is not the primary column; dump runs never bounce
        the card.
      </p>
      <BoardPanel />
    </section>
  );
}
