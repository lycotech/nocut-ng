// Phase 2 — Authentication
import { Router, Request, Response, NextFunction } from 'express';
import bcrypt from 'bcryptjs';
import pool from '../db/client';
import { AppError } from '../middleware/errorHandler';
import { requireAuth } from '../middleware/auth';
import { authLimiter, otpLimiter } from '../middleware/rateLimit';
import { createOtp, verifyOtp } from '../lib/auth/otp';
import { signAccessToken, createRefreshToken, rotateRefreshToken, revokeAllTokens } from '../lib/auth/tokens';
import { sendOtpEmail, sendOtpSms } from '../lib/email/service';
import { generateReferralCode } from '../lib/utils/format';

const router  = Router();
const BCRYPT_ROUNDS = 12;

// Safe user shape returned in all auth responses — never includes sensitive fields
function safeUser(u: Record<string, unknown>) {
  return {
    id:            u.id,
    email:         u.email,
    phone:         u.phone,
    display_name:  u.display_name,
    avatar_url:    u.avatar_url,
    wallet_balance:u.wallet_balance,
    kyc_status:    u.kyc_status,
    is_admin:      u.is_admin,
    age_confirmed: u.age_confirmed,
    referral_code: u.referral_code,
    created_at:    u.created_at,
  };
}

