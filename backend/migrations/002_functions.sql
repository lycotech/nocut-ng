-- NoCut.ng — Migration 002: PL/pgSQL Functions

-- ─── AUTO-CLOSE TRIGGER FUNCTION ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION check_market_auto_close()
RETURNS TRIGGER AS $$
BEGIN
  IF (NEW.total_yes + NEW.total_no) >= NEW.reward_pool AND NEW.status = 'active' THEN
    NEW.status    := 'closed';
    NEW.closed_at := NOW();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ─── PLACE STAKE (ATOMIC) ────────────────────────────────────────────────────
-- All validation and state mutation in one DB transaction.
-- Called from the API layer via: SELECT place_stake($1,$2,$3,$4)
CREATE OR REPLACE FUNCTION place_stake(
  p_user_id   UUID,
  p_market_id UUID,
  p_side      TEXT,
  p_amount    NUMERIC
) RETURNS JSONB AS $$
DECLARE
  v_user         users%ROWTYPE;
  v_market       markets%ROWTYPE;
  v_side_total   NUMERIC;
  v_expected     NUMERIC;
  v_stake_id     UUID;
  v_daily_staked NUMERIC;
BEGIN
  -- Lock rows for this transaction to prevent race conditions
  SELECT * INTO v_user   FROM users   WHERE id = p_user_id   FOR UPDATE;
  SELECT * INTO v_market FROM markets WHERE id = p_market_id FOR UPDATE;

  -- ── Validation (fail-fast — order matches CLAUDE.md Section 15) ──────────────
  -- 1. age gate
  IF NOT v_user.age_confirmed          THEN RAISE EXCEPTION 'age_not_confirmed';      END IF;
  -- 2. KYC
  IF v_user.kyc_status != 'verified'  THEN RAISE EXCEPTION 'kyc_not_verified';       END IF;
  -- 3. self-exclusion
  IF v_user.self_excluded             THEN RAISE EXCEPTION 'user_self_excluded';     END IF;
  IF v_user.self_excluded_until IS NOT NULL AND v_user.self_excluded_until > NOW()
                                       THEN RAISE EXCEPTION 'user_self_excluded';     END IF;
  -- 4. market must be active
  IF v_market.status != 'active'      THEN RAISE EXCEPTION 'market_not_active';      END IF;
  -- 5. amount must be positive
  IF p_amount <= 0                     THEN RAISE EXCEPTION 'invalid_amount';         END IF;
  -- 6. sufficient wallet balance
  IF v_user.wallet_balance < p_amount  THEN RAISE EXCEPTION 'insufficient_balance';  END IF;

  -- Daily stake limit check
  SELECT COALESCE(SUM(s.amount), 0) INTO v_daily_staked
  FROM stakes s
  JOIN transactions t ON t.stake_id = s.id
  WHERE s.user_id  = p_user_id
    AND t.created_at >= CURRENT_DATE
    AND t.status    = 'confirmed';

  IF v_daily_staked + p_amount > v_user.daily_stake_limit THEN
    RAISE EXCEPTION 'daily_limit_exceeded';
  END IF;

  -- Pool overshoot check (stake cannot push total_staked beyond reward_pool)
  IF (v_market.total_yes + v_market.total_no + p_amount) > v_market.reward_pool THEN
    RAISE EXCEPTION 'stake_exceeds_pool';
  END IF;

  -- ── Expected payout snapshot ───────────────────────────────────────────────
  v_side_total := CASE WHEN p_side = 'yes' THEN v_market.total_yes ELSE v_market.total_no END;
  v_expected   := (p_amount / (v_side_total + p_amount)) * v_market.reward_pool;

  -- ── Debit wallet ──────────────────────────────────────────────────────────
  UPDATE users
  SET wallet_balance = wallet_balance - p_amount,
      updated_at     = NOW()
  WHERE id = p_user_id;

  -- ── Insert stake ──────────────────────────────────────────────────────────
  INSERT INTO stakes (user_id, market_id, side, amount, expected_payout)
  VALUES (p_user_id, p_market_id, p_side, p_amount, v_expected)
  RETURNING id INTO v_stake_id;

  -- ── Update market totals (triggers auto-close check) ──────────────────────
  IF p_side = 'yes' THEN
    UPDATE markets SET total_yes = total_yes + p_amount, updated_at = NOW() WHERE id = p_market_id;
  ELSE
    UPDATE markets SET total_no  = total_no  + p_amount, updated_at = NOW() WHERE id = p_market_id;
  END IF;

  -- ── Audit transaction record ──────────────────────────────────────────────
  INSERT INTO transactions (
    user_id, type, amount, balance_before, balance_after,
    status, market_id, stake_id, provider, ref
  ) VALUES (
    p_user_id, 'stake', p_amount,
    v_user.wallet_balance,
    v_user.wallet_balance - p_amount,
    'confirmed', p_market_id, v_stake_id, 'internal',
    'stake_' || v_stake_id::text
  );

  RETURN jsonb_build_object(
    'stake_id',        v_stake_id,
    'expected_payout', v_expected
  );
