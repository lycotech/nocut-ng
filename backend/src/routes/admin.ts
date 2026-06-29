// Admin routes — all require requireAuth + requireAdmin middleware
import { Router, Request, Response, NextFunction } from 'express';
import { requireAuth } from '../middleware/auth';
import { requireAdmin } from '../middleware/admin';
import { Market } from '../types';
import { AppError } from '../middleware/errorHandler';
import pool from '../db/client';

const router = Router();

const guard = [requireAuth as never, requireAdmin as never];

// ─── GET /api/admin/markets ───────────────────────────────────────────────────
router.get('/markets', ...guard, async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const { rows } = await pool.query<Market>(
      `SELECT * FROM markets ORDER BY created_at DESC`
    );
    res.json({ data: { markets: rows } });
  } catch (err) { next(err); }
});

// ─── POST /api/admin/markets ──────────────────────────────────────────────────
router.post('/markets', ...guard, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const {
      title, description, category, reward_pool,
      closes_at, resolves_at, resolution_criteria, resolution_source,
      publish = false,
    } = req.body as {
      title: string; description?: string; category: string; reward_pool: number;
      closes_at?: string; resolves_at?: string; resolution_criteria?: string;
      resolution_source?: string; publish?: boolean;
    };

    if (!title)        throw new AppError(400, 'Title is required');
    if (!category)     throw new AppError(400, 'Category is required');
    if (!reward_pool || reward_pool <= 0) throw new AppError(400, 'Reward pool must be greater than zero');

    const status = publish ? 'active' : 'draft';

    const { rows } = await pool.query<{ id: string }>(
      `INSERT INTO markets (title, description, category, reward_pool, status,
                            closes_at, resolves_at, resolution_criteria, resolution_source, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id`,
      [title, description, category, reward_pool, status,
       closes_at, resolves_at, resolution_criteria, resolution_source, req.user!.sub]
    );

    await pool.query(
      `INSERT INTO admin_log (admin_id, action, entity_type, entity_id, metadata)
       VALUES ($1, 'market_created', 'market', $2, $3)`,
      [req.user!.sub, rows[0].id, JSON.stringify({ status, reward_pool })]
    );

    res.status(201).json({ data: { market_id: rows[0].id, status } });
  } catch (err) { next(err); }
});

// ─── PATCH /api/admin/markets/:id ────────────────────────────────────────────
router.patch('/markets/:id', ...guard, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const { status, title, description, closes_at, resolves_at,
            resolution_criteria, resolution_source } = req.body as Partial<Market>;

    // Only allow status transitions: draft→active, active→closed (manually)
    if (status) {
      const validTransitions: Record<string, string[]> = {
        draft: ['active'],
        active: ['closed'],
      };
      const { rows: curr } = await pool.query<{ status: string }>(
        'SELECT status FROM markets WHERE id = $1', [id]
      );
      if (!curr[0]) throw new AppError(404, 'Market not found');
      if (!validTransitions[curr[0].status]?.includes(status)) {
        throw new AppError(400, `Cannot transition market from ${curr[0].status} to ${status}`);
      }
    }

    const { rows } = await pool.query<Market>(
      `UPDATE markets SET
         title               = COALESCE($2, title),
         description         = COALESCE($3, description),
         status              = COALESCE($4, status),
         closes_at           = COALESCE($5, closes_at),
         resolves_at         = COALESCE($6, resolves_at),
         resolution_criteria = COALESCE($7, resolution_criteria),
         resolution_source   = COALESCE($8, resolution_source),
         updated_at          = NOW()
       WHERE id = $1 RETURNING *`,
      [id, title, description, status, closes_at, resolves_at, resolution_criteria, resolution_source]
    );

    if (!rows[0]) throw new AppError(404, 'Market not found');

    await pool.query(
      `INSERT INTO admin_log (admin_id, action, entity_type, entity_id, metadata)
       VALUES ($1, 'market_updated', 'market', $2, $3)`,
      [req.user!.sub, id, JSON.stringify({ changes: req.body })]
    );

    res.json({ data: rows[0] });
  } catch (err) { next(err); }
});

// ─── POST /api/admin/markets/:id/settle ──────────────────────────────────────
router.post('/markets/:id/settle', ...guard, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const { winning_side, resolution_note } = req.body as {
      winning_side: 'yes' | 'no';
      resolution_note: string;
    };

    if (!winning_side || !['yes','no'].includes(winning_side)) {
      throw new AppError(400, 'winning_side must be yes or no');
    }
    if (!resolution_note?.trim()) {
      throw new AppError(400, 'resolution_note is required');
    }

    const { rows } = await pool.query(
      'SELECT settle_market($1, $2, $3, $4) AS result',
      [id, winning_side, req.user!.sub, resolution_note]
    );

    res.json({ data: rows[0].result });
  } catch (err) { next(err); }
});

// ─── GET /api/admin/withdrawals ───────────────────────────────────────────────
router.get('/withdrawals', ...guard, async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const { rows } = await pool.query(
      `SELECT wr.*, u.display_name, u.email
       FROM withdrawal_requests wr
       JOIN users u ON u.id = wr.user_id
       WHERE wr.status = 'pending'
       ORDER BY wr.created_at ASC`
    );
    res.json({ data: { withdrawals: rows } });
  } catch (err) { next(err); }
});

