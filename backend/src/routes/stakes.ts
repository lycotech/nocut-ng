// Phase 5 — Staking Engine
import { Router, Request, Response, NextFunction } from 'express';
import { requireAuth } from '../middleware/auth';
import { stakeLimiter } from '../middleware/rateLimit';
import { Stake } from '../types';
import { AppError } from '../middleware/errorHandler';
import pool from '../db/client';

const router = Router();

// ─── POST /api/me/stakes ──────────────────────────────────────────────────────
// Place a stake. Calls place_stake() DB function — all validation is atomic in DB.
router.post(
  '/',
  requireAuth as never,
  stakeLimiter,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.user!.sub;
      const { market_id, side, amount } = req.body as {
        market_id: string;
        side: 'yes' | 'no';
        amount: number;
      };

      // Client-side pre-validation (prevents unnecessary DB round-trips)
      if (!market_id) throw new AppError(400, 'Market ID is required');
      if (!['yes', 'no'].includes(side)) throw new AppError(400, 'Side must be yes or no');
      if (!amount || amount <= 0) throw new AppError(400, 'Stake amount must be greater than zero');
      if (amount > 1_000_000) throw new AppError(400, 'Single stake cannot exceed ₦1,000,000');

      // The DB function handles all remaining validations atomically:
      // market active, age confirmed, KYC verified, not self-excluded,
      // wallet balance, daily limit, pool overshoot
      const { rows } = await pool.query<{ place_stake: { stake_id: string; expected_payout: string } }>(
        'SELECT place_stake($1, $2, $3, $4) AS place_stake',
        [userId, market_id, side, amount]
      );

      const result = rows[0].place_stake;

      res.status(201).json({
        data: {
          stake_id:        result.stake_id,
          expected_payout: result.expected_payout,
          message:         `Position placed! Expected payout: ₦${parseFloat(result.expected_payout).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`,
        },
      });
    } catch (err) {
      next(err);
    }
  }
);

// ─── GET /api/me/stakes ───────────────────────────────────────────────────────
// Returns the authenticated user's stake history (active + settled).
router.get(
  '/',
  requireAuth as never,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.user!.sub;
      const page   = Math.max(1, parseInt(req.query['page']   as string) || 1);
      const limit  = Math.min(50, parseInt(req.query['limit'] as string) || 20);
      const offset = (page - 1) * limit;
      const status = req.query['status'] as string | undefined; // 'active' | 'settled'

      let marketStatusFilter = '';
      if (status === 'active')  marketStatusFilter = "AND m.status IN ('active','closed')";
      if (status === 'settled') marketStatusFilter = "AND m.status = 'settled'";

      const [dataRes, countRes] = await Promise.all([
        pool.query<Stake & { market_title: string; market_status: string; market_category: string }>(
          `SELECT s.id, s.market_id, s.side, s.amount, s.expected_payout,
                  s.actual_payout, s.is_winner, s.created_at,
                  m.title AS market_title, m.status AS market_status,
                  m.category AS market_category, m.winning_side AS market_winning_side,
                  m.reward_pool, m.total_yes, m.total_no
           FROM stakes s
           JOIN markets m ON m.id = s.market_id
           WHERE s.user_id = $1 ${marketStatusFilter}
           ORDER BY s.created_at DESC
           LIMIT $2 OFFSET $3`,
          [userId, limit, offset]
        ),
        pool.query<{ count: string }>(
          `SELECT COUNT(*) AS count FROM stakes s
           JOIN markets m ON m.id = s.market_id
           WHERE s.user_id = $1 ${marketStatusFilter}`,
          [userId]
        ),
      ]);

      res.json({
        data: {
          stakes: dataRes.rows,
          pagination: {
            page,
            limit,
            total:       parseInt(countRes.rows[0].count),
            total_pages: Math.ceil(parseInt(countRes.rows[0].count) / limit),
          },
        },
      });
    } catch (err) {
      next(err);
    }
  }
);

// ─── GET /api/me/stakes/:id ───────────────────────────────────────────────────
// Single stake detail.
router.get(
  '/:id',
  requireAuth as never,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId  = req.user!.sub;
      const stakeId = req.params.id;

      const { rows } = await pool.query(
        `SELECT s.*, m.title AS market_title, m.status AS market_status,
                m.category AS market_category, m.winning_side AS market_winning_side,
                m.reward_pool, m.closes_at, m.settled_at
         FROM stakes s
         JOIN markets m ON m.id = s.market_id
         WHERE s.id = $1 AND s.user_id = $2`,
        [stakeId, userId]
      );

      if (rows.length === 0) throw new AppError(404, 'Position not found');

      res.json({ data: rows[0] });
    } catch (err) {
      next(err);
    }
  }
);

export default router;