END;
$$ LANGUAGE plpgsql;

-- ─── SETTLE MARKET (ATOMIC) ───────────────────────────────────────────────────
-- Admin-triggered. Credits all winners in one transaction.
CREATE OR REPLACE FUNCTION settle_market(
  p_market_id     UUID,
  p_winning_side  TEXT,
  p_admin_id      UUID,
  p_resolution_note TEXT DEFAULT NULL
) RETURNS JSONB AS $$
DECLARE
  v_market            markets%ROWTYPE;
  v_winning_total     NUMERIC;
  v_total_staked      NUMERIC;
  v_platform_margin   NUMERIC;
  v_pool_distributed  NUMERIC := 0;
  v_total_winners     INTEGER := 0;
  v_stake             RECORD;
  v_payout            NUMERIC;
  v_tx_id             UUID;
  v_settlement_id     UUID;
BEGIN
  SELECT * INTO v_market FROM markets WHERE id = p_market_id FOR UPDATE;

  -- ── Settlement validations ─────────────────────────────────────────────────
  IF v_market.status != 'closed'         THEN RAISE EXCEPTION 'market_not_closed';         END IF;
  IF p_winning_side NOT IN ('yes','no')  THEN RAISE EXCEPTION 'invalid_winning_side';      END IF;
  IF EXISTS (SELECT 1 FROM settlements WHERE market_id = p_market_id)
                                          THEN RAISE EXCEPTION 'already_settled';           END IF;

  v_total_staked    := v_market.total_yes + v_market.total_no;
  v_platform_margin := v_total_staked - v_market.reward_pool;

  SELECT COALESCE(SUM(amount), 0)
  INTO v_winning_total
  FROM stakes
  WHERE market_id = p_market_id AND side = p_winning_side;

  -- ── Credit each winner ────────────────────────────────────────────────────
  FOR v_stake IN
    SELECT s.*, u.wallet_balance AS current_balance
    FROM stakes s
    JOIN users u ON u.id = s.user_id
    WHERE s.market_id = p_market_id AND s.side = p_winning_side
    FOR UPDATE OF u
  LOOP
    v_payout := (v_stake.amount / v_winning_total) * v_market.reward_pool;

    UPDATE users
    SET wallet_balance = wallet_balance + v_payout, updated_at = NOW()
    WHERE id = v_stake.user_id;

    INSERT INTO transactions (
      user_id, type, amount, balance_before, balance_after,
      status, market_id, stake_id, provider, ref
    ) VALUES (
      v_stake.user_id, 'payout', v_payout,
      v_stake.current_balance,
      v_stake.current_balance + v_payout,
      'confirmed', p_market_id, v_stake.id, 'internal',
      'payout_' || v_stake.id::text
    ) RETURNING id INTO v_tx_id;

    UPDATE stakes
    SET actual_payout = v_payout, is_winner = TRUE
    WHERE id = v_stake.id;

    v_pool_distributed := v_pool_distributed + v_payout;
    v_total_winners    := v_total_winners + 1;
  END LOOP;

  -- ── Mark losing stakes ────────────────────────────────────────────────────
  UPDATE stakes SET is_winner = FALSE
  WHERE market_id = p_market_id AND side != p_winning_side;

  -- ── Insert settlements record ─────────────────────────────────────────────
  INSERT INTO settlements (
    market_id, winning_side, total_winners, total_staked,
    reward_pool, platform_margin, pool_distributed, settled_by, resolution_note
  ) VALUES (
    p_market_id, p_winning_side, v_total_winners, v_total_staked,
    v_market.reward_pool, v_platform_margin, v_pool_distributed, p_admin_id, p_resolution_note
  ) RETURNING id INTO v_settlement_id;

  -- ── Update market status ──────────────────────────────────────────────────
  UPDATE markets
  SET status       = 'settled',
      winning_side = p_winning_side,
      settled_at   = NOW(),
      updated_at   = NOW()
  WHERE id = p_market_id;

  -- ── Audit log ─────────────────────────────────────────────────────────────
  INSERT INTO admin_log (admin_id, action, entity_type, entity_id, notes, metadata)
  VALUES (
    p_admin_id, 'market_settled', 'market', p_market_id,
    p_resolution_note,
    jsonb_build_object(
      'winning_side',    p_winning_side,
      'total_winners',   v_total_winners,
      'pool_distributed', v_pool_distributed,
      'platform_margin', v_platform_margin
    )
  );

  RETURN jsonb_build_object(
    'settlement_id',    v_settlement_id,
    'total_winners',    v_total_winners,
    'pool_distributed', v_pool_distributed,
    'platform_margin',  v_platform_margin
  );
