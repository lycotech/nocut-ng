-- NoCut.ng — Migration 005: Auth Fields

-- Add password hash to users (null for OAuth-only accounts)
-- Kept in users table but NEVER selected with SELECT * in application code
ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash TEXT;

-- OTP verification codes
-- Covers: signup email confirmation, phone OTP, password reset
CREATE TABLE IF NOT EXISTS otp_verifications (
  id         UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  identifier TEXT    NOT NULL,    -- email address or phone number
  otp_code   TEXT    NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  used       BOOLEAN NOT NULL DEFAULT FALSE,
  purpose    TEXT    NOT NULL DEFAULT 'signup'
               CHECK (purpose IN ('signup', 'login', 'reset_password')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_otp_lookup
  ON otp_verifications (identifier, purpose, used, expires_at);

-- Refresh tokens table for persistent sessions
CREATE TABLE IF NOT EXISTS refresh_tokens (
  id         UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID    NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT    NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  revoked    BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user ON refresh_tokens(user_id);
