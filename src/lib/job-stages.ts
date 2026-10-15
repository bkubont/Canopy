import { prisma } from "@/lib/prisma";
import { STAGE_DEFS } from "@/lib/stages";

/** Ensure the four placeholder JobStage rows exist for a job. */
export async function ensureJobStages(
  businessId: string,
  jobId: string,
): Promise<void> {
  const existing = await prisma.jobStage.findMany({
    where: { jobId, businessId },
    select: { key: true },
  });
  const have = new Set(existing.map((s) => s.key));
  const missing = STAGE_DEFS.filter((s) => !have.has(s.key));
  if (!missing.length) return;
  await prisma.jobStage.createMany({
    data: missing.map((s) => ({
      businessId,
      jobId,
      key: s.key,
      label: s.label,
      progress: "not_started",
      sortOrder: s.sortOrder,
    })),
  });
}
