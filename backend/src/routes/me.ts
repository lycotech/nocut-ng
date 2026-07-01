// /api/me — Current user profile, settings, KYC, self-exclusion
import { Router, Request, Response, NextFunction } from 'express';
import { requireAuth } from '../middleware/auth';
import { AppError } from '../middleware/errorHandler';
import pool from '../db/client';

const router = Router();

// ─── GET /api/me ──────────────────────────────────────────────────────────────
router.get('/', requireAuth as never, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, email, phone, display_name, avatar_url, wallet_balance,
              kyc_status, kyc_verified_at, daily_stake_limit,
              self_excluded, self_excluded_until,
              is_admin, referral_code, age_confirmed,
              created_at, updated_at
       FROM users WHERE id = $1`,
      [req.user!.sub]
    );
    if (!rows[0]) throw new AppError(404, 'User not found');
    res.json({ data: rows[0] });
  } catch (err) {
    next(err);
  }
});

// ─── PATCH /api/me ────────────────────────────────────────────────────────────
// Update allowed profile fields only. Sensitive fields (wallet, kyc_status,
// is_admin) are never writable via this endpoint.
router.patch('/', requireAuth as never, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { display_name, avatar_url, age_confirmed } = req.body as {
      display_name?: string;
      avatar_url?: string;
      age_confirmed?: boolean;
    };

    // age_confirmed is one-way: once true it cannot be set back to false
    const { rows: current } = await pool.query<{ age_confirmed: boolean }>(
      'SELECT age_confirmed FROM users WHERE id = $1', [req.user!.sub]
    );
    if (!current[0]) throw new AppError(404, 'User not found');

    const newAgeConfirmed = current[0].age_confirmed
      ? true
      : (age_confirmed ?? false);

    const { rows } = await pool.query(
      `UPDATE users
       SET display_name  = COALESCE($2, display_name),
           avatar_url    = COALESCE($3, avatar_url),
           age_confirmed = $4,
           updated_at    = NOW()
       WHERE id = $1
       RETURNING id, email, phone, display_name, avatar_url, wallet_balance,
                 kyc_status, daily_stake_limit, self_excluded, self_excluded_until,
                 is_admin, referral_code, age_confirmed, created_at, updated_at`,
      [req.user!.sub, display_name?.trim() ?? null, avatar_url ?? null, newAgeConfirmed]
    );

    res.json({ data: rows[0] });
  } catch (err) {
    next(err);
  }
});

// ─── PATCH /api/me/self-exclude ───────────────────────────────────────────────
// User activates a cooling-off period. Cannot be reversed before the period ends.
router.patch('/self-exclude', requireAuth as never, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { duration } = req.body as { duration: '1_week' | '1_month' | '3_months' };

    const durationsMap: Record<string, string> = {
      '1_week':   'INTERVAL \'7 days\'',
      '1_month':  'INTERVAL \'1 month\'',
      '3_months': 'INTERVAL \'3 months\'',
    };

    if (!durationsMap[duration]) {
      throw new AppError(400, 'Duration must be 1_week, 1_month, or 3_months');
    }

    const { rows: current } = await pool.query<{ self_excluded: boolean; self_excluded_until: Date | null }>(
      'SELECT self_excluded, self_excluded_until FROM users WHERE id = $1', [req.user!.sub]
    );
    if (!current[0]) throw new AppError(404, 'User not found');

    // Cannot override an active exclusion with a shorter one
    if (current[0].self_excluded_until && current[0].self_excluded_until > new Date()) {
      throw new AppError(409, 'A cooling-off period is already active. It will lift on ' +
        current[0].self_excluded_until.toLocaleDateString('en-NG', { timeZone: 'Africa/Lagos' }));
    }

    await pool.query(
      `UPDATE users
       SET self_excluded       = TRUE,
           self_excluded_until = NOW() + ${durationsMap[duration]},
           updated_at          = NOW()
       WHERE id = $1`,
      [req.user!.sub]
    );

    res.json({ data: { message: 'Cooling-off period activated. Staking is now disabled for your account.' } });
  } catch (err) {
    next(err);
  }
});

// ─── POST /api/me/kyc/verify-bvn ─────────────────────────────────────────────
// Server-side BVN verification via Paystack Identity API.
// BVN is encrypted at rest; never returned in any API response.
router.post('/kyc/verify-bvn', requireAuth as never, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { bvn } = req.body as { bvn: string };

    if (!bvn?.match(/^\d{11}$/)) {
      throw new AppError(400, 'BVN must be exactly 11 digits');
    }

    const { rows } = await pool.query<{ kyc_status: string }>(
      'SELECT kyc_status FROM users WHERE id = $1', [req.user!.sub]
    );
    if (!rows[0]) throw new AppError(404, 'User not found');
    if (rows[0].kyc_status === 'verified') {
      throw new AppError(409, 'Your identity is already verified');
    }

    // Set status to pending while Paystack verifies
    await pool.query(
      `UPDATE users SET kyc_status = 'pending', updated_at = NOW() WHERE id = $1`,
      [req.user!.sub]
    );

    // TODO: call Paystack Identity API and encrypt BVN before storing.
    // For now, mark as verified in development to unblock staking tests.
    if (process.env.NODE_ENV === 'development') {
      await pool.query(
        `UPDATE users
         SET kyc_status = 'verified', kyc_verified_at = NOW(), kyc_bvn = $2, updated_at = NOW()
         WHERE id = $1`,
        [req.user!.sub, `[DEV_BVN:${bvn}]`]
      );
      res.json({ data: { kyc_status: 'verified', message: 'Identity verified (development mode).' } });
      return;
    }

    // Production: POST to Paystack Identity API
    // const result = await verifyBvnWithPaystack(bvn, user email/dob);
    // Encrypt BVN with AES-256 before storing.
    res.json({ data: { kyc_status: 'pending', message: 'Verification in progress. You will be notified once confirmed.' } });
  } catch (err) {
    next(err);
  }
});

// ─── GET /api/me/referral ─────────────────────────────────────────────────────
// Returns referral code + stats (how many signed up, bonuses earned).
router.get('/referral', requireAuth as never, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { rows } = await pool.query(
      `SELECT u.referral_code,
              COUNT(r.id)                                          AS referrals_count,
              COALESCE(SUM(r.bonus_amount) FILTER (WHERE r.bonus_paid), 0) AS total_earned
       FROM users u
       LEFT JOIN referrals r ON r.referrer_id = u.id
       WHERE u.id = $1
       GROUP BY u.referral_code`,
      [req.user!.sub]
    );
    if (!rows[0]) throw new AppError(404, 'User not found');

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://nocut.ng';
    res.json({
      data: {
        referral_code: rows[0].referral_code,
        referral_url:  `${appUrl}/r/${rows[0].referral_code}`,
        referrals_count: parseInt(rows[0].referrals_count),
        total_earned:    rows[0].total_earned,
      },
    });
  } catch (err) {
    next(err);
  }
});

export default router;
