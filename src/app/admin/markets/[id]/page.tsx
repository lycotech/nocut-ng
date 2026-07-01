"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { getMarket, settleMarket as _settle, type MarketDetail, type SettlementResult } from "@/lib/api";
import { SettlementPanel } from "@/components/admin/SettlementPanel";
import { StatusBadge } from "@/components/market/StatusBadge";
import { CategoryTag } from "@/components/market/CategoryTag";
import { StakeSplitBar } from "@/components/market/StakeSplitBar";
import { ActivityFeed } from "@/components/market/ActivityFeed";
import { formatCurrency, formatDate } from "@/lib/utils";
import { getToken } from "@/lib/auth";

export default function AdminMarketDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [market, setMarket] = useState<MarketDetail | null>(null);
  const [settled, setSettled] = useState<SettlementResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const token = typeof window !== "undefined" ? getToken() : null;

  useEffect(() => {
    if (!id) return;
    getMarket(id)
      .then(setMarket)
      .catch(() => setError("Market not found or not accessible."));
  }, [id]);

  function handleSettled(result: SettlementResult) {
    setSettled(result);
    // Refresh market data to reflect settled status
    getMarket(id).then(setMarket).catch(() => null);
  }

  if (error) {
    return (
      <div className="flex-1 p-6">
        <p className="text-brand-no text-sm">{error}</p>
      </div>
    );
  }

  if (!market) {
    return (
      <div className="flex-1 p-6">
        <p className="text-brand-muted text-sm">Loading…</p>
      </div>
    );
  }

  if (!token) {
    return (
      <div className="flex-1 p-6">
        <p className="text-brand-no text-sm">Admin access required. Please log in.</p>
      </div>
    );
  }

  const totalStaked = parseFloat(market.total_yes) + parseFloat(market.total_no);
  const margin = totalStaked - parseFloat(market.reward_pool);

  return (
    <div className="flex-1 overflow-y-auto">
    <div className="mx-auto w-full max-w-4xl px-4 py-8 sm:px-6">
      <div className="mb-1 flex items-center gap-2 text-xs text-brand-subtle">
        <a href="/admin" className="hover:text-brand-text">Admin</a>
        <span>/</span>
        <span>Market Detail</span>
      </div>

      <div className="mb-4 flex items-center gap-3">
        <CategoryTag category={market.category} />
        <StatusBadge status={market.status} />
      </div>

      <h1 className="mb-4 text-xl font-bold leading-snug text-brand-text sm:text-2xl">
        {market.title}
      </h1>

      {/* Market stats */}
      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: "Reward Pool (R)", value: formatCurrency(market.reward_pool) },
          { label: "Total Staked (T)", value: formatCurrency(totalStaked) },
          { label: "Platform Margin", value: formatCurrency(margin), highlight: margin > 0 },
          { label: "Pool Filled", value: `${market.pool_fill_pct}%` },
        ].map((stat) => (
          <div key={stat.label} className="rounded-xl border border-brand-border bg-brand-surface p-3">
            <div className="text-xs text-brand-subtle">{stat.label}</div>
            <div className={`mt-1 font-semibold ${stat.highlight ? "text-brand-yes" : "text-brand-text"}`}>
              {stat.value}
            </div>
          </div>
        ))}
      </div>

      <div className="mb-4">
        <StakeSplitBar yesPct={parseFloat(market.yes_pct)} />
        <div className="mt-2 grid grid-cols-2 gap-3 text-sm">
          <div className="rounded-lg bg-brand-yes-muted px-3 py-2">
            <span className="font-medium text-brand-yes">YES {market.yes_pct}%</span>
            <span className="ml-2 text-brand-muted">{formatCurrency(market.total_yes)}</span>
          </div>
          <div className="rounded-lg bg-brand-no-muted px-3 py-2">
            <span className="font-medium text-brand-no">NO {market.no_pct}%</span>
            <span className="ml-2 text-brand-muted">{formatCurrency(market.total_no)}</span>
          </div>
        </div>
      </div>

      {market.closes_at && (
        <div className="mb-6 text-sm text-brand-subtle">
          Closed at: {formatDate(market.closes_at)}
        </div>
      )}

      {/* Settlement success */}
      {settled && (
        <div className="mb-6 rounded-xl border border-brand-yes/35 bg-brand-yes-muted p-4">
          <div className="font-semibold text-brand-yes">Market settled successfully</div>
          <div className="mt-1 text-sm text-brand-muted">
            {settled.total_winners} winner{settled.total_winners !== 1 ? "s" : ""} · {formatCurrency(settled.pool_distributed)} distributed · {formatCurrency(settled.platform_margin)} platform margin secured
          </div>
        </div>
      )}

      {/* Settlement panel — only shown when market is closed and not yet settled */}
      {market.status === "closed" && !settled && (
        <div className="mb-6">
          <h2 className="mb-3 text-lg font-semibold text-brand-text">Settle Market</h2>
          <SettlementPanel
            marketId={market.id}
            marketTitle={market.title}
            rewardPool={market.reward_pool}
            totalYes={market.total_yes}
            totalNo={market.total_no}
            onSettled={handleSettled}
          />
        </div>
      )}

      {/* Read-only settled summary */}
      {market.status === "settled" && market.settled_winning_side && (
        <div className="mb-6 rounded-xl border border-brand-amber/35 bg-brand-amber/10 p-4">
          <div className="font-semibold text-brand-amber">
            {market.settled_winning_side.toUpperCase()} won · {market.total_winners} winners · {formatCurrency(market.pool_distributed ?? "0")} distributed
          </div>
          {market.settlement_date && (
            <div className="mt-1 text-xs text-brand-subtle">Settled {formatDate(market.settlement_date)}</div>
          )}
        </div>
      )}

      <div>
        <h2 className="mb-2 text-lg font-semibold text-brand-text">Recent activity</h2>
        <ActivityFeed activity={market.recent_activity} />
      </div>
    </div>
    </div>
  );
}
