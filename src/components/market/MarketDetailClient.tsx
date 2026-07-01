"use client";

import { useEffect, useState } from "react";
import { CategoryTag } from "./CategoryTag";
import { StatusBadge } from "./StatusBadge";
import { StakeSplitBar } from "./StakeSplitBar";
import { CountdownTimer } from "./CountdownTimer";
import { StakePanel } from "./StakePanel";
import { ActivityFeed } from "./ActivityFeed";
import { formatCurrency } from "@/lib/utils";
import { getMarket, getMyStakeForMarket, type MarketDetail, type UserStake } from "@/lib/api";
import { getToken } from "@/lib/auth";

const POLL_INTERVAL_MS = 5000;

export function MarketDetailClient({ initialMarket }: { initialMarket: MarketDetail }) {
  const [market, setMarket] = useState<MarketDetail>(initialMarket);
  const [myStake, setMyStake] = useState<UserStake | null | "loading">("loading");

  // Fetch the current user's stake on this market (once, on mount)
  useEffect(() => {
    const token = getToken();
    if (!token) { setMyStake(null); return; }
    getMyStakeForMarket(token, initialMarket.id)
      .then((res) => setMyStake(res.stakes[0] ?? null))
      .catch(() => setMyStake(null));
  }, [initialMarket.id]);

  // Poll for live market data updates every 5s
  useEffect(() => {
    let cancelled = false;
    const interval = setInterval(() => {
      getMarket(initialMarket.id)
        .then((m) => !cancelled && setMarket(m))
        .catch(() => null);
    }, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [initialMarket.id]);

  const yesPct = parseFloat(market.yes_pct);

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_320px]">
      <div>
        <div className="mb-3 flex items-center gap-2">
          <CategoryTag category={market.category} />
          <StatusBadge status={market.status} />
        </div>

        <h1 className="text-2xl font-bold leading-snug text-brand-text sm:text-3xl">{market.title}</h1>
        {market.description && <p className="mt-2 text-sm leading-relaxed text-brand-muted">{market.description}</p>}

        <div className="mt-6 rounded-xl border border-brand-border bg-brand-surface p-4">
          <StakeSplitBar yesPct={yesPct} />
          <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
            <div className="rounded-lg bg-brand-yes-muted px-3 py-2">
              <div className="font-medium text-brand-yes">YES {market.yes_pct}%</div>
              <div className="text-xs text-brand-muted">{formatCurrency(market.total_yes)} staked</div>
            </div>
            <div className="rounded-lg bg-brand-no-muted px-3 py-2">
              <div className="font-medium text-brand-no">NO {market.no_pct}%</div>
              <div className="text-xs text-brand-muted">{formatCurrency(market.total_no)} staked</div>
            </div>
          </div>
          <div className="mt-3 flex items-center justify-between text-xs text-brand-subtle">
            <span>Reward pool {formatCurrency(market.reward_pool)} · {market.pool_fill_pct}% filled</span>
            <CountdownTimer closesAt={market.closes_at} />
          </div>
        </div>

        {/* Settlement outcome banner */}
        {market.status === "settled" && market.settled_winning_side && (
          <div className="mt-4 rounded-xl border border-brand-amber/35 bg-brand-amber/10 p-4 text-sm">
            <span className="font-semibold text-brand-amber">
              {market.settled_winning_side.toUpperCase()} won
            </span>
            <span className="ml-2 text-brand-muted">
              {market.total_winners} winners · {formatCurrency(market.pool_distributed ?? "0")} distributed
            </span>
          </div>
        )}

        {/* Personal outcome card — shown once market is settled and user had a stake */}
        {market.status === "settled" &&
          myStake &&
          myStake !== "loading" &&
          myStake.is_winner !== null && (
          <div
            className={
              myStake.is_winner
                ? "mt-3 rounded-xl border border-brand-yes/35 bg-brand-yes-muted p-4"
                : "mt-3 rounded-xl border border-brand-border bg-brand-surface p-4"
            }
          >
            {myStake.is_winner ? (
              <>
                <div className="font-semibold text-brand-yes">
                  You won {formatCurrency(myStake.actual_payout ?? "0")} — credited to your wallet
                </div>
                <div className="mt-1 text-xs text-brand-muted">
                  Your {myStake.side.toUpperCase()} stake of {formatCurrency(myStake.amount)} · return {formatCurrency((parseFloat(myStake.actual_payout ?? "0") - parseFloat(myStake.amount)).toFixed(2))}
                </div>
              </>
            ) : (
              <>
                <div className="font-medium text-brand-muted">Better luck next time.</div>
                <div className="mt-1 text-xs text-brand-subtle">
                  You staked {formatCurrency(myStake.amount)} on {myStake.side.toUpperCase()} · {market.settled_winning_side?.toUpperCase()} won
                </div>
              </>
            )}
          </div>
        )}

        <div className="mt-6">
          <h2 className="mb-2 text-lg font-semibold text-brand-text">Recent activity</h2>
          <ActivityFeed activity={market.recent_activity} />
        </div>
      </div>

      <div>
        <StakePanel marketId={market.id} status={market.status} />
      </div>
    </div>
  );
}
