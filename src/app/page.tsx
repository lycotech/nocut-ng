import { getMarkets } from "@/lib/api";
import { formatCurrency } from "@/lib/utils";
import { MarketFeed } from "@/components/market/MarketFeed";

export default async function Home() {
  const { markets } = await getMarkets().catch(() => ({ markets: [] }));

  const totalStaked = markets.reduce(
    (sum, m) => sum + parseFloat(m.total_yes) + parseFloat(m.total_no),
    0
  );

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-10 sm:px-6">
      <section className="mb-10">
        <h1 className="max-w-2xl text-3xl font-bold tracking-tight text-brand-text sm:text-4xl">
          Don&apos;t Guess. Take Position.
        </h1>
        <p className="mt-2 max-w-xl text-sm text-brand-muted">
          Nigeria&apos;s fixed reward pool prediction market. Stake on outcomes across football, politics, finance and entertainment — transparent payouts, no opaque odds.
        </p>

        <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-2">
          <div className="rounded-xl border border-brand-border bg-brand-surface p-4">
            <div className="text-xs text-brand-subtle">Active Markets</div>
            <div className="mt-1 text-xl font-semibold text-brand-text">{markets.length}</div>
          </div>
          <div className="rounded-xl border border-brand-border bg-brand-surface p-4">
            <div className="text-xs text-brand-subtle">Total Staked</div>
            <div className="mt-1 text-xl font-semibold text-brand-text">{formatCurrency(totalStaked)}</div>
          </div>
        </div>
      </section>

      <MarketFeed initialMarkets={markets} />
    </main>
  );
}
