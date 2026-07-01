"use client";

import { useState } from "react";
import { cn, formatCurrency } from "@/lib/utils";
import { settleMarket, ApiError, type SettlementResult } from "@/lib/api";
import { getToken } from "@/lib/auth";

interface Props {
  marketId: string;
  marketTitle: string;
  rewardPool: string;
  totalYes: string;
  totalNo: string;
  onSettled: (result: SettlementResult) => void;
}

export function SettlementPanel({ marketId, marketTitle, rewardPool, totalYes, totalNo, onSettled }: Props) {
  const [side, setSide] = useState<"yes" | "no" | null>(null);
  const [confirmText, setConfirmText] = useState("");
  const [resolutionNote, setResolutionNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const totalStaked = parseFloat(totalYes) + parseFloat(totalNo);
  const platformMargin = totalStaked - parseFloat(rewardPool);
  const isConfirmed = confirmText.trim() === marketTitle.trim();

  const canSubmit = side !== null && isConfirmed && resolutionNote.trim().length >= 10 && !submitting;

  const winnerSideTotal = side === "yes" ? parseFloat(totalYes) : side === "no" ? parseFloat(totalNo) : 0;
  const payoutPerUnit = winnerSideTotal > 0
    ? (parseFloat(rewardPool) / winnerSideTotal)
    : null;

  async function handleSettle() {
    if (!canSubmit || !side) return;
    const token = getToken();
    if (!token) { setError("Not authenticated. Please log in as admin."); return; }

    setSubmitting(true);
    setError(null);
    try {
      const result = await settleMarket(token, marketId, side, resolutionNote);
      onSettled(result);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Settlement failed. Please try again.");
      setSubmitting(false);
    }
  }

  return (
    <div className="rounded-xl border border-brand-amber/35 bg-brand-surface p-5">
      <div className="mb-4 rounded-lg bg-brand-no/10 px-4 py-3 text-sm font-medium text-brand-no">
        ⚠ This action is irreversible. Winners will be credited immediately.
      </div>

      {/* P&L summary */}
      <div className="mb-5 grid grid-cols-3 gap-3 text-sm">
        <div className="rounded-lg bg-brand-input p-3">
          <div className="text-xs text-brand-subtle">Total Staked (T)</div>
          <div className="font-semibold text-brand-text">{formatCurrency(totalStaked)}</div>
        </div>
        <div className="rounded-lg bg-brand-input p-3">
          <div className="text-xs text-brand-subtle">Reward Pool (R)</div>
          <div className="font-semibold text-brand-text">{formatCurrency(rewardPool)}</div>
        </div>
        <div className="rounded-lg bg-brand-yes-muted p-3">
          <div className="text-xs text-brand-subtle">Platform Margin</div>
          <div className="font-semibold text-brand-yes">{formatCurrency(platformMargin)}</div>
        </div>
      </div>

      {/* Winning side selector */}
      <p className="mb-2 text-sm font-medium text-brand-text">Select winning side</p>
      <div className="grid grid-cols-2 gap-3">
        <button
          type="button"
          onClick={() => setSide("yes")}
          className={cn(
            "h-14 rounded-xl text-lg font-bold transition-colors",
            side === "yes"
              ? "bg-brand-yes text-brand-bg"
              : "bg-brand-yes-muted text-brand-yes hover:bg-brand-yes/20"
          )}
        >
          YES WINS
          <div className="text-xs font-normal opacity-75">{formatCurrency(totalYes)} staked</div>
        </button>
        <button
          type="button"
          onClick={() => setSide("no")}
          className={cn(
            "h-14 rounded-xl text-lg font-bold transition-colors",
            side === "no"
              ? "bg-brand-no text-brand-bg"
              : "bg-brand-no-muted text-brand-no hover:bg-brand-no/20"
          )}
        >
          NO WINS
          <div className="text-xs font-normal opacity-75">{formatCurrency(totalNo)} staked</div>
        </button>
      </div>

      {/* Payout preview */}
      {side && payoutPerUnit !== null && winnerSideTotal > 0 && (
        <div className="mt-3 rounded-lg bg-brand-input px-4 py-3 text-sm">
          <span className="text-brand-muted">Each ₦1,000 staked on {side.toUpperCase()} receives approx </span>
          <span className="font-semibold text-brand-text">{formatCurrency((payoutPerUnit * 1000).toFixed(2))}</span>
        </div>
      )}

      {/* Resolution note */}
      <div className="mt-4">
        <label className="mb-1 block text-sm font-medium text-brand-text">
          Resolution note <span className="text-brand-no">*</span>
        </label>
        <textarea
          value={resolutionNote}
          onChange={(e) => setResolutionNote(e.target.value)}
          rows={3}
          placeholder="Describe the outcome source and any relevant details..."
          className="w-full rounded-lg border border-brand-border bg-brand-input px-3 py-2.5 text-sm text-brand-text placeholder-brand-subtle focus:border-brand-amber focus:outline-none focus:ring-2 focus:ring-brand-amber"
        />
      </div>

      {/* Title confirmation */}
      <div className="mt-4">
        <label className="mb-1 block text-sm font-medium text-brand-text">
          Type the market title to confirm
        </label>
        <p className="mb-2 rounded bg-brand-input px-3 py-2 font-mono text-xs text-brand-muted break-all">
          {marketTitle}
        </p>
        <input
          type="text"
          value={confirmText}
          onChange={(e) => setConfirmText(e.target.value)}
          placeholder="Type the exact market title..."
          className="w-full rounded-lg border border-brand-border bg-brand-input px-3 py-2.5 text-sm text-brand-text placeholder-brand-subtle focus:border-brand-amber focus:outline-none focus:ring-2 focus:ring-brand-amber"
        />
        {confirmText.length > 0 && !isConfirmed && (
          <p className="mt-1 text-xs text-brand-no">Title does not match exactly.</p>
        )}
      </div>

      {error && (
        <div className="mt-3 rounded-lg bg-brand-no-muted px-4 py-3 text-sm text-brand-no">
          {error}
        </div>
      )}

      <button
        type="button"
        disabled={!canSubmit}
        onClick={handleSettle}
        className="mt-4 h-12 w-full rounded-lg bg-brand-amber font-semibold text-brand-bg transition-colors hover:bg-brand-amber-hover disabled:cursor-not-allowed disabled:opacity-40"
      >
        {submitting
          ? "Settling…"
          : side
          ? `Confirm — ${side.toUpperCase()} Wins`
          : "Select a winning side"}
      </button>
    </div>
  );
}
