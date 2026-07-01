"use client";

import { useEffect, useState, useCallback } from "react";
import { RefreshCw, ScrollText } from "lucide-react";
import { cn, formatDate } from "@/lib/utils";
import { getToken } from "@/lib/auth";
import { getAdminAuditLog, type AuditEntry } from "@/lib/api";

const ACTION_COLORS: Record<string, string> = {
  market_created:      "bg-brand-yes/10 text-brand-yes border-brand-yes/30",
  market_updated:      "bg-blue-500/10 text-blue-400 border-blue-500/30",
  market_settled:      "bg-brand-amber/10 text-brand-amber border-brand-amber/30",
  withdrawal_approved: "bg-brand-yes/10 text-brand-yes border-brand-yes/30",
  withdrawal_rejected: "bg-brand-no/10 text-brand-no border-brand-no/30",
};

function ActionBadge({ action }: { action: string }) {
  const cls = ACTION_COLORS[action] ?? "bg-brand-input text-brand-muted border-brand-border";
  const label = action.replace(/_/g, " ");
  return (
    <span className={cn("text-[10px] font-semibold px-2 py-0.5 rounded-full border capitalize whitespace-nowrap", cls)}>
      {label}
    </span>
  );
}

export default function AuditLogPage() {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);

  const load = useCallback((p: number) => {
    const token = getToken();
    if (!token) return;
    setLoading(true);
    getAdminAuditLog(token, p)
      .then((res) => {
        setEntries(res.audit_log);
        setHasMore(res.audit_log.length === 50);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(1); }, [load]);

  function handlePage(p: number) {
    setPage(p);
    load(p);
  }

  return (
    <div className="flex-1 overflow-y-auto p-6 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-brand-text">Audit Log</h1>
          <p className="text-xs text-brand-muted mt-0.5">All admin actions with timestamp and actor</p>
        </div>
        <button
          onClick={() => { setPage(1); load(1); }}
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
        ) : entries.length === 0 ? (
          <div className="p-12 text-center">
            <ScrollText size={32} className="text-brand-subtle mx-auto mb-3" />
            <p className="text-brand-muted text-sm">No audit entries yet</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead>
                <tr className="bg-brand-input text-brand-subtle text-xs uppercase tracking-wider">
                  <th className="px-5 py-3">Timestamp</th>
                  <th className="px-5 py-3">Admin</th>
                  <th className="px-5 py-3">Action</th>
                  <th className="px-5 py-3">Entity</th>
                  <th className="px-5 py-3">Notes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-brand-border">
                {entries.map((e) => (
                  <tr key={e.id} className="hover:bg-white/[0.02] transition-colors">
                    <td className="px-5 py-3 text-brand-subtle text-xs whitespace-nowrap">
                      {formatDate(e.timestamp)}
                    </td>
                    <td className="px-5 py-3 text-brand-muted">{e.admin_name ?? e.admin_id.slice(0, 8)}</td>
                    <td className="px-5 py-3"><ActionBadge action={e.action} /></td>
                    <td className="px-5 py-3">
                      {e.entity_type && (
                        <span className="text-brand-muted capitalize">{e.entity_type}</span>
                      )}
                      {e.entity_id && (
                        <div className="text-[10px] text-brand-subtle font-mono">{e.entity_id.slice(0, 12)}…</div>
                      )}
                    </td>
                    <td className="px-5 py-3 text-brand-muted text-xs max-w-[200px] truncate">
                      {e.notes ?? (Object.keys(e.metadata ?? {}).length > 0
                        ? JSON.stringify(e.metadata).slice(0, 60)
                        : "—")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between text-xs text-brand-muted">
        <span>Page {page}</span>
        <div className="flex gap-2">
          <button
            disabled={page <= 1}
            onClick={() => handlePage(page - 1)}
            className="px-3 py-1.5 border border-brand-border rounded-lg hover:bg-white/5 disabled:opacity-30 transition-colors"
          >
            Previous
          </button>
          <button
            disabled={!hasMore}
            onClick={() => handlePage(page + 1)}
            className="px-3 py-1.5 border border-brand-border rounded-lg hover:bg-white/5 disabled:opacity-30 transition-colors"
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );
}
