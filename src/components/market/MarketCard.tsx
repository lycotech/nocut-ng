import Link from "next/link";
import { CategoryTag } from "./CategoryTag";
import { StakeSplitBar } from "./StakeSplitBar";
import { CountdownTimer } from "./CountdownTimer";
import { formatCurrency } from "@/lib/utils";
import type { Market } from "@/lib/api";

export function MarketCard({ market }: { market: Market }) {
  return (
    <Link
      href={`/markets/${market.id}`}
      className="block rounded-xl border border-brand-border bg-brand-surface p-4 transition-colors hover:border-brand-amber"
    >
      <div className="mb-2 flex items-center justify-between">
        <CategoryTag category={market.category} />
        <span className="text-xs text-brand-subtle">{market.pool_fill_pct}% filled</span>
      </div>

      <h3 className="mb-3 line-clamp-2 text-sm font-medium leading-snug text-brand-text">
        {market.title}
      </h3>

      <StakeSplitBar yesPct={parseFloat(market.yes_pct)} />

      <div className="mt-3 grid grid-cols-2 gap-2">
        <div className="rounded-lg bg-brand-yes-muted px-3 py-2 text-center">
          <div className="text-xs font-medium text-brand-yes">YES {market.yes_pct}%</div>
          <div className="text-xs text-brand-muted">~{formatCurrency(market.yes_expected_payout)} / ₦1k</div>
        </div>
        <div className="rounded-lg bg-brand-no-muted px-3 py-2 text-center">
          <div className="text-xs font-medium text-brand-no">NO {market.no_pct}%</div>
          <div className="text-xs text-brand-muted">~{formatCurrency(market.no_expected_payout)} / ₦1k</div>
        </div>
      </div>

      <div className="mt-3 flex items-center justify-between text-xs">
        <span className="text-brand-subtle">Pool {formatCurrency(market.reward_pool)}</span>
        <CountdownTimer closesAt={market.closes_at} />
      </div>
    </Link>
  );
}
