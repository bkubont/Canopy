import Link from "next/link";
import { JobDetail } from "@/components/job-detail";

export default async function JobDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <section className="app-main">
      <p className="crumb">
        <Link href="/app/jobs">Jobs</Link> / detail
      </p>
      <JobDetail jobId={id} />
    </section>
  );
}
