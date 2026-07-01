"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { TrendingUp, Store, Users, Wallet, Plus, ChevronRight, Activity, BarChart3 } from "lucide-react";
import { cn, formatCurrency, formatDate } from "@/lib/utils";
import { getToken } from "@/lib/auth";
import {
  getAdminStats,
  getAdminMarginHistory,
  getAdminMarkets,
  type AdminStats,
  type AdminMarket,
} from "@/lib/api";
import { StatusBadge } from "@/components/market/StatusBadge";
import { CategoryTag } from "@/components/market/CategoryTag";

export default function AdminDashboard() {
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [history, setHistory] = useState<{ label: string; daily_margin: string }[]>([]);
  const [markets, setMarkets] = useState<AdminMarket[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const token = getToken();
    if (!token) return;
    Promise.all([
      getAdminStats(token),
      getAdminMarginHistory(token),
      getAdminMarkets(token),
    ])
      .then(([s, h, m]) => {
        setStats(s);
        setHistory(h.history);
        setMarkets(m.markets);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  const maxMargin = history.reduce((max, h) => Math.max(max, parseFloat(h.daily_margin)), 0) || 1;
  const relevantMarkets = markets.filter((m) => ["active", "closed"].includes(m.status));

  if (loading) {
    return <div className="flex-1 p-6 text-brand-muted text-sm">Loading dashboard…</div>;
  }
  if (error) {
    return <div className="flex-1 p-6 text-brand-no text-sm">{error}</div>;
  }

  return (
    <div className="flex-1 overflow-y-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-brand-text">Admin Dashboard</h1>
          <p className="text-xs text-brand-muted mt-0.5">Platform overview · {formatDate(new Date().toISOString())}</p>
        </div>
        <Link
          href="/admin/markets/new"
          className="flex items-center gap-2 px-4 py-2 bg-brand-yes text-white text-sm font-semibold rounded-lg hover:brightness-110 transition-all"
        >
          <Plus size={15} />
          New Market
        </Link>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="rounded-xl border border-brand-border bg-brand-surface p-4">
          <div className="flex items-start justify-between mb-3">
            <span className="text-xs text-brand-muted">Pool Revenue (this month)</span>
            <TrendingUp size={17} className="text-brand-yes shrink-0" />
          </div>
          <div className="text-xl font-bold text-brand-text">{formatCurrency(stats?.monthly_margin ?? "0")}</div>
          <div className="text-xs text-brand-yes mt-1">Platform margin locked</div>
        </div>

        <div className="rounded-xl border border-brand-border bg-brand-surface p-4">
          <div className="flex items-start justify-between mb-3">
            <span className="text-xs text-brand-muted">Active Markets</span>
            <Store size={17} className="text-brand-muted shrink-0" />
          </div>
          <div className="text-xl font-bold text-brand-text">{stats?.active_markets ?? 0}</div>
          <div className="text-xs text-brand-muted mt-1">Across all categories</div>
        </div>

        <div className="rounded-xl border border-brand-border bg-brand-surface p-4">
          <div className="flex items-start justify-between mb-3">
            <span className="text-xs text-brand-muted">Registered Users</span>
            <Users size={17} className="text-brand-muted shrink-0" />
          </div>
          <div className="text-xl font-bold text-brand-text">
            {(stats?.registered_users ?? 0).toLocaleString()}
          </div>
          <div className="text-xs text-brand-muted mt-1">Total accounts</div>
        </div>

        <div
          className={cn(
            "rounded-xl border p-4",
            (stats?.pending_withdrawals ?? 0) > 0
              ? "border-brand-amber/30 bg-brand-amber/5"
              : "border-brand-border bg-brand-surface"
          )}
        >
          <div className="flex items-start justify-between mb-3">
            <span
              className={cn(
                "text-xs",
                (stats?.pending_withdrawals ?? 0) > 0 ? "text-brand-amber font-semibold" : "text-brand-muted"
              )}
            >
              Pending Withdrawals
            </span>
            <Wallet
              size={17}
              className={cn(
                "shrink-0",
                (stats?.pending_withdrawals ?? 0) > 0 ? "text-brand-amber" : "text-brand-muted"
              )}
            />
          </div>
          <div className="text-xl font-bold text-brand-text">{stats?.pending_withdrawals ?? 0}</div>
          {(stats?.pending_withdrawals ?? 0) > 0 ? (
            <Link
              href="/admin/withdrawals"
              className="text-xs text-brand-amber mt-1 flex items-center gap-1 animate-pulse"
            >
              Action required <ChevronRight size={11} />
            </Link>
          ) : (
            <div className="text-xs text-brand-muted mt-1">All clear</div>
          )}
        </div>
      </div>

      {/* Chart + Quick Actions */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Bar chart */}
        <div className="lg:col-span-2 rounded-xl border border-brand-border bg-brand-surface p-5">
          <div className="flex items-center justify-between mb-5">
            <div>
              <h2 className="text-sm font-semibold text-brand-text">Daily Pool Margin</h2>
              <p className="text-xs text-brand-muted">Last 30 days platform revenue</p>
            </div>
            <BarChart3 size={17} className="text-brand-muted" />
          </div>
          {history.length === 0 ? (
            <div className="h-36 flex items-center justify-center text-brand-muted text-sm">
              No settled markets yet
            </div>
          ) : (
            <>
              <div className="h-36 flex items-end gap-0.5">
                {history.map((h, i) => {
                  const pct = (parseFloat(h.daily_margin) / maxMargin) * 100;
                  return (
                    <div
                      key={i}
                      title={`${h.label}: ${formatCurrency(h.daily_margin)}`}
                      className="flex-1 bg-brand-yes/20 hover:bg-brand-yes/50 transition-colors rounded-t-sm cursor-default"
                      style={{ height: `${Math.max(pct, 3)}%` }}
                    />
                  );
                })}
              </div>
              <div className="flex justify-between mt-2 text-[10px] text-brand-subtle">
                <span>{history[0]?.label}</span>
                {history.length > 2 && <span>{history[Math.floor(history.length / 2)]?.label}</span>}
                <span>{history[history.length - 1]?.label}</span>
              </div>
            </>
          )}
        </div>

        {/* Quick actions */}
        <div className="rounded-xl border border-brand-border bg-brand-surface p-5">
          <h2 className="text-sm font-semibold text-brand-text mb-4">Quick Actions</h2>
          <div className="space-y-2">
            {[
              { href: "/admin/markets/new", label: "Create new market",    icon: Plus },
              { href: "/admin/withdrawals", label: "Review withdrawals",   icon: Wallet },
              { href: "/admin/users",       label: "Manage users",         icon: Users },
              { href: "/admin/audit",       label: "View audit log",       icon: Activity },
            ].map(({ href, label, icon: Icon }) => (
              <Link
                key={href}
                href={href}
                className="flex items-center justify-between p-3 rounded-lg bg-brand-input hover:bg-white/10 transition-colors group"
              >
                <div className="flex items-center gap-2.5">
                  <Icon size={14} className="text-brand-yes" />
                  <span className="text-sm text-brand-muted group-hover:text-brand-text transition-colors">{label}</span>
                </div>
                <ChevronRight size={13} className="text-brand-subtle group-hover:text-brand-muted" />
              </Link>
            ))}
          </div>
        </div>
      </div>

      {/* Markets table */}
      <div className="rounded-xl border border-brand-border bg-brand-surface overflow-hidden">
        <div className="px-5 py-4 border-b border-brand-border flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold text-brand-text">Active Market Management</h2>
            <p className="text-xs text-brand-muted">Live trading status and resolution queue</p>
          </div>
          <Link href="/admin/markets" className="text-xs text-brand-yes hover:underline">
            View all
          </Link>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead>
              <tr className="bg-brand-input text-brand-subtle text-xs uppercase tracking-wider">
                <th className="px-5 py-3">Title</th>
                <th className="px-5 py-3">Category</th>
                <th className="px-5 py-3">Pool</th>
                <th className="px-5 py-3">Fill %</th>
                <th className="px-5 py-3">Status</th>
                <th className="px-5 py-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-brand-border">
              {relevantMarkets.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-5 py-8 text-center text-brand-muted text-sm">
                    No active or closed markets
                  </td>
                </tr>
              ) : (
                relevantMarkets.map((m) => {
                  const totalStaked = parseFloat(m.total_yes) + parseFloat(m.total_no);
                  const fillPct =
                    parseFloat(m.reward_pool) > 0
                      ? Math.min(100, Math.round((totalStaked / parseFloat(m.reward_pool)) * 100))
                      : 0;
                  return (
                    <tr key={m.id} className="hover:bg-white/[0.02] transition-colors">
                      <td className="px-5 py-3 text-brand-text font-medium max-w-[220px] truncate">{m.title}</td>
                      <td className="px-5 py-3"><CategoryTag category={m.category} /></td>
                      <td className="px-5 py-3 text-brand-muted">{formatCurrency(m.reward_pool)}</td>
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-2">
                          <div className="w-16 h-1.5 bg-brand-input rounded-full overflow-hidden">
                            <div
                              className="h-full bg-brand-yes rounded-full"
                              style={{ width: `${fillPct}%` }}
                            />
                          </div>
                          <span className="text-xs text-brand-muted">{fillPct}%</span>
                        </div>
                      </td>
                      <td className="px-5 py-3"><StatusBadge status={m.status} /></td>
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
                          {m.status === "closed" ? "Resolve" : "Manage"}
                        </Link>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
