"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Lock, Calculator, ChevronRight } from "lucide-react";
import { cn, formatCurrency } from "@/lib/utils";
import { getToken } from "@/lib/auth";
import { createMarket, ApiError } from "@/lib/api";

const CATEGORIES = ["football", "politics", "finance", "entertainment", "other"] as const;

export default function NewMarketPage() {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState<string>("football");
  const [rewardPool, setRewardPool] = useState("");
  const [closesAt, setClosesAt] = useState("");
  const [resolvesAt, setResolvesAt] = useState("");
  const [resolutionCriteria, setResolutionCriteria] = useState("");
  const [resolutionSource, setResolutionSource] = useState("");

  // Margin calculator
  const [expectedTotal, setExpectedTotal] = useState("");
  const suggestedPool =
    expectedTotal && parseFloat(expectedTotal) > 0
      ? parseFloat(expectedTotal) * 0.833
      : null;
  const marginPct =
    rewardPool && expectedTotal && parseFloat(expectedTotal) > 0
      ? ((parseFloat(expectedTotal) - parseFloat(rewardPool)) / parseFloat(expectedTotal)) * 100
      : null;

  async function handleSubmit(publish: boolean) {
    const token = getToken();
    if (!token) { setError("Not authenticated."); return; }
    if (!title.trim()) { setError("Title is required."); return; }
    if (!category) { setError("Category is required."); return; }
    const poolNum = parseFloat(rewardPool);
    if (!rewardPool || poolNum <= 0) { setError("Reward pool must be greater than zero."); return; }

    setSubmitting(true);
    setError(null);
    try {
      const result = await createMarket(token, {
        title: title.trim(),
        description: description.trim() || undefined,
        category,
        reward_pool: poolNum,
        closes_at: closesAt || undefined,
        resolves_at: resolvesAt || undefined,
        resolution_criteria: resolutionCriteria.trim() || undefined,
        resolution_source: resolutionSource.trim() || undefined,
        publish,
      });
      router.push(`/admin/markets/${result.market_id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to create market.");
      setSubmitting(false);
    }
  }

  const previewFillPct = 0;
  const poolDisplay = rewardPool ? formatCurrency(parseFloat(rewardPool) || 0) : "₦0.00";

  return (
    <div className="flex-1 overflow-y-auto p-6">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-1 text-xs text-brand-subtle mb-4">
        <a href="/admin" className="hover:text-brand-text">Admin</a>
        <ChevronRight size={11} />
        <a href="/admin/markets" className="hover:text-brand-text">Markets</a>
        <ChevronRight size={11} />
        <span className="text-brand-yes">New</span>
      </nav>

      <h1 className="text-xl font-bold text-brand-text mb-6">Create New Market</h1>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6">
        {/* Form */}
        <div className="rounded-xl border border-brand-border bg-brand-surface p-6 space-y-5">
          {/* Title */}
          <div>
            <label className="block text-xs font-semibold text-brand-subtle uppercase tracking-wider mb-1.5">
              Market Title <span className="text-brand-no">*</span>
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Will Nigeria win the next AFCON?"
              className="w-full bg-brand-input border border-brand-border rounded-lg px-3 py-2.5 text-sm text-brand-text placeholder-brand-subtle focus:border-brand-yes focus:outline-none focus:ring-1 focus:ring-brand-yes"
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-xs font-semibold text-brand-subtle uppercase tracking-wider mb-1.5">
              Description
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              placeholder="Optional context for participants…"
              className="w-full bg-brand-input border border-brand-border rounded-lg px-3 py-2.5 text-sm text-brand-text placeholder-brand-subtle focus:border-brand-yes focus:outline-none focus:ring-1 focus:ring-brand-yes resize-none"
            />
          </div>

          {/* Category + Reward Pool */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-brand-subtle uppercase tracking-wider mb-1.5">
                Category <span className="text-brand-no">*</span>
              </label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full bg-brand-input border border-brand-border rounded-lg px-3 py-2.5 text-sm text-brand-text focus:border-brand-yes focus:outline-none focus:ring-1 focus:ring-brand-yes"
              >
                {CATEGORIES.map((c) => (
                  <option key={c} value={c} className="capitalize">{c.charAt(0).toUpperCase() + c.slice(1)}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-brand-subtle uppercase tracking-wider mb-1.5">
                Reward Pool (₦) <span className="text-brand-no">*</span>
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-brand-yes text-sm font-semibold">₦</span>
                <input
                  type="number"
                  value={rewardPool}
                  onChange={(e) => setRewardPool(e.target.value)}
                  placeholder="833000"
                  min="1"
                  className="w-full bg-brand-input border border-brand-border rounded-lg pl-7 pr-3 py-2.5 text-sm text-brand-text placeholder-brand-subtle focus:border-brand-yes focus:outline-none focus:ring-1 focus:ring-brand-yes"
                />
              </div>
              <p className="text-[10px] text-brand-subtle mt-1">Fixed payouts capped at this amount</p>
            </div>
          </div>

          {/* Margin calculator */}
          <div className="rounded-lg bg-brand-yes/5 border border-brand-yes/20 p-3 space-y-2">
            <div className="flex items-center gap-2 text-xs font-semibold text-brand-yes">
              <Calculator size={13} />
              Margin Calculator
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-brand-muted whitespace-nowrap">Expected total stakes (₦)</span>
              <input
                type="number"
                value={expectedTotal}
                onChange={(e) => setExpectedTotal(e.target.value)}
                placeholder="1000000"
                className="flex-1 bg-brand-input border border-brand-border rounded px-2 py-1 text-xs text-brand-text placeholder-brand-subtle focus:border-brand-yes focus:outline-none"
              />
            </div>
            {suggestedPool && (
              <p className="text-xs text-brand-muted">
                Suggested pool:{" "}
                <button
                  type="button"
                  onClick={() => setRewardPool(Math.round(suggestedPool).toString())}
                  className="text-brand-yes font-semibold hover:underline"
                >
                  {formatCurrency(suggestedPool)}
                </button>{" "}
                for 16.7% margin
              </p>
            )}
            {marginPct !== null && (
              <p className="text-xs">
                <span className="text-brand-muted">Current margin: </span>
                <span className={cn("font-semibold", marginPct >= 10 ? "text-brand-yes" : "text-brand-no")}>
                  {marginPct.toFixed(1)}%
                </span>
                {marginPct < 10 && (
                  <span className="text-brand-no ml-1">(below 10% — consider increasing pool)</span>
                )}
              </p>
            )}
          </div>

          {/* Dates */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-brand-subtle uppercase tracking-wider mb-1.5">
                Market Closes At
              </label>
              <input
                type="datetime-local"
                value={closesAt}
                onChange={(e) => setClosesAt(e.target.value)}
                className="w-full bg-brand-input border border-brand-border rounded-lg px-3 py-2.5 text-sm text-brand-text focus:border-brand-yes focus:outline-none focus:ring-1 focus:ring-brand-yes"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-brand-subtle uppercase tracking-wider mb-1.5">
                Resolution Date
              </label>
              <input
                type="datetime-local"
                value={resolvesAt}
                onChange={(e) => setResolvesAt(e.target.value)}
                className="w-full bg-brand-input border border-brand-border rounded-lg px-3 py-2.5 text-sm text-brand-text focus:border-brand-yes focus:outline-none focus:ring-1 focus:ring-brand-yes"
              />
            </div>
          </div>

          {/* Resolution criteria */}
          <div>
            <label className="block text-xs font-semibold text-brand-subtle uppercase tracking-wider mb-1.5">
              Resolution Criteria
            </label>
            <textarea
              value={resolutionCriteria}
              onChange={(e) => setResolutionCriteria(e.target.value)}
              rows={3}
              placeholder="Describe exactly how this market will be settled. Specify conditions for YES and NO outcomes…"
              className="w-full bg-brand-input border border-brand-border rounded-lg px-3 py-2.5 text-sm text-brand-text placeholder-brand-subtle focus:border-brand-yes focus:outline-none focus:ring-1 focus:ring-brand-yes resize-none"
            />
          </div>

          {/* Resolution source */}
          <div>
            <label className="block text-xs font-semibold text-brand-subtle uppercase tracking-wider mb-1.5">
              Resolution Source
            </label>
            <input
              type="text"
              value={resolutionSource}
              onChange={(e) => setResolutionSource(e.target.value)}
              placeholder="e.g. Official CAF website, BBC Sport"
              className="w-full bg-brand-input border border-brand-border rounded-lg px-3 py-2.5 text-sm text-brand-text placeholder-brand-subtle focus:border-brand-yes focus:outline-none focus:ring-1 focus:ring-brand-yes"
            />
          </div>

          {/* Auto-close notice (locked ON) */}
          <div className="flex items-center justify-between p-3 bg-brand-input rounded-lg border border-brand-border">
            <div className="flex items-center gap-2.5">
              <Lock size={15} className="text-brand-yes shrink-0" />
              <div>
                <p className="text-sm font-medium text-brand-text">Auto-close when T ≥ R</p>
                <p className="text-xs text-brand-subtle">Locks market when pool is fully funded</p>
              </div>
            </div>
            <div className="w-9 h-5 bg-brand-yes rounded-full relative opacity-60 cursor-not-allowed">
              <div className="absolute right-0.5 top-0.5 w-4 h-4 bg-white rounded-full" />
            </div>
          </div>

          {/* Error */}
          {error && (
            <div className="rounded-lg bg-brand-no/10 border border-brand-no/30 px-4 py-3 text-sm text-brand-no">
              {error}
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-3 pt-1">
            <button
              type="button"
              disabled={submitting}
              onClick={() => handleSubmit(false)}
              className="flex-1 py-2.5 rounded-lg border border-brand-border text-brand-text text-sm font-semibold hover:bg-white/5 transition-colors disabled:opacity-40"
            >
              {submitting ? "Saving…" : "Save as Draft"}
            </button>
            <button
              type="button"
              disabled={submitting}
              onClick={() => handleSubmit(true)}
              className="flex-1 py-2.5 rounded-lg bg-brand-yes text-white text-sm font-semibold hover:brightness-110 transition-all disabled:opacity-40"
            >
              {submitting ? "Publishing…" : "Publish Market"}
            </button>
          </div>
        </div>

        {/* Live preview card */}
        <div className="hidden lg:block">
          <p className="text-[10px] text-brand-subtle uppercase tracking-widest mb-3">Market Preview</p>
          <div className="rounded-xl border border-brand-border bg-brand-surface overflow-hidden">
            <div className="p-4">
              <div className="mb-1">
                <span
                  className={cn(
                    "text-[10px] font-bold uppercase px-2 py-0.5 rounded-full",
                    category === "football" ? "bg-brand-amber/20 text-brand-amber" :
                    category === "politics" ? "bg-blue-500/20 text-blue-400" :
                    category === "finance"  ? "bg-purple-500/20 text-purple-400" :
                    category === "entertainment" ? "bg-pink-500/20 text-pink-400" :
                    "bg-brand-muted/20 text-brand-muted"
                  )}
                >
                  {category}
                </span>
              </div>
              <h3 className="text-sm font-semibold text-brand-text mt-2 leading-snug">
                {title || "Your market title will appear here"}
              </h3>
              <div className="mt-3 flex justify-between text-xs text-brand-muted">
                <span>YES 50%</span>
                <span>NO 50%</span>
              </div>
              <div className="mt-1.5 h-1.5 bg-brand-input rounded-full overflow-hidden flex">
                <div className="h-full bg-brand-yes w-1/2 rounded-l-full" />
                <div className="h-full bg-brand-no w-1/2 rounded-r-full" />
              </div>
              <div className="mt-3 flex justify-between text-xs">
                <span className="text-brand-muted">Reward Pool</span>
                <span className="font-semibold text-brand-yes">{poolDisplay}</span>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2 p-4 pt-0">
              <div className="rounded-lg bg-brand-yes-muted border border-brand-yes/30 py-2 text-center text-xs font-bold text-brand-yes">YES</div>
              <div className="rounded-lg bg-brand-no-muted border border-brand-no/30 py-2 text-center text-xs font-bold text-brand-no">NO</div>
            </div>
          </div>
          <div className="mt-3 rounded-lg bg-brand-input border border-brand-border p-3">
            <p className="text-xs text-brand-yes font-semibold mb-1">Deployment Note</p>
            <p className="text-[11px] text-brand-muted leading-relaxed">
              Once published, the reward pool and closing dates can only be modified via an admin audit request to maintain market integrity.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
