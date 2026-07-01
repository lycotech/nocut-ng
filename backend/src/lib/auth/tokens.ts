import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import pool from '../../db/client';
import { JwtPayload } from '../../types';

const ACCESS_TOKEN_TTL  = '24h';
const REFRESH_TOKEN_TTL = 30 * 24 * 60 * 60; // 30 days in seconds

function getSecret(): string {
  const s = process.env.JWT_SECRET;
  if (!s) throw new Error('JWT_SECRET is not configured');
  return s;
}

/** Sign a short-lived access JWT. */
export function signAccessToken(payload: Omit<JwtPayload, 'iat' | 'exp'>): string {
  return jwt.sign(payload, getSecret(), { expiresIn: ACCESS_TOKEN_TTL });
}

/** Create an opaque refresh token, store its hash in DB, return the raw token. */
export async function createRefreshToken(userId: string): Promise<string> {
  const raw  = crypto.randomBytes(48).toString('hex');
  const hash = crypto.createHash('sha256').update(raw).digest('hex');
  const expiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL * 1000);

  await pool.query(
    `INSERT INTO refresh_tokens (user_id, token_hash, expires_at)
     VALUES ($1, $2, $3)`,
    [userId, hash, expiresAt]
  );

  return raw;
}

/** Exchange a refresh token for a new access token. Returns null if invalid/expired. */
export async function rotateRefreshToken(
  rawToken: string
): Promise<{ accessToken: string; refreshToken: string; userId: string } | null> {
  const hash = crypto.createHash('sha256').update(rawToken).digest('hex');

  const { rows } = await pool.query<{ user_id: string; expires_at: Date; revoked: boolean }>(
    `SELECT user_id, expires_at, revoked FROM refresh_tokens WHERE token_hash = $1`,
    [hash]
  );

  if (!rows[0] || rows[0].revoked || new Date() > rows[0].expires_at) {
    return null;
  }

  // Revoke the old token (rotation — one-time use)
  await pool.query(`UPDATE refresh_tokens SET revoked = TRUE WHERE token_hash = $1`, [hash]);

  const userId = rows[0].user_id;

  // Fetch user for JWT payload
  const { rows: userRows } = await pool.query<{ email: string; is_admin: boolean }>(
    `SELECT email, is_admin FROM users WHERE id = $1`,
    [userId]
  );

  if (!userRows[0]) return null;

  const accessToken  = signAccessToken({ sub: userId, email: userRows[0].email, is_admin: userRows[0].is_admin, role: 'authenticated' });
  const refreshToken = await createRefreshToken(userId);

  return { accessToken, refreshToken, userId };
}

/** Revoke all refresh tokens for a user (logout all devices). */
export async function revokeAllTokens(userId: string): Promise<void> {
  await pool.query(
    `UPDATE refresh_tokens SET revoked = TRUE WHERE user_id = $1 AND revoked = FALSE`,
    [userId]
  );
}
