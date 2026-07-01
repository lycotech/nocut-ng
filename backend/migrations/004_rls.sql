-- NoCut.ng — Migration 004: Row Level Security
--
-- TWO MODES:
--
-- A) LOCAL POSTGRESQL (development)
--    Uses current_setting('app.current_user_id', TRUE) — set by the Express
--    middleware at the start of each DB transaction.
--    Run Section A below.
--
-- B) SUPABASE (production)
--    Uses auth.uid() and auth.jwt() provided by Supabase Auth.
--    Run Section B below instead.
--
-- In both cases the Express API enforces user isolation via parameterised queries
-- (WHERE user_id = $1). RLS is a defence-in-depth layer against direct DB access.

-- ═══════════════════════════════════════════════════════════════════════════════
-- SECTION A — LOCAL POSTGRESQL
-- ═══════════════════════════════════════════════════════════════════════════════

-- Helper: returns the current user's UUID from the session variable.
-- The Express auth middleware must call:
--   SET LOCAL app.current_user_id = '<uuid>';
-- at the start of any transaction that touches user-scoped data.
CREATE OR REPLACE FUNCTION app_user_id() RETURNS UUID AS $$
  SELECT NULLIF(current_setting('app.current_user_id', TRUE), '')::UUID;
$$ LANGUAGE sql STABLE;

CREATE OR REPLACE FUNCTION app_is_admin() RETURNS BOOLEAN AS $$
  SELECT current_setting('app.is_admin', TRUE) = 'true';
$$ LANGUAGE sql STABLE;

-- ── Enable RLS on all 8 tables ────────────────────────────────────────────────
ALTER TABLE users                ENABLE ROW LEVEL SECURITY;
ALTER TABLE markets              ENABLE ROW LEVEL SECURITY;
ALTER TABLE stakes               ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions         ENABLE ROW LEVEL SECURITY;
ALTER TABLE settlements          ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_log            ENABLE ROW LEVEL SECURITY;
ALTER TABLE withdrawal_requests  ENABLE ROW LEVEL SECURITY;
ALTER TABLE referrals            ENABLE ROW LEVEL SECURITY;

-- ── users ─────────────────────────────────────────────────────────────────────
-- Users can read/update only their own row. Admins can read all.
DROP POLICY IF EXISTS "users_self"  ON users;
DROP POLICY IF EXISTS "users_admin" ON users;

CREATE POLICY "users_self" ON users
  USING (id = app_user_id() OR app_is_admin());

-- ── markets ───────────────────────────────────────────────────────────────────
-- Any user can read active/closed/settled markets. Admins can read all (including drafts).
DROP POLICY IF EXISTS "markets_read" ON markets;

CREATE POLICY "markets_read" ON markets FOR SELECT
  USING (status IN ('active','closed','settled') OR app_is_admin());

-- Admins can INSERT/UPDATE markets.
DROP POLICY IF EXISTS "markets_write" ON markets;

CREATE POLICY "markets_write" ON markets FOR ALL
  USING (app_is_admin());

-- ── stakes ────────────────────────────────────────────────────────────────────
-- Users can only read their own stakes.
DROP POLICY IF EXISTS "stakes_self" ON stakes;

CREATE POLICY "stakes_self" ON stakes FOR SELECT
  USING (user_id = app_user_id() OR app_is_admin());

-- ── transactions ──────────────────────────────────────────────────────────────
-- Users can only read their own transactions.
DROP POLICY IF EXISTS "transactions_self" ON transactions;

CREATE POLICY "transactions_self" ON transactions FOR SELECT
  USING (user_id = app_user_id() OR app_is_admin());

-- ── settlements ───────────────────────────────────────────────────────────────
-- All authenticated users can read settlements (public outcome data).
DROP POLICY IF EXISTS "settlements_read" ON settlements;

CREATE POLICY "settlements_read" ON settlements FOR SELECT
  USING (app_user_id() IS NOT NULL OR app_is_admin());

-- ── withdrawal_requests ───────────────────────────────────────────────────────
DROP POLICY IF EXISTS "withdrawals_self" ON withdrawal_requests;

CREATE POLICY "withdrawals_self" ON withdrawal_requests FOR SELECT
  USING (user_id = app_user_id() OR app_is_admin());

-- ── referrals ─────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "referrals_self" ON referrals;

CREATE POLICY "referrals_self" ON referrals FOR SELECT
  USING (referrer_id = app_user_id() OR referee_id = app_user_id() OR app_is_admin());

-- ── admin_log ─────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "admin_log_admin" ON admin_log;

CREATE POLICY "admin_log_admin" ON admin_log FOR SELECT
  USING (app_is_admin());


-- ═══════════════════════════════════════════════════════════════════════════════
-- SECTION B — SUPABASE PRODUCTION
-- (comment out Section A above and uncomment this block when deploying to Supabase)
-- ═══════════════════════════════════════════════════════════════════════════════

/*
ALTER TABLE users                ENABLE ROW LEVEL SECURITY;
ALTER TABLE markets              ENABLE ROW LEVEL SECURITY;
ALTER TABLE stakes               ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions         ENABLE ROW LEVEL SECURITY;
ALTER TABLE settlements          ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_log            ENABLE ROW LEVEL SECURITY;
ALTER TABLE withdrawal_requests  ENABLE ROW LEVEL SECURITY;
ALTER TABLE referrals            ENABLE ROW LEVEL SECURITY;

-- users
CREATE POLICY "users_self" ON users
  USING (auth.uid() = id OR auth.jwt()->>'is_admin' = 'true');

-- markets
CREATE POLICY "markets_read" ON markets FOR SELECT
  USING (status IN ('active','closed','settled') OR auth.jwt()->>'is_admin' = 'true');

CREATE POLICY "markets_write" ON markets FOR ALL
  USING (auth.jwt()->>'is_admin' = 'true');

-- stakes
CREATE POLICY "stakes_self" ON stakes FOR SELECT
  USING (auth.uid() = user_id OR auth.jwt()->>'is_admin' = 'true');

-- transactions
CREATE POLICY "transactions_self" ON transactions FOR SELECT
  USING (auth.uid() = user_id OR auth.jwt()->>'is_admin' = 'true');

-- settlements
CREATE POLICY "settlements_read" ON settlements FOR SELECT
  USING (auth.uid() IS NOT NULL OR auth.jwt()->>'is_admin' = 'true');

-- withdrawal_requests
CREATE POLICY "withdrawals_self" ON withdrawal_requests FOR SELECT
  USING (auth.uid() = user_id OR auth.jwt()->>'is_admin' = 'true');

-- referrals
CREATE POLICY "referrals_self" ON referrals FOR SELECT
  USING (auth.uid() = referrer_id OR auth.uid() = referee_id OR auth.jwt()->>'is_admin' = 'true');

-- admin_log
CREATE POLICY "admin_log_admin" ON admin_log FOR SELECT
  USING (auth.jwt()->>'is_admin' = 'true');
*/
