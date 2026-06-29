-- NoCut.ng — Migration 001: Core Schema
-- Run against: nocut_dev database

-- ─── USERS ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email               TEXT UNIQUE,
  phone               TEXT UNIQUE,
  display_name        TEXT,
  avatar_url          TEXT,
  wallet_balance      NUMERIC(12,2) NOT NULL DEFAULT 0.00,
  kyc_status          TEXT NOT NULL DEFAULT 'unverified'
                        CHECK (kyc_status IN ('unverified','pending','verified','rejected')),
  kyc_bvn             TEXT,           -- AES-256 encrypted; never returned in API
  kyc_nin             TEXT,           -- AES-256 encrypted; never returned in API
  kyc_verified_at     TIMESTAMPTZ,
  daily_stake_limit   NUMERIC(12,2) NOT NULL DEFAULT 50000.00,
  self_excluded       BOOLEAN NOT NULL DEFAULT FALSE,
  self_excluded_until TIMESTAMPTZ,
  is_admin            BOOLEAN NOT NULL DEFAULT FALSE,
  referral_code       TEXT UNIQUE,
  referred_by         UUID REFERENCES users(id),
  age_confirmed       BOOLEAN NOT NULL DEFAULT FALSE,
  metadata            JSONB NOT NULL DEFAULT '{}',
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── MARKETS ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS markets (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title               TEXT NOT NULL,
  description         TEXT,
  category            TEXT NOT NULL
                        CHECK (category IN ('football','politics','finance','entertainment','other')),
  reward_pool         NUMERIC(12,2) NOT NULL,    -- R: the fixed payout amount
  total_yes           NUMERIC(12,2) NOT NULL DEFAULT 0.00,
  total_no            NUMERIC(12,2) NOT NULL DEFAULT 0.00,
  status              TEXT NOT NULL DEFAULT 'draft'
                        CHECK (status IN ('draft','active','closed','settled')),
  resolution_criteria TEXT,
  resolution_source   TEXT,
  winning_side        TEXT CHECK (winning_side IN ('yes','no')),
  closes_at           TIMESTAMPTZ,
  resolves_at         TIMESTAMPTZ,
  closed_at           TIMESTAMPTZ,
  settled_at          TIMESTAMPTZ,
  created_by          UUID REFERENCES users(id),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── STAKES ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS stakes (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES users(id),
  market_id       UUID NOT NULL REFERENCES markets(id),
  side            TEXT NOT NULL CHECK (side IN ('yes','no')),
  amount          NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  expected_payout NUMERIC(12,2) NOT NULL,
  actual_payout   NUMERIC(12,2),
  is_winner       BOOLEAN,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── TRANSACTIONS ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS transactions (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID NOT NULL REFERENCES users(id),
  type           TEXT NOT NULL
                   CHECK (type IN ('deposit','withdrawal','stake','payout','referral_bonus','refund')),
  amount         NUMERIC(12,2) NOT NULL,      -- always positive; direction conveyed by type
  balance_before NUMERIC(12,2) NOT NULL,
  balance_after  NUMERIC(12,2) NOT NULL,
  status         TEXT NOT NULL DEFAULT 'pending'
                   CHECK (status IN ('pending','confirmed','failed','reversed')),
  ref            TEXT UNIQUE,                 -- internal or gateway reference
  market_id      UUID REFERENCES markets(id),
  stake_id       UUID REFERENCES stakes(id),
  provider       TEXT,                        -- 'paystack' | 'flutterwave' | 'internal'
  provider_ref   TEXT,                        -- raw gateway reference (idempotency key)
  metadata       JSONB NOT NULL DEFAULT '{}',
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── SETTLEMENTS ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS settlements (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  market_id        UUID NOT NULL UNIQUE REFERENCES markets(id),
  winning_side     TEXT NOT NULL CHECK (winning_side IN ('yes','no')),
  total_winners    INTEGER NOT NULL,
  total_staked     NUMERIC(12,2) NOT NULL,   -- T at closure
  reward_pool      NUMERIC(12,2) NOT NULL,   -- R snapshot at settlement
  platform_margin  NUMERIC(12,2) NOT NULL,   -- M = T - R
  pool_distributed NUMERIC(12,2) NOT NULL,   -- must equal reward_pool
  settled_by       UUID REFERENCES users(id),
  resolution_note  TEXT,
  settled_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── ADMIN LOG ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS admin_log (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id    UUID NOT NULL REFERENCES users(id),
  action      TEXT NOT NULL,
  entity_type TEXT,
  entity_id   UUID,
  notes       TEXT,
  metadata    JSONB NOT NULL DEFAULT '{}',
  ip_address  TEXT,
  timestamp   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── WITHDRAWAL REQUESTS ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS withdrawal_requests (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID NOT NULL REFERENCES users(id),
  amount           NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  bank_code        TEXT NOT NULL,
  account_number   TEXT NOT NULL,
  account_name     TEXT NOT NULL,
  status           TEXT NOT NULL DEFAULT 'pending'
                     CHECK (status IN ('pending','approved','processing','completed','rejected')),
  approved_by      UUID REFERENCES users(id),
  transaction_id   UUID REFERENCES transactions(id),
  rejection_reason TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── REFERRALS ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS referrals (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_id   UUID NOT NULL REFERENCES users(id),
  referee_id    UUID NOT NULL REFERENCES users(id),
  bonus_amount  NUMERIC(12,2),
  bonus_paid    BOOLEAN NOT NULL DEFAULT FALSE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── INDEXES ─────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_markets_status     ON markets(status);
CREATE INDEX IF NOT EXISTS idx_markets_category   ON markets(category);
CREATE INDEX IF NOT EXISTS idx_markets_closes_at  ON markets(closes_at);
CREATE INDEX IF NOT EXISTS idx_stakes_user_id     ON stakes(user_id);
CREATE INDEX IF NOT EXISTS idx_stakes_market_id   ON stakes(market_id);
CREATE INDEX IF NOT EXISTS idx_transactions_user  ON transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_transactions_ref   ON transactions(provider_ref);
CREATE INDEX IF NOT EXISTS idx_transactions_date  ON transactions(created_at);
CREATE INDEX IF NOT EXISTS idx_admin_log_entity   ON admin_log(entity_id);
