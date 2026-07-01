import { notFound } from "next/navigation";
import { getMarket } from "@/lib/api";
import { MarketDetailClient } from "@/components/market/MarketDetailClient";

export default async function MarketDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const market = await getMarket(id).catch(() => null);

  if (!market) notFound();

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8 sm:px-6">
      <MarketDetailClient initialMarket={market} />
    </main>
  );
}
