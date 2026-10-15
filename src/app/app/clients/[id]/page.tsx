import Link from "next/link";
import { ClientDetail } from "@/components/client-detail";

export default async function ClientDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <section className="app-main">
      <p className="crumb">
        <Link href="/app/clients">Clients</Link> / detail
      </p>
      <h1 className="page-title">Client folder</h1>
      <ClientDetail clientId={id} />
    </section>
  );
}
