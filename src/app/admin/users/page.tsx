"use client";

import { useEffect, useState, useCallback } from "react";
import { Search, RefreshCw, Users, Shield, BadgeCheck, Ban } from "lucide-react";
import { cn, formatCurrency, formatDate } from "@/lib/utils";
import { getToken } from "@/lib/auth";
import { getAdminUsers, type AdminUser } from "@/lib/api";

function KycBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    verified:   { label: "Verified",   cls: "bg-brand-yes/10 text-brand-yes border-brand-yes/30" },
    pending:    { label: "Pending",    cls: "bg-brand-amber/10 text-brand-amber border-brand-amber/30" },
    unverified: { label: "Unverified", cls: "bg-brand-input text-brand-muted border-brand-border" },
    rejected:   { label: "Rejected",   cls: "bg-brand-no/10 text-brand-no border-brand-no/30" },
  };
  const cfg = map[status] ?? map.unverified;
  return (
    <span className={cn("text-[10px] font-semibold px-2 py-0.5 rounded-full border", cfg.cls)}>
      {cfg.label}
    </span>
  );
}

export default function AdminUsersPage() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [pagination, setPagination] = useState({ page: 1, total: 0, total_pages: 1 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  const load = useCallback((q?: string, p = 1) => {
    const token = getToken();
    if (!token) return;
    setLoading(true);
    getAdminUsers(token, q, p)
      .then((res) => {
        setUsers(res.users);
        setPagination(res.pagination);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  function handleSearch(q: string) {
    setSearch(q);
    setPage(1);
    load(q, 1);
  }

  function handlePage(p: number) {
    setPage(p);
    load(search, p);
  }

  return (
    <div className="flex-1 overflow-y-auto p-6 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-brand-text">Users</h1>
          <p className="text-xs text-brand-muted mt-0.5">{pagination.total.toLocaleString()} total accounts</p>
        </div>
        <button
          onClick={() => load(search, page)}
          className="flex items-center gap-1.5 px-3 py-2 text-xs text-brand-muted border border-brand-border rounded-lg hover:bg-white/5 transition-colors"
        >
          <RefreshCw size={13} />
          Refresh
        </button>
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-brand-subtle" />
        <input
          type="text"
          value={search}
          onChange={(e) => handleSearch(e.target.value)}
          placeholder="Search by name, email or phone…"
          className="w-full bg-brand-input border border-brand-border rounded-lg pl-8 pr-3 py-2 text-sm text-brand-text placeholder-brand-subtle focus:border-brand-yes focus:outline-none focus:ring-1 focus:ring-brand-yes"
        />
      </div>

      {/* Table */}
      <div className="rounded-xl border border-brand-border bg-brand-surface overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-brand-muted text-sm">Loading…</div>
        ) : error ? (
          <div className="p-8 text-center text-brand-no text-sm">{error}</div>
        ) : users.length === 0 ? (
          <div className="p-12 text-center">
            <Users size={32} className="text-brand-subtle mx-auto mb-3" />
            <p className="text-brand-muted text-sm">No users found</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead>
                <tr className="bg-brand-input text-brand-subtle text-xs uppercase tracking-wider">
                  <th className="px-5 py-3">User</th>
                  <th className="px-5 py-3">KYC</th>
                  <th className="px-5 py-3">Wallet</th>
                  <th className="px-5 py-3">Stakes</th>
                  <th className="px-5 py-3">Flags</th>
                  <th className="px-5 py-3">Joined</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-brand-border">
                {users.map((u) => (
                  <tr key={u.id} className="hover:bg-white/[0.02] transition-colors">
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-full bg-brand-yes/20 flex items-center justify-center text-brand-yes text-xs font-bold shrink-0">
                          {(u.display_name ?? u.email ?? "?").charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <div className="font-medium text-brand-text">{u.display_name ?? "—"}</div>
                          <div className="text-xs text-brand-muted">{u.email ?? u.phone ?? u.id.slice(0, 12)}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-3"><KycBadge status={u.kyc_status} /></td>
                    <td className="px-5 py-3 font-medium text-brand-text">{formatCurrency(u.wallet_balance)}</td>
                    <td className="px-5 py-3 text-brand-muted">{u.stake_count}</td>
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-1.5">
                        {u.is_admin && (
                          <span title="Admin" className="inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded bg-brand-amber/10 text-brand-amber border border-brand-amber/30">
                            <Shield size={9} /> Admin
                          </span>
                        )}
                        {u.self_excluded && (
                          <span title="Self-excluded" className="inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded bg-brand-no/10 text-brand-no border border-brand-no/30">
                            <Ban size={9} /> Excluded
                          </span>
                        )}
                        {u.kyc_status === "verified" && !u.self_excluded && (
                          <span title="KYC Verified" className="inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded bg-brand-yes/10 text-brand-yes border border-brand-yes/30">
                            <BadgeCheck size={9} /> Verified
                          </span>
                        )}
                        {!u.is_admin && !u.self_excluded && u.kyc_status !== "verified" && (
                          <span className="text-xs text-brand-subtle">—</span>
                        )}
                      </div>
                    </td>
                    <td className="px-5 py-3 text-brand-subtle text-xs">{formatDate(u.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Pagination */}
      {pagination.total_pages > 1 && (
        <div className="flex items-center justify-between text-xs text-brand-muted">
          <span>
            Page {page} of {pagination.total_pages} · {pagination.total} users
          </span>
          <div className="flex gap-2">
            <button
              disabled={page <= 1}
              onClick={() => handlePage(page - 1)}
              className="px-3 py-1.5 border border-brand-border rounded-lg hover:bg-white/5 disabled:opacity-30 transition-colors"
            >
              Previous
            </button>
            <button
              disabled={page >= pagination.total_pages}
              onClick={() => handlePage(page + 1)}
              className="px-3 py-1.5 border border-brand-border rounded-lg hover:bg-white/5 disabled:opacity-30 transition-colors"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