// ─── PATCH /api/admin/withdrawals/:id ────────────────────────────────────────
router.patch('/withdrawals/:id', ...guard, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const { action, rejection_reason } = req.body as {
      action: 'approve' | 'reject';
      rejection_reason?: string;
    };

    if (!['approve', 'reject'].includes(action)) {
      throw new AppError(400, 'action must be approve or reject');
    }

    if (action === 'reject') {
      if (!rejection_reason) throw new AppError(400, 'rejection_reason is required');

      await pool.query(
        `UPDATE withdrawal_requests
         SET status = 'rejected', rejection_reason = $2,
             approved_by = $3, updated_at = NOW()
         WHERE id = $1 AND status = 'pending'`,
        [id, rejection_reason, req.user!.sub]
      );
    } else {
      // Approve: debit user wallet, mark as processing
      const client = await pool.connect();
      try {
        await client.query('BEGIN');

        const { rows: wdrRows } = await client.query<{
          user_id: string; amount: string; transaction_id: string;
        }>(
          'SELECT user_id, amount, transaction_id FROM withdrawal_requests WHERE id = $1 AND status = $2 FOR UPDATE',
          [id, 'pending']
        );

        if (!wdrRows[0]) throw new AppError(404, 'Withdrawal request not found or already processed');

        const { user_id, amount, transaction_id } = wdrRows[0];

        // Debit wallet
        await client.query(
          'UPDATE users SET wallet_balance = wallet_balance - $1, updated_at = NOW() WHERE id = $2',
          [amount, user_id]
        );

        // Confirm the transaction record
        await client.query(
          'UPDATE transactions SET status = $1, updated_at = NOW() WHERE id = $2',
          ['confirmed', transaction_id]
        );

        await client.query(
          `UPDATE withdrawal_requests
           SET status = 'processing', approved_by = $2, updated_at = NOW()
           WHERE id = $1`,
          [id, req.user!.sub]
        );

        await client.query(
          `INSERT INTO admin_log (admin_id, action, entity_type, entity_id)
           VALUES ($1, 'withdrawal_approved', 'withdrawal', $2)`,
          [req.user!.sub, id]
        );

        await client.query('COMMIT');
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally {
        client.release();
      }
    }

    res.json({ data: { success: true } });
  } catch (err) { next(err); }
});

// ─── GET /api/admin/users ─────────────────────────────────────────────────────
router.get('/users', ...guard, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const page   = Math.max(1, parseInt(req.query['page']  as string) || 1);
    const limit  = Math.min(50, parseInt(req.query['limit'] as string) || 20);
    const offset = (page - 1) * limit;
    const search = req.query['q'] as string | undefined;

    const params: unknown[] = [];
    let where = 'WHERE 1=1';
    if (search) {
      params.push(`%${search}%`);
      where += ` AND (email ILIKE $${params.length} OR display_name ILIKE $${params.length} OR phone ILIKE $${params.length})`;
    }

    const [dataRes, countRes] = await Promise.all([
      pool.query(
        `SELECT id, email, phone, display_name, wallet_balance, kyc_status,
                is_admin, self_excluded, created_at,
                (SELECT COUNT(*) FROM stakes WHERE user_id = users.id) AS stake_count
         FROM users ${where} ORDER BY created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
        [...params, limit, offset]
      ),
      pool.query(`SELECT COUNT(*) AS count FROM users ${where}`, params),
    ]);

    res.json({
      data: {
        users: dataRes.rows,
        pagination: {
          page, limit,
          total:       parseInt(countRes.rows[0].count),
          total_pages: Math.ceil(parseInt(countRes.rows[0].count) / limit),
        },
      },
    });
  } catch (err) { next(err); }
});

// ─── GET /api/admin/pl ────────────────────────────────────────────────────────
router.get('/pl', ...guard, async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const { rows } = await pool.query(
      `SELECT
         COUNT(*)                    AS total_markets_settled,
         SUM(reward_pool)            AS total_reward_pools,
         SUM(total_staked)           AS total_staked,
         SUM(platform_margin)        AS total_platform_margin,
         AVG(platform_margin / NULLIF(total_staked, 0) * 100) AS avg_margin_pct
       FROM settlements`
    );
    res.json({ data: rows[0] });
  } catch (err) { next(err); }
});

// ─── GET /api/admin/audit ─────────────────────────────────────────────────────
router.get('/audit', ...guard, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const page   = Math.max(1, parseInt(req.query['page']  as string) || 1);
    const limit  = Math.min(100, parseInt(req.query['limit'] as string) || 20);
    const offset = (page - 1) * limit;

    const { rows } = await pool.query(
      `SELECT al.*, u.display_name AS admin_name
       FROM admin_log al
       JOIN users u ON u.id = al.admin_id
       ORDER BY al.timestamp DESC LIMIT $1 OFFSET $2`,
      [limit, offset]
    );

    res.json({ data: { audit_log: rows } });
  } catch (err) { next(err); }
});

export default router;
