"use client";

import { useEffect, useState } from "react";
import { getPayoutPreview } from "@/lib/api";
import { formatCurrency } from "@/lib/utils";

export function PayoutCalculator({
  marketId,
  amount,
  active,
}: {
  marketId: string;
  amount: number;
  active: boolean;
}) {
  const [yesPayout, setYesPayout] = useState<string | null>(null);
  const [noPayout, setNoPayout] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!active || !amount || amount <= 0) {
      setYesPayout(null);
      setNoPayout(null);
      return;
    }

    setLoading(true);
    const handle = setTimeout(() => {
      Promise.all([
        getPayoutPreview(marketId, amount, "yes").catch(() => null),
        getPayoutPreview(marketId, amount, "no").catch(() => null),
      ])
        .then(([yes, no]) => {
          setYesPayout(yes?.expected_payout ?? null);
          setNoPayout(no?.expected_payout ?? null);
        })
        .finally(() => setLoading(false));
    }, 300);

    return () => clearTimeout(handle);
  }, [marketId, amount, active]);

  if (!active || !amount || amount <= 0) return null;

  return (
    <div className="mt-3 space-y-1.5 text-sm">
      <div className="flex items-center justify-between rounded-lg bg-brand-yes-muted px-3 py-2">
        <span className="text-brand-yes">If YES wins</span>
        <span className="font-medium text-brand-text">
          {loading || yesPayout === null ? "…" : formatCurrency(yesPayout)}
        </span>
      </div>
      <div className="flex items-center justify-between rounded-lg bg-brand-no-muted px-3 py-2">
        <span className="text-brand-no">If NO wins</span>
        <span className="font-medium text-brand-text">
          {loading || noPayout === null ? "…" : formatCurrency(noPayout)}
        </span>
      </div>
    </div>
  );
}