// ─── POST /api/auth/signup ────────────────────────────────────────────────────
// Creates account + sends OTP. User is inactive until OTP verified.
router.post('/signup', authLimiter, otpLimiter, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { email, phone, display_name, password, referral_code: usedReferralCode } = req.body as {
      email?: string;
      phone?: string;
      display_name: string;
      password: string;
      referral_code?: string;
    };

    if (!display_name?.trim())        throw new AppError(400, 'Display name is required');
    if (!email && !phone)             throw new AppError(400, 'Email or phone number is required');
    if (!password || password.length < 8) throw new AppError(400, 'Password must be at least 8 characters');

    const identifier = email?.toLowerCase() ?? phone!;

    // Check for existing account
    if (email) {
      const { rows } = await pool.query('SELECT id FROM users WHERE email = $1', [email.toLowerCase()]);
      if (rows.length > 0) throw new AppError(409, 'An account with this email already exists');
    }
    if (phone) {
      const { rows } = await pool.query('SELECT id FROM users WHERE phone = $1', [phone]);
      if (rows.length > 0) throw new AppError(409, 'An account with this phone number already exists');
    }

    // Resolve referrer
    let referredById: string | null = null;
    if (usedReferralCode) {
      const { rows } = await pool.query<{ id: string }>(
        'SELECT id FROM users WHERE referral_code = $1', [usedReferralCode]
      );
      referredById = rows[0]?.id ?? null;
    }

    const passwordHash   = await bcrypt.hash(password, BCRYPT_ROUNDS);
    const myReferralCode = generateReferralCode();

    // Insert user (not yet verified — kyc_status stays 'unverified')
    const { rows } = await pool.query<{ id: string }>(
      `INSERT INTO users (email, phone, display_name, password_hash, referral_code, referred_by)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
      [
        email?.toLowerCase() ?? null,
        phone ?? null,
        display_name.trim(),
        passwordHash,
        myReferralCode,
        referredById,
      ]
    );
    const userId = rows[0].id;

    // Create referral record if referred
    if (referredById) {
      await pool.query(
        `INSERT INTO referrals (referrer_id, referee_id) VALUES ($1, $2)`,
        [referredById, userId]
      );
    }

    // Generate and send OTP
    const otp = await createOtp(identifier, 'signup');
    if (email) {
      await sendOtpEmail(email, otp, 'signup');
    } else {
      await sendOtpSms(phone!, otp);
    }

    res.status(201).json({
      data: {
        user_id:    userId,
        identifier,
        message:    `Verification code sent to ${email ? 'your email' : 'your phone'}. Enter it to activate your account.`,
      },
    });
  } catch (err) {
    next(err);
  }
});

// ─── POST /api/auth/verify-otp ────────────────────────────────────────────────
// Verifies the OTP and returns access + refresh tokens.
router.post('/verify-otp', authLimiter, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { identifier, otp_code, purpose = 'signup' } = req.body as {
      identifier: string;
      otp_code: string;
      purpose?: 'signup' | 'login' | 'reset_password';
    };

    if (!identifier) throw new AppError(400, 'Email or phone is required');
    if (!otp_code)   throw new AppError(400, 'Verification code is required');

    // Verify OTP (throws on invalid/expired)
    try {
      await verifyOtp(identifier.toLowerCase(), otp_code, purpose);
    } catch (err) {
      const msg = (err as Error).message;
      if (msg === 'otp_expired') throw new AppError(400, 'This code has expired. Please request a new one.');
      throw new AppError(400, 'Invalid verification code. Please check and try again.');
    }

    // Fetch user
    const { rows } = await pool.query(
      `SELECT id, email, phone, display_name, wallet_balance, kyc_status, is_admin,
              age_confirmed, referral_code, avatar_url, created_at
       FROM users WHERE email = $1 OR phone = $1`,
      [identifier.toLowerCase()]
    );
    if (!rows[0]) throw new AppError(404, 'Account not found');

    const user = rows[0];

    // Issue tokens
    const accessToken  = signAccessToken({ sub: user.id, email: user.email, is_admin: user.is_admin, role: 'authenticated' });
    const refreshToken = await createRefreshToken(user.id);

    res.json({
      data: {
        access_token:  accessToken,
        refresh_token: refreshToken,
        user:          safeUser(user),
      },
    });
  } catch (err) {
    next(err);
  }
});

// ─── POST /api/auth/login ─────────────────────────────────────────────────────
// Email + password login. Returns access + refresh tokens immediately.
router.post('/login', authLimiter, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { email, password } = req.body as { email: string; password: string };

    if (!email)    throw new AppError(400, 'Email is required');
    if (!password) throw new AppError(400, 'Password is required');

    const { rows } = await pool.query(
      `SELECT id, email, phone, display_name, wallet_balance, kyc_status, is_admin,
              age_confirmed, referral_code, avatar_url, created_at, password_hash
       FROM users WHERE email = $1`,
      [email.toLowerCase()]
    );

    // Use generic message to prevent email enumeration
    const INVALID_MSG = 'Invalid email or password';
    if (!rows[0] || !rows[0].password_hash) throw new AppError(401, INVALID_MSG);

    const valid = await bcrypt.compare(password, rows[0].password_hash);
    if (!valid) throw new AppError(401, INVALID_MSG);

    const user = rows[0];
    const accessToken  = signAccessToken({ sub: user.id, email: user.email, is_admin: user.is_admin, role: 'authenticated' });
    const refreshToken = await createRefreshToken(user.id);

    res.json({
      data: {
        access_token:  accessToken,
        refresh_token: refreshToken,
        user:          safeUser(user),
      },
    });
  } catch (err) {
    next(err);
  }
});

// ─── POST /api/auth/resend-otp ────────────────────────────────────────────────
// Send a fresh OTP to the given identifier.
router.post('/resend-otp', otpLimiter, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { identifier, purpose = 'signup' } = req.body as {
      identifier: string;
      purpose?: 'signup' | 'login' | 'reset_password';
    };

    if (!identifier) throw new AppError(400, 'Email or phone is required');

    // Verify account exists (don't reveal if it doesn't)
    const isEmail = identifier.includes('@');
    const field   = isEmail ? 'email' : 'phone';
    const { rows } = await pool.query(`SELECT id FROM users WHERE ${field} = $1`, [identifier.toLowerCase()]);

    if (rows.length > 0) {
      const otp = await createOtp(identifier.toLowerCase(), purpose);
      if (isEmail) {
        await sendOtpEmail(identifier, otp, purpose);
      } else {
        await sendOtpSms(identifier, otp);
      }
    }

    // Always respond the same way to prevent enumeration
    res.json({
      data: { message: 'If an account exists for this identifier, a verification code has been sent.' },
    });
  } catch (err) {
    next(err);
  }
});

// ─── POST /api/auth/forgot-password ──────────────────────────────────────────
// Send a password-reset OTP to the user's email.
router.post('/forgot-password', otpLimiter, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { email } = req.body as { email: string };
    if (!email) throw new AppError(400, 'Email is required');

    const { rows } = await pool.query('SELECT id FROM users WHERE email = $1', [email.toLowerCase()]);

    if (rows.length > 0) {
      const otp = await createOtp(email.toLowerCase(), 'reset_password');
      await sendOtpEmail(email, otp, 'reset_password');
    }

    res.json({
      data: { message: 'If an account exists for this email, a password reset code has been sent.' },
    });
  } catch (err) {
    next(err);
  }
});

// ─── POST /api/auth/reset-password ───────────────────────────────────────────
// Verify reset OTP + set new password.
router.post('/reset-password', authLimiter, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { email, otp_code, new_password } = req.body as {
      email: string;
      otp_code: string;
      new_password: string;
    };

    if (!email)        throw new AppError(400, 'Email is required');
    if (!otp_code)     throw new AppError(400, 'Reset code is required');
    if (!new_password || new_password.length < 8) throw new AppError(400, 'Password must be at least 8 characters');

    try {
      await verifyOtp(email.toLowerCase(), otp_code, 'reset_password');
    } catch (err) {
      const msg = (err as Error).message;
      if (msg === 'otp_expired') throw new AppError(400, 'This reset code has expired. Please request a new one.');
      throw new AppError(400, 'Invalid reset code. Please check and try again.');
    }

    const passwordHash = await bcrypt.hash(new_password, BCRYPT_ROUNDS);
    await pool.query(
      `UPDATE users SET password_hash = $1, updated_at = NOW() WHERE email = $2`,
      [passwordHash, email.toLowerCase()]
    );

    res.json({ data: { message: 'Password updated successfully. You can now log in.' } });
  } catch (err) {
    next(err);
  }
});

// ─── POST /api/auth/refresh ───────────────────────────────────────────────────
// Exchange a valid refresh token for a new access + refresh token pair.
router.post('/refresh', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { refresh_token } = req.body as { refresh_token: string };
    if (!refresh_token) throw new AppError(400, 'Refresh token is required');

    const result = await rotateRefreshToken(refresh_token);
    if (!result) throw new AppError(401, 'Invalid or expired refresh token. Please log in again.');

    res.json({
      data: {
        access_token:  result.accessToken,
        refresh_token: result.refreshToken,
      },
    });
  } catch (err) {
    next(err);
  }
});

// ─── POST /api/auth/logout ────────────────────────────────────────────────────
// Revoke all refresh tokens for the current user.
router.post('/logout', requireAuth as never, async (req: Request, res: Response, next: NextFunction) => {
  try {
    await revokeAllTokens(req.user!.sub);
    res.json({ data: { message: 'Logged out successfully' } });
  } catch (err) {
    next(err);
  }
});

export default router;
