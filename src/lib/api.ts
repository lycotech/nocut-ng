const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api";

export type MarketCategory = "football" | "politics" | "finance" | "entertainment" | "other";
export type MarketStatus = "draft" | "active" | "closed" | "settled";

export interface Market {
  id: string;
  title: string;
  description: string | null;
  category: MarketCategory;
  reward_pool: string;
  total_yes: string;
  total_no: string;
  status: MarketStatus;
  closes_at: string | null;
  resolves_at: string | null;
  winning_side: "yes" | "no" | null;
  created_at: string;
  // Computed display fields added by the API
  yes_pct: string;
  no_pct: string;
  pool_fill_pct: string;
  yes_expected_payout: string;
  no_expected_payout: string;
}

export interface MarketActivity {
  side: "yes" | "no";
  amount: string;
  created_at: string;
  display_name: string;
}

export interface MarketDetail extends Market {
  recent_activity: MarketActivity[];
  settlement_id?: string;
  settled_winning_side?: "yes" | "no";
  total_winners?: number;
  pool_distributed?: string;
  platform_margin?: string;
  settlement_date?: string;
}

export interface PayoutPreview {
  amount: number;
  side: "yes" | "no";
  expected_payout: string;
  return_on_stake: string;
}

export interface LeaderboardEntry {
  display_name: string;
  correct_predictions: string;
  total_profit: string;
  win_rate: string;
}

class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...init?.headers,
    },
    cache: "no-store",
  });

  const body = await res.json().catch(() => ({}));

  if (!res.ok) {
    throw new ApiError(res.status, body.error ?? "Something went wrong. Please try again.");
  }

  return body.data as T;
}

export function getMarkets(category?: string) {
  const qs = category && category !== "all" ? `?category=${encodeURIComponent(category)}` : "";
  return request<{ markets: Market[] }>(`/markets${qs}`);
}

export function getMarket(id: string) {
  return request<MarketDetail>(`/markets/${id}`);
}

export function getPayoutPreview(id: string, amount: number, side: "yes" | "no") {
  return request<PayoutPreview>(`/markets/${id}/payout-preview?amount=${amount}&side=${side}`);
}

export function getLeaderboard() {
  return request<{ leaderboard: LeaderboardEntry[] }>(`/leaderboard`);
}

export interface WalletData {
  balance: string;
  daily_stake_limit: string;
  daily_staked_today: string;
  transactions: Array<{
    id: string;
    type: string;
    amount: string;
    status: string;
    ref: string;
    market_id: string | null;
    created_at: string;
  }>;
}

export function getWallet(token: string) {
  return request<WalletData>("/me/wallet", {
    headers: { Authorization: `Bearer ${token}` },
  });
}

export function placeStake(
  token: string,
  marketId: string,
  side: "yes" | "no",
  amount: number
) {
  return request<{ stake_id: string; expected_payout: number }>(`/me/stakes`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({ market_id: marketId, side, amount }),
  });
}

export interface UserStake {
  id: string;
  market_id: string;
  side: "yes" | "no";
  amount: string;
  expected_payout: string;
  actual_payout: string | null;
  is_winner: boolean | null;
  created_at: string;
  market_title: string;
  market_status: string;
  market_winning_side: "yes" | "no" | null;
}

export function getMyStakeForMarket(token: string, marketId: string) {
  return request<{ stakes: UserStake[]; pagination: unknown }>(
    `/me/stakes?market_id=${encodeURIComponent(marketId)}`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
}

export interface SettlementResult {
  settlement_id: string;
  total_winners: number;
  pool_distributed: string;
  platform_margin: string;
}

export function settleMarket(
  token: string,
  marketId: string,
  winning_side: "yes" | "no",
  resolution_note: string
) {
  return request<SettlementResult>(`/admin/markets/${marketId}/settle`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({ winning_side, resolution_note }),
  });
}

// ─── Admin types ──────────────────────────────────────────────────────────────

export interface AdminStats {
  monthly_margin: string;
  active_markets: number;
  registered_users: number;
  pending_withdrawals: number;
}

export interface AdminMarket extends Market {
  description: string | null;
  resolution_criteria: string | null;
  resolution_source: string | null;
  created_at: string;
}

export interface Withdrawal {
  id: string;
  user_id: string;
  amount: string;
  bank_code: string;
  account_number: string;
  account_name: string;
  status: string;
  created_at: string;
  display_name: string | null;
  email: string | null;
}

export interface AdminUser {
  id: string;
  email: string | null;
  phone: string | null;
  display_name: string | null;
  wallet_balance: string;
  kyc_status: string;
  is_admin: boolean;
  self_excluded: boolean;
  created_at: string;
  stake_count: string;
}

export interface AuditEntry {
  id: string;
  admin_id: string;
  action: string;
  entity_type: string | null;
  entity_id: string | null;
  notes: string | null;
  metadata: Record<string, unknown>;
  timestamp: string;
  admin_name: string | null;
}

// ─── Admin API functions ──────────────────────────────────────────────────────

export function getAdminStats(token: string) {
  return request<AdminStats>("/admin/stats", {
    headers: { Authorization: `Bearer ${token}` },
  });
}

export function getAdminMarginHistory(token: string) {
  return request<{ history: Array<{ label: string; daily_margin: string }> }>(
    "/admin/margin-history",
    { headers: { Authorization: `Bearer ${token}` } }
  );
}

export function getAdminMarkets(token: string) {
  return request<{ markets: AdminMarket[] }>("/admin/markets", {
    headers: { Authorization: `Bearer ${token}` },
  });
}

export function createMarket(
  token: string,
  data: {
    title: string;
    description?: string;
    category: string;
    reward_pool: number;
    closes_at?: string;
    resolves_at?: string;
    resolution_criteria?: string;
    resolution_source?: string;
    publish?: boolean;
  }
) {
  return request<{ market_id: string; status: string }>("/admin/markets", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify(data),
  });
}

export function getAdminWithdrawals(token: string) {
  return request<{ withdrawals: Withdrawal[] }>("/admin/withdrawals", {
    headers: { Authorization: `Bearer ${token}` },
  });
}

export function updateWithdrawal(
  token: string,
  id: string,
  action: "approve" | "reject",
  rejection_reason?: string
) {
  return request<{ success: boolean }>(`/admin/withdrawals/${id}`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({ action, rejection_reason }),
  });
}

export function getAdminUsers(token: string, query?: string, page = 1) {
  const qs = new URLSearchParams({ page: String(page) });
  if (query) qs.set("q", query);
  return request<{
    users: AdminUser[];
    pagination: { page: number; total: number; total_pages: number };
  }>(`/admin/users?${qs}`, { headers: { Authorization: `Bearer ${token}` } });
}

export function getAdminAuditLog(token: string, page = 1) {
  return request<{ audit_log: AuditEntry[] }>(
    `/admin/audit?page=${page}&limit=50`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
}

export { ApiError };
