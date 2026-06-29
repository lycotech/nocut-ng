-- NoCut.ng — Migration 003: Triggers

-- Auto-close trigger: fires BEFORE UPDATE on markets
-- When total_yes + total_no >= reward_pool and market is active → status = closed
DROP TRIGGER IF EXISTS market_auto_close ON markets;

CREATE TRIGGER market_auto_close
BEFORE UPDATE ON markets
FOR EACH ROW
EXECUTE FUNCTION check_market_auto_close();

-- updated_at timestamps — keep all tables self-maintaining
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS users_updated_at          ON users;
DROP TRIGGER IF EXISTS markets_updated_at        ON markets;
DROP TRIGGER IF EXISTS transactions_updated_at   ON transactions;
DROP TRIGGER IF EXISTS withdrawal_updated_at     ON withdrawal_requests;

CREATE TRIGGER users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER markets_updated_at
  BEFORE UPDATE ON markets
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER transactions_updated_at
  BEFORE UPDATE ON transactions
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER withdrawal_updated_at
  BEFORE UPDATE ON withdrawal_requests
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
