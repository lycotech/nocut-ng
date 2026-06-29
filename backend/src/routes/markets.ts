// Phase 4 — Market Feed & Detail
import { Router, Request, Response, NextFunction } from 'express';
import pool from '../db/client';
import { AppError } from '../middleware/errorHandler';
import { Market } from '../types';
import { yesPct, poolFillPercent, expectedPayout } from '../lib/frp/formulas';

const router = Router();

// ─── GET /api/markets ─────────────────────────────────────────────────────────
// Public. Returns paginated active markets with computed display fields.
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const page     = Math.max(1, parseInt(req.query['page']     as string) || 1);
    const limit    = Math.min(50, parseInt(req.query['limit']   as string) || 20);
    const offset   = (page - 1) * limit;
    const category = req.query['category'] as string | undefined;

    const conditions = ["status = 'active'"];
    const params: unknown[] = [];
    let i = 1;

    if (category && category !== 'all') {
      conditions.push(`category = $${i++}`);
      params.push(category);
    }

    const where = conditions.join(' AND ');

    const [dataRes, countRes] = await Promise.all([
      pool.query<Market>(
        // Sort by most-filled first (drives urgency per spec)
        `SELECT id, title, description, category, reward_pool, total_yes, total_no,
                status, closes_at, resolves_at, created_at
         FROM markets
         WHERE ${where}
         ORDER BY (total_yes + total_no) / reward_pool DESC, created_at DESC
         LIMIT $${i} OFFSET $${i + 1}`,
        [...params, limit, offset]
      ),
      pool.query<{ count: string }>(
        `SELECT COUNT(*) AS count FROM markets WHERE ${where}`,
        params
      ),
    ]);

    const markets = dataRes.rows.map((m) => enrichMarket(m as Market));

    res.json({
      data: {
        markets,
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
});

// ─── GET /api/markets/:id ─────────────────────────────────────────────────────
// Public. Full market detail including recent activity.
router.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;

    const [marketRes, activityRes] = await Promise.all([
      pool.query<Market>(
        `SELECT m.*, s.id AS settlement_id, s.winning_side AS settled_winning_side,
                s.total_winners, s.pool_distributed, s.platform_margin, s.settled_at AS settlement_date
         FROM markets m
         LEFT JOIN settlements s ON s.market_id = m.id
         WHERE m.id = $1 AND m.status IN ('active','closed','settled')`,
        [id]
      ),
      // Last 10 anonymised stakes for activity feed
      pool.query<{
        side: string;
        amount: string;
        created_at: Date;
        display_name: string | null;
      }>(
        `SELECT s.side, s.amount, s.created_at,
                CASE WHEN LENGTH(u.display_name) > 0
                     THEN LEFT(u.display_name, 3) || '***'
                     ELSE 'Anonymous' END AS display_name
         FROM stakes s
         JOIN users u ON u.id = s.user_id
         WHERE s.market_id = $1
         ORDER BY s.created_at DESC
         LIMIT 10`,
        [id]
      ),
    ]);

    if (marketRes.rows.length === 0) throw new AppError(404, 'Market not found');

    const market   = marketRes.rows[0] as Market;
    const enriched = enrichMarket(market);

    res.json({
      data: {
        ...enriched,
        recent_activity: activityRes.rows,
      },
    });
  } catch (err) {
    next(err);
  }
});

// ─── GET /api/markets/:id/payout-preview ─────────────────────────────────────
// Public. Given a stake amount + side, return expected payout.
// Used by frontend PayoutCalculator (debounced 300ms client-side).
router.get('/:id/payout-preview', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id }   = req.params;
    const amount   = parseFloat(req.query['amount'] as string);
    const side     = req.query['side'] as 'yes' | 'no';

    if (!amount || amount <= 0 || !['yes','no'].includes(side)) {
      throw new AppError(400, 'Valid amount and side (yes/no) are required');
    }

    const { rows } = await pool.query<Pick<Market, 'total_yes' | 'total_no' | 'reward_pool' | 'status'>>(
      'SELECT total_yes, total_no, reward_pool, status FROM markets WHERE id = $1',
      [id]
    );

    if (!rows[0]) throw new AppError(404, 'Market not found');
    if (rows[0].status !== 'active') throw new AppError(400, 'Market is not active');

    const sideTotal  = parseFloat(side === 'yes' ? rows[0].total_yes : rows[0].total_no);
    const rewardPool = parseFloat(rows[0].reward_pool);
    const payout     = expectedPayout(amount, sideTotal, rewardPool);

    res.json({
      data: {
        amount,
        side,
        expected_payout: payout.toFixed(2),
        return_on_stake: ((payout - amount) / amount * 100).toFixed(1) + '%',
      },
    });
  } catch (err) {
    next(err);
  }
});

// ─── GET /api/leaderboard ─────────────────────────────────────────────────────
// Public. Top 50 users by profit this week (settled payouts minus stakes).
router.get('/leaderboard', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const { rows } = await pool.query<{
      display_name: string;
      correct_predictions: string;
      total_profit: string;
      win_rate: string;
    }>(
      `SELECT
         CASE WHEN LENGTH(u.display_name) > 3
              THEN LEFT(u.display_name, 3) || '***'
              ELSE '***' END AS display_name,
         COUNT(s.id) FILTER (WHERE s.is_winner = TRUE)  AS correct_predictions,
         COALESCE(SUM(s.actual_payout - s.amount) FILTER (WHERE s.is_winner = TRUE), 0) AS total_profit,
         ROUND(
           COUNT(s.id) FILTER (WHERE s.is_winner = TRUE)::NUMERIC /
           NULLIF(COUNT(s.id) FILTER (WHERE s.is_winner IS NOT NULL), 0) * 100, 1
         ) AS win_rate
       FROM users u
       JOIN stakes s ON s.user_id = u.id
       JOIN markets m ON m.id = s.market_id
       WHERE m.settled_at >= DATE_TRUNC('week', NOW())
         AND s.is_winner IS NOT NULL
       GROUP BY u.id, u.display_name
       ORDER BY total_profit DESC
       LIMIT 50`
    );

    res.json({ data: { leaderboard: rows } });
  } catch (err) {
    next(err);
  }
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

function enrichMarket(m: Market) {
  const totalYes   = parseFloat(m.total_yes);
  const totalNo    = parseFloat(m.total_no);
  const rewardPool = parseFloat(m.reward_pool);

  return {
    ...m,
    // Computed display fields — never stored in DB
    yes_pct:          yesPct(totalYes, totalNo).toFixed(1),
    no_pct:           (100 - yesPct(totalYes, totalNo)).toFixed(1),
    pool_fill_pct:    poolFillPercent(totalYes + totalNo, rewardPool).toFixed(1),
    yes_expected_payout: expectedPayout(1000, totalYes, rewardPool).toFixed(2),  // preview for ₦1k stake
    no_expected_payout:  expectedPayout(1000, totalNo,  rewardPool).toFixed(2),
  };
}

export default router;
