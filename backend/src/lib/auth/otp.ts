import crypto from 'crypto';
import pool from '../../db/client';

const OTP_EXPIRY_MINUTES = 10;

/** Generate a cryptographically random 6-digit OTP. */
export function generateOtpCode(): string {
  return String(crypto.randomInt(100000, 999999));
}

/** Store a new OTP, invalidating any existing unused OTPs for the same identifier + purpose. */
export async function createOtp(
  identifier: string,
  purpose: 'signup' | 'login' | 'reset_password'
): Promise<string> {
  const code      = generateOtpCode();
  const expiresAt = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000);

  // Invalidate previous unused OTPs for this identifier + purpose
  await pool.query(
    `UPDATE otp_verifications SET used = TRUE
     WHERE identifier = $1 AND purpose = $2 AND used = FALSE`,
    [identifier, purpose]
  );

  await pool.query(
    `INSERT INTO otp_verifications (identifier, otp_code, expires_at, purpose)
     VALUES ($1, $2, $3, $4)`,
    [identifier, code, expiresAt, purpose]
  );

  return code;
}

/** Verify an OTP. Marks it used on success. Throws on invalid/expired. */
export async function verifyOtp(
  identifier: string,
  code: string,
  purpose: 'signup' | 'login' | 'reset_password'
): Promise<void> {
  const { rows } = await pool.query<{ id: string; expires_at: Date }>(
    `SELECT id, expires_at FROM otp_verifications
     WHERE identifier = $1 AND otp_code = $2 AND purpose = $3 AND used = FALSE
     ORDER BY created_at DESC LIMIT 1`,
    [identifier, code, purpose]
  );

  if (rows.length === 0) {
    throw new Error('invalid_otp');
  }

  if (new Date() > rows[0].expires_at) {
    throw new Error('otp_expired');
  }

  await pool.query(
    `UPDATE otp_verifications SET used = TRUE WHERE id = $1`,
    [rows[0].id]
  );
}
