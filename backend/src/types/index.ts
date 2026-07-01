import { Request } from 'express';

// ─── Express module augmentation ─────────────────────────────────────────────
// Adds req.user and req.rawBody to Express's Request globally so all route
// handlers can use the standard Request type without custom extends.
declare global {
  namespace Express {
    interface Request {
      user?: JwtPayload;
      rawBody?: Buffer;
    }
  }
}

// AuthenticatedRequest is a semantic alias — same type, clearer intent in routes.
export type AuthenticatedRequest = Request;

// ─── Database row types ───────────────────────────────────────────────────────

export interface User {
  id: string;
  email: string | null;
  phone: string | null;
  display_name: string | null;
  avatar_url: string | null;
  wallet_balance: string; // pg returns NUMERIC as string
  kyc_status: 'unverified' | 'pending' | 'verified' | 'rejected';
  kyc_verified_at: Date | null;
  daily_stake_limit: string;
  self_excluded: boolean;
  self_excluded_until: Date | null;
  is_admin: boolean;
  referral_code: string | null;
  referred_by: string | null;
  age_confirmed: boolean;
  metadata: Record<string, unknown>;
  created_at: Date;
  updated_at: Date;
}

export interface Market {
  id: string;
  title: string;
  description: string | null;
  category: 'football' | 'politics' | 'finance' | 'entertainment' | 'other';
  reward_pool: string;
  total_yes: string;
  total_no: string;
  status: 'draft' | 'active' | 'closed' | 'settled';
  resolution_criteria: string | null;
  resolution_source: string | null;
  winning_side: 'yes' | 'no' | null;
  closes_at: Date | null;
  resolves_at: Date | null;
  closed_at: Date | null;
  settled_at: Date | null;
  created_by: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface Stake {
  id: string;
  user_id: string;
  market_id: string;
  side: 'yes' | 'no';
  amount: string;
  expected_payout: string;
  actual_payout: string | null;
  is_winner: boolean | null;
  created_at: Date;
}

export interface Transaction {
  id: string;
  user_id: string;
  type: 'deposit' | 'withdrawal' | 'stake' | 'payout' | 'referral_bonus' | 'refund';
  amount: string;
  balance_before: string;
  balance_after: string;
  status: 'pending' | 'confirmed' | 'failed' | 'reversed';
  ref: string | null;
  market_id: string | null;
  stake_id: string | null;
  provider: string | null;
  provider_ref: string | null;
  metadata: Record<string, unknown>;
  created_at: Date;
  updated_at: Date;
}

export interface WithdrawalRequest {
  id: string;
  user_id: string;
  amount: string;
  bank_code: string;
  account_number: string;
  account_name: string;
  status: 'pending' | 'approved' | 'processing' | 'completed' | 'rejected';
  approved_by: string | null;
  transaction_id: string | null;
  rejection_reason: string | null;
  created_at: Date;
  updated_at: Date;
}

// ─── Auth types ───────────────────────────────────────────────────────────────

export interface JwtPayload {
  sub: string;       // user UUID
  email?: string;
  role?: string;
  is_admin?: boolean;
  iat?: number;
  exp?: number;
}

// ─── API response shapes ──────────────────────────────────────────────────────

export interface ApiSuccess<T = unknown> {
  data: T;
}

export interface ApiError {
  error: string;
  code?: string;
}

// ─── Paystack types ───────────────────────────────────────────────────────────

export interface PaystackInitializeResponse {
  status: boolean;
  message: string;
  data: {
    authorization_url: string;
    access_code: string;
    reference: string;
  };
}

export interface PaystackChargeData {
  id: number;
  domain: string;
  status: string;
  reference: string;
  amount: number;           // in kobo
  message: string | null;
  gateway_response: string;
  paid_at: string;
  customer: {
    id: number;
    email: string;
    customer_code: string;
  };
  metadata: Record<string, unknown>;
}

export interface PaystackWebhookEvent {
  event: string;
  data: PaystackChargeData;
}

// ─── Flutterwave types ─────────────────────────────────────────────────────────

export interface FlutterwaveInitializeResponse {
  status: 'success' | 'error';
  message: string;
  data: {
    link: string;
  };
}

export interface FlutterwaveTransactionData {
  id: number;
  tx_ref: string;
  flw_ref: string;
  amount: number;            // in NAIRA (not kobo)
  currency: string;
  status: string;            // 'successful' | 'failed' | ...
  customer: {
    id: number;
    email: string;
    name: string;
  };
  meta?: Record<string, unknown>;
}

export interface FlutterwaveTransferData {
  id: number;
  reference: string;
  status: string;            // 'SUCCESSFUL' | 'FAILED' | ...
  amount: number;
  complete_message?: string;
}

export interface FlutterwaveWebhookEvent {
  event: string;             // 'charge.completed' | 'transfer.completed'
  data: FlutterwaveTransactionData & Partial<FlutterwaveTransferData>;
}
