export const STAGE_DEFS = [
  { key: "estimate", label: "Estimate", sortOrder: 1 },
  { key: "prep", label: "Prep", sortOrder: 2 },
  { key: "tree_work", label: "Tree Work", sortOrder: 3 },
  { key: "cleanup", label: "Cleanup", sortOrder: 4 },
] as const;

export type StageKey = (typeof STAGE_DEFS)[number]["key"];

export function progressLabel(progress: string): string {
  switch (progress) {
    case "in_progress":
      return "In progress";
    case "completed":
      return "Completed";
    case "not_needed":
      return "Not needed";
    default:
      return "Not started";
  }
}
