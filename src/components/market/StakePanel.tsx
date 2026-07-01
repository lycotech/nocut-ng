"use client";

import { useState, useEffect } from "react";
import { cn, formatCurrency } from "@/lib/utils";
import { getToken } from "@/lib/auth";
import { placeStake, getWallet, ApiError, type WalletData } from "@/lib/api";
import { PayoutCalculator } from "./PayoutCalculator";

export function StakePanel({ marketId, status }: { marketId: string; status: string }) {
  const [side, setSide] = useState<"yes" | "no" | null>(null);
  const [amount, setAmount] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);
  const [toast, setToast] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [wallet, setWallet] = useState<WalletData | null>(null);

  const token = typeof window !== "undefined" ? getToken() : null;
  const isClosed = status !== "active";
  const numericAmount = parseFloat(amount) || 0;

  useEffect(() => {
    if (!token) return;
    getWallet(token).then(setWallet).catch(() => null);
  }, [token]);

  function showToast(type: "success" | "error", text: string) {
    setToast({ type, text });
    setTimeout(() => setToast(null), 5000);
  }

  function clientValidate(): string | null {
    if (!wallet) return null;
    const balance = parseFloat(wallet.balance);
    const limitRemaining = parseFloat(wallet.daily_stake_limit) - parseFloat(wallet.daily_staked_today);

    if (numericAmount > balance) {
      return `Your wallet balance is insufficient. Available: ${formatCurrency(balance)}.`;
    }
    if (numericAmount > limitRemaining) {
      return `You have ${formatCurrency(limitRemaining)} remaining in your daily limit.`;
    }
    return null;
  }

  async function handleSubmit() {
    if (!token || !side || numericAmount <= 0) return;

    const preCheckError = clientValidate();
    if (preCheckError) {
      showToast("error", preCheckError);
      return;
    }

    setSubmitting(true);
    setToast(null);
    try {
      const result = await placeStake(token, marketId, side, numericAmount);
      const payout = result.expected_payout;
      showToast("success", `Position placed! Expected payout: ${formatCurrency(payout)}`);
      setAmount("");
      setSide(null);
      // Refresh wallet balance after successful stake
      getWallet(token).then(setWallet).catch(() => null);
    } catch (err) {
      showToast("error", err instanceof ApiError ? err.message : "Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  if (isClosed) {
    return (
      <div className="rounded-xl border border-brand-border bg-brand-surface p-4 text-center text-sm text-brand-muted">
        This market is {status === "settled" ? "settled" : "closed"}. No new positions can be taken.
      </div>
    );
  }

  if (!token) {
    return (
      <div className="rounded-xl border border-brand-border bg-brand-surface p-4 text-center">
        <p className="mb-3 text-sm text-brand-muted">Log in to take a position on this market.</p>
        <a
          href="/login"
          className="inline-flex h-11 min-w-[44px] items-center justify-center rounded-lg bg-brand-amber px-5 font-semibold text-brand-bg transition-colors hover:bg-brand-amber-hover"
        >
          Log in
        </a>
      </div>
    );
  }

  const limitRemaining = wallet
    ? parseFloat(wallet.daily_stake_limit) - parseFloat(wallet.daily_staked_today)
    : null;

  return (
    <div className="rounded-xl border border-brand-border bg-brand-surface p-4">
      <div className="mb-3 flex items-center justify-between text-xs text-brand-subtle">
        <span>Balance: {wallet ? formatCurrency(wallet.balance) : "—"}</span>
        {limitRemaining !== null && (
          <span>Daily limit left: {formatCurrency(limitRemaining)}</span>
        )}
      </div>

      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => setSide("yes")}
          className={cn(
            "h-11 rounded-lg font-semibold transition-colors",
            side === "yes"
              ? "bg-brand-yes text-brand-bg"
              : "bg-brand-yes-muted text-brand-yes hover:bg-brand-yes/20"
          )}
        >
          YES
        </button>
        <button
          type="button"
          onClick={() => setSide("no")}
          className={cn(
            "h-11 rounded-lg font-semibold transition-colors",
            side === "no"
              ? "bg-brand-no text-brand-bg"
              : "bg-brand-no-muted text-brand-no hover:bg-brand-no/20"
          )}
        >
          NO
        </button>
      </div>

      <input
        type="number"
        inputMode="decimal"
        min={1}
        placeholder="Amount (₦)"
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
        className="mt-3 w-full rounded-lg border border-brand-border bg-brand-input px-3 py-2.5 text-brand-text placeholder-brand-subtle focus:border-brand-amber focus:outline-none focus:ring-2 focus:ring-brand-amber"
      />

      <PayoutCalculator marketId={marketId} amount={numericAmount} active={numericAmount > 0} />

      <button
        type="button"
        disabled={!side || numericAmount <= 0 || submitting}
        onClick={handleSubmit}
        className="mt-3 h-11 w-full rounded-lg bg-brand-amber font-semibold text-brand-bg transition-colors hover:bg-brand-amber-hover disabled:cursor-not-allowed disabled:opacity-40"
      >
        {submitting ? "Placing your position…" : "Take Position"}
      </button>

      {toast && (
        <div
          className={cn(
            "mt-3 rounded-lg px-3 py-2.5 text-sm font-medium",
            toast.type === "success"
              ? "bg-brand-yes-muted text-brand-yes"
              : "bg-brand-no-muted text-brand-no"
          )}
        >
          {toast.text}
        </div>
      )}
    </div>
  );
}
