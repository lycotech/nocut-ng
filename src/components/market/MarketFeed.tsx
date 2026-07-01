"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { getMarkets, type Market, type MarketCategory } from "@/lib/api";
import { MarketCard } from "./MarketCard";

const TABS: Array<{ value: MarketCategory | "all"; label: string }> = [
  { value: "all", label: "All" },
  { value: "football", label: "Football" },
  { value: "politics", label: "Politics" },
  { value: "finance", label: "Finance" },
  { value: "entertainment", label: "Entertainment" },
];

const POLL_INTERVAL_MS = 5000;

export function MarketFeed({ initialMarkets }: { initialMarkets: Market[] }) {
  const [category, setCategory] = useState<MarketCategory | "all">("all");
  const [markets, setMarkets] = useState<Market[]>(initialMarkets);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function fetchMarkets() {
      try {
        const res = await getMarkets(category);
        if (!cancelled) setMarkets(res.markets);
      } catch {
        // Keep showing last known markets on transient fetch failure
      }
    }

    setLoading(true);
    fetchMarkets().finally(() => !cancelled && setLoading(false));

    const interval = setInterval(fetchMarkets, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [category]);

  return (
    <div>
      <div className="mb-4 flex gap-2 overflow-x-auto pb-1">
        {TABS.map((tab) => (
          <button
            key={tab.value}
            type="button"
            onClick={() => setCategory(tab.value)}
            className={cn(
              "h-11 shrink-0 rounded-full px-4 text-sm font-medium transition-colors",
              category === tab.value
                ? "bg-brand-amber text-brand-bg"
                : "border border-white/15 text-brand-muted hover:border-white/30 hover:text-brand-text"
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {markets.length === 0 ? (
        <div className="rounded-xl border border-brand-border bg-brand-surface p-8 text-center text-sm text-brand-muted">
          {loading ? "Loading markets…" : "No active markets in this category yet. Check back soon."}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {markets.map((market) => (
            <MarketCard key={market.id} market={market} />
          ))}
        </div>
      )}
    </div>
  );
}
