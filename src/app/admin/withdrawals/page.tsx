"use client";

import { useEffect, useState } from "react";
import { RefreshCw, CheckCircle2, XCircle, Wallet } from "lucide-react";
import { formatCurrency, formatDate } from "@/lib/utils";
import { getToken } from "@/lib/auth";
import { getAdminWithdrawals, updateWithdrawal, ApiError, type Withdrawal } from "@/lib/api";

export default function WithdrawalsPage() {
  const [withdrawals, setWithdrawals] = useState<Withdrawal[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [rejectModal, setRejectModal] = useState<{ id: string; amount: string } | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [actionError, setActionError] = useState<string | null>(null);

  function load() {
    const token = getToken();
    if (!token) return;
    setLoading(true);
    getAdminWithdrawals(token)
      .then((res) => setWithdrawals(res.withdrawals))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }

  useEffect(() => { load(); }, []);

  async function handleApprove(id: string) {
    const token = getToken();
    if (!token) return;
    setActionLoading(id);
    setActionError(null);
    try {
      await updateWithdrawal(token, id, "approve");
      load();
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : "Failed to approve withdrawal.");
    } finally {
      setActionLoading(null);
    }
  }

  async function handleReject() {
    if (!rejectModal || !rejectReason.trim()) return;
    const token = getToken();
    if (!token) return;
    setActionLoading(rejectModal.id);
    setActionError(null);
    try {
      await updateWithdrawal(token, rejectModal.id, "reject", rejectReason.trim());
      setRejectModal(null);
      setRejectReason("");
      load();
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : "Failed to reject withdrawal.");
    } finally {
      setActionLoading(null);
    }
  }

  return (
    <div className="flex-1 overflow-y-auto p-6 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-brand-text">Withdrawal Queue</h1>
          <p className="text-xs text-brand-muted mt-0.5">
            {withdrawals.length} pending request{withdrawals.length !== 1 ? "s" : ""}
          </p>
        </div>
        <button
          onClick={load}
          className="flex items-center gap-1.5 px-3 py-2 text-xs text-brand-muted border border-brand-border rounded-lg hover:bg-white/5 transition-colors"
        >
          <RefreshCw size={13} />
          Refresh
        </button>
      </div>

      {actionError && (
        <div className="rounded-lg bg-brand-no/10 border border-brand-no/30 px-4 py-3 text-sm text-brand-no">
          {actionError}
        </div>
      )}

      {/* Table */}
      <div className="rounded-xl border border-brand-border bg-brand-surface overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-brand-muted text-sm">Loading…</div>
        ) : error ? (
          <div className="p-8 text-center text-brand-no text-sm">{error}</div>
        ) : withdrawals.length === 0 ? (
          <div className="p-12 text-center">
            <Wallet size={32} className="text-brand-subtle mx-auto mb-3" />
            <p className="text-brand-muted text-sm">No pending withdrawal requests</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead>
                <tr className="bg-brand-input text-brand-subtle text-xs uppercase tracking-wider">
                  <th className="px-5 py-3">User</th>
                  <th className="px-5 py-3">Amount</th>
                  <th className="px-5 py-3">Bank</th>
                  <th className="px-5 py-3">Account</th>
                  <th className="px-5 py-3">Requested</th>
                  <th className="px-5 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-brand-border">
                {withdrawals.map((w) => (
                  <tr key={w.id} className="hover:bg-white/[0.02] transition-colors">
                    <td className="px-5 py-3">
                      <div className="font-medium text-brand-text">{w.display_name ?? "—"}</div>
                      <div className="text-xs text-brand-muted">{w.email ?? w.user_id.slice(0, 8)}</div>
                    </td>
                    <td className="px-5 py-3 font-semibold text-brand-amber">{formatCurrency(w.amount)}</td>
                    <td className="px-5 py-3 text-brand-muted">{w.bank_code}</td>
                    <td className="px-5 py-3">
                      <div className="text-brand-muted">{w.account_number}</div>
                      <div className="text-xs text-brand-subtle">{w.account_name}</div>
                    </td>
                    <td className="px-5 py-3 text-brand-subtle text-xs">{formatDate(w.created_at)}</td>
                    <td className="px-5 py-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          disabled={actionLoading === w.id}
                          onClick={() => handleApprove(w.id)}
                          className="flex items-center gap-1.5 px-3 py-1.5 bg-brand-yes/10 border border-brand-yes/30 text-brand-yes text-xs font-semibold rounded-lg hover:bg-brand-yes/20 transition-colors disabled:opacity-40"
                        >
                          <CheckCircle2 size={13} />
                          Approve
                        </button>
                        <button
                          disabled={actionLoading === w.id}
                          onClick={() => { setRejectModal({ id: w.id, amount: w.amount }); setActionError(null); }}
                          className="flex items-center gap-1.5 px-3 py-1.5 bg-brand-no/10 border border-brand-no/30 text-brand-no text-xs font-semibold rounded-lg hover:bg-brand-no/20 transition-colors disabled:opacity-40"
                        >
                          <XCircle size={13} />
                          Reject
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Reject modal */}
      {rejectModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-brand-surface border border-brand-border rounded-xl p-5 w-full max-w-sm space-y-4">
            <h3 className="text-sm font-semibold text-brand-text">
              Reject Withdrawal of {formatCurrency(rejectModal.amount)}
            </h3>
            <div>
              <label className="block text-xs font-semibold text-brand-subtle uppercase tracking-wider mb-1.5">
                Reason <span className="text-brand-no">*</span>
              </label>
              <textarea
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                rows={3}
                placeholder="Explain why this withdrawal is being rejected…"
                className="w-full bg-brand-input border border-brand-border rounded-lg px-3 py-2.5 text-sm text-brand-text placeholder-brand-subtle focus:border-brand-no focus:outline-none focus:ring-1 focus:ring-brand-no resize-none"
              />
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => { setRejectModal(null); setRejectReason(""); }}
                className="flex-1 py-2 border border-brand-border rounded-lg text-sm text-brand-muted hover:bg-white/5 transition-colors"
              >
                Cancel
              </button>
              <button
                disabled={!rejectReason.trim() || actionLoading !== null}
                onClick={handleReject}
                className="flex-1 py-2 bg-brand-no text-white rounded-lg text-sm font-semibold hover:brightness-110 transition-all disabled:opacity-40"
              >
                {actionLoading ? "Rejecting…" : "Confirm Reject"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
