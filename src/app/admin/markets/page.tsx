"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Search, Plus, RefreshCw } from "lucide-react";
import { cn, formatCurrency, formatDate } from "@/lib/utils";
import { getToken } from "@/lib/auth";
import { getAdminMarkets, type AdminMarket } from "@/lib/api";
import { StatusBadge } from "@/components/market/StatusBadge";
import { CategoryTag } from "@/components/market/CategoryTag";

type FilterStatus = "all" | "draft" | "active" | "closed" | "settled";

const FILTER_TABS: { label: string; value: FilterStatus }[] = [
  { label: "All", value: "all" },
  { label: "Active", value: "active" },
  { label: "Closed", value: "closed" },
  { label: "Draft", value: "draft" },
  { label: "Settled", value: "settled" },
];

export default function AdminMarketsPage() {
  const [markets, setMarkets] = useState<AdminMarket[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterStatus>("all");
  const [search, setSearch] = useState("");

  function load() {
    const token = getToken();
    if (!token) return;
    setLoading(true);
    getAdminMarkets(token)
      .then((res) => setMarkets(res.markets))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }

  useEffect(() => { load(); }, []);

  const filtered = markets.filter((m) => {
    if (filter !== "all" && m.status !== filter) return false;
    if (search && !m.title.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  return (
    <div className="flex-1 overflow-y-auto p-6 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-brand-text">Markets</h1>
          <p className="text-xs text-brand-muted mt-0.5">{markets.length} total markets</p>
        </div>
        <Link
          href="/admin/markets/new"
          className="flex items-center gap-2 px-4 py-2 bg-brand-yes text-white text-sm font-semibold rounded-lg hover:brightness-110 transition-all"
        >
          <Plus size={15} />
          New Market
        </Link>
      </div>

      {/* Filters + search */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="flex gap-1 bg-brand-surface border border-brand-border rounded-lg p-1 flex-wrap">
          {FILTER_TABS.map((tab) => (
            <button
              key={tab.value}
              onClick={() => setFilter(tab.value)}
              className={cn(
                "px-3 py-1 text-xs rounded-md font-medium transition-colors",
                filter === tab.value
                  ? "bg-brand-yes text-white"
                  : "text-brand-muted hover:text-brand-text"
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="relative flex-1 max-w-xs">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-brand-subtle" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search markets…"
            className="w-full bg-brand-input border border-brand-border rounded-lg pl-8 pr-3 py-2 text-sm text-brand-text placeholder-brand-subtle focus:border-brand-yes focus:outline-none focus:ring-1 focus:ring-brand-yes"
          />
        </div>

        <button
          onClick={load}
          className="flex items-center gap-1.5 px-3 py-2 text-xs text-brand-muted border border-brand-border rounded-lg hover:bg-white/5 transition-colors"
        >
          <RefreshCw size={13} />
          Refresh
        </button>
      </div>

      {/* Table */}
      <div className="rounded-xl border border-brand-border bg-brand-surface overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-brand-muted text-sm">Loading…</div>
        ) : error ? (
          <div className="p-8 text-center text-brand-no text-sm">{error}</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead>
                <tr className="bg-brand-input text-brand-subtle text-xs uppercase tracking-wider">
                  <th className="px-5 py-3">Title</th>
                  <th className="px-5 py-3">Category</th>
                  <th className="px-5 py-3">Reward Pool</th>
                  <th className="px-5 py-3">YES Stakes</th>
                  <th className="px-5 py-3">NO Stakes</th>
                  <th className="px-5 py-3">Status</th>
                  <th className="px-5 py-3">Closes At</th>
                  <th className="px-5 py-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-brand-border">
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-5 py-10 text-center text-brand-muted">
                      No markets match this filter
                    </td>
                  </tr>
                ) : (
                  filtered.map((m) => (
                    <tr key={m.id} className="hover:bg-white/[0.02] transition-colors">
                      <td className="px-5 py-3 text-brand-text font-medium max-w-[200px] truncate">{m.title}</td>
                      <td className="px-5 py-3"><CategoryTag category={m.category} /></td>
                      <td className="px-5 py-3 text-brand-muted">{formatCurrency(m.reward_pool)}</td>
                      <td className="px-5 py-3 text-brand-yes">{formatCurrency(m.total_yes)}</td>
                      <td className="px-5 py-3 text-brand-no">{formatCurrency(m.total_no)}</td>
                      <td className="px-5 py-3"><StatusBadge status={m.status} /></td>
                      <td className="px-5 py-3 text-brand-subtle text-xs">
                        {m.closes_at ? formatDate(m.closes_at) : "—"}
                      </td>
                      <td className="px-5 py-3 text-right">
                        <Link
                          href={`/admin/markets/${m.id}`}
                          className={cn(
                            "text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors inline-block",
                            m.status === "closed"
                              ? "bg-brand-amber text-brand-bg hover:bg-brand-amber-hover"
                              : "text-brand-yes hover:underline"
                          )}
                        >
                          {m.status === "closed" ? "Resolve" : "View"}
                        </Link>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