END;
$$ LANGUAGE plpgsql;

-- ─── CREDIT WALLET (ATOMIC) ───────────────────────────────────────────────────
-- Used by the Paystack webhook handler for deposits.
-- Confirms the pending transaction created by deposit/initiate rather than
-- inserting a duplicate. Falls back to INSERT only if no pending tx exists
-- (handles rare case where webhook fires before the pending tx is written).
CREATE OR REPLACE FUNCTION credit_wallet(
  p_user_id      UUID,
  p_amount       NUMERIC,
  p_provider     TEXT,
  p_provider_ref TEXT,
  p_metadata     JSONB DEFAULT '{}'
) RETURNS JSONB AS $$
DECLARE
  v_user   users%ROWTYPE;
  v_tx_id  UUID;
BEGIN
  SELECT * INTO v_user FROM users WHERE id = p_user_id FOR UPDATE;

  -- Idempotency: reject if this provider_ref was already confirmed
  IF EXISTS (
    SELECT 1 FROM transactions
    WHERE provider_ref = p_provider_ref AND status = 'confirmed'
  ) THEN
    RAISE EXCEPTION 'already_processed';
  END IF;

  -- Credit wallet
  UPDATE users
  SET wallet_balance = wallet_balance + p_amount, updated_at = NOW()
  WHERE id = p_user_id;

  -- Try to UPDATE the pending transaction created by deposit/initiate
  -- (matched by ref = p_provider_ref, status = 'pending', same user)
  UPDATE transactions
  SET status         = 'confirmed',
      balance_before = v_user.wallet_balance,
      balance_after  = v_user.wallet_balance + p_amount,
      provider       = p_provider,
      provider_ref   = p_provider_ref,
      metadata       = p_metadata,
      updated_at     = NOW()
  WHERE ref      = p_provider_ref
    AND user_id  = p_user_id
    AND status   = 'pending'
  RETURNING id INTO v_tx_id;

  -- Fallback: INSERT if no pending transaction exists
  IF v_tx_id IS NULL THEN
    INSERT INTO transactions (
      user_id, type, amount, balance_before, balance_after,
      status, provider, provider_ref, ref, metadata
    ) VALUES (
      p_user_id, 'deposit', p_amount,
      v_user.wallet_balance,
      v_user.wallet_balance + p_amount,
      'confirmed', p_provider, p_provider_ref,
      'dep_' || p_provider_ref,
      p_metadata
    ) RETURNING id INTO v_tx_id;
  END IF;

  RETURN jsonb_build_object(
    'transaction_id', v_tx_id,
    'new_balance',    v_user.wallet_balance + p_amount
  );
END;
$$ LANGUAGE plpgsql;
