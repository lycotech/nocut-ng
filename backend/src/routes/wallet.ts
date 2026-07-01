// Phase 3 — Wallet & Payments
import { Router, Request, Response, NextFunction } from 'express';
import { requireAuth } from '../middleware/auth';
import { paymentLimiter } from '../middleware/rateLimit';
import { Transaction, User } from '../types';
import { AppError } from '../middleware/errorHandler';
import pool from '../db/client';
import { initializePayment, verifyTransaction, resolveAccount, listBanks } from '../lib/flutterwave/client';
import { generateRef } from '../lib/utils/format';

const router = Router();

// ─── GET /api/me/wallet ───────────────────────────────────────────────────────
// Returns wallet balance and last 10 transactions.
router.get(
  '/me/wallet',
  requireAuth as never,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.user!.sub;

      const [userRes, txRes, dailyRes] = await Promise.all([
        pool.query<Pick<User, 'wallet_balance' | 'daily_stake_limit'>>(
          'SELECT wallet_balance, daily_stake_limit FROM users WHERE id = $1', [userId]
        ),
        pool.query<Transaction>(
          `SELECT id, type, amount, status, ref, market_id, created_at
           FROM transactions WHERE user_id = $1 ORDER BY created_at DESC LIMIT 10`,
          [userId]
        ),
        pool.query<{ daily_staked: string }>(
          `SELECT COALESCE(SUM(s.amount), 0) AS daily_staked
           FROM stakes s
           JOIN transactions t ON t.stake_id = s.id
           WHERE s.user_id = $1 AND t.created_at >= CURRENT_DATE AND t.status = 'confirmed'`,
          [userId]
        ),
      ]);

      if (userRes.rows.length === 0) throw new AppError(404, 'User not found');

      const user = userRes.rows[0];

      res.json({
        data: {
          balance:            user.wallet_balance,
          daily_stake_limit:  user.daily_stake_limit,
          daily_staked_today: dailyRes.rows[0].daily_staked,
          transactions:       txRes.rows,
        },
      });
    } catch (err) {
      next(err);
    }
  }
);

// ─── GET /api/me/transactions ─────────────────────────────────────────────────
// Paginated, filterable transaction history.
router.get(
  '/me/transactions',
  requireAuth as never,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId   = req.user!.sub;
      const page     = Math.max(1, parseInt(req.query['page']  as string) || 1);
      const limit    = Math.min(50, parseInt(req.query['limit'] as string) || 20);
      const offset   = (page - 1) * limit;
      const type     = req.query['type']      as string | undefined;
      const dateFrom = req.query['date_from'] as string | undefined;
      const dateTo   = req.query['date_to']   as string | undefined;

      const conditions: string[] = ['user_id = $1'];
      const params: unknown[] = [userId];
      let i = 2;

      if (type) {
        conditions.push(`type = $${i++}`);
        params.push(type);
      }
      if (dateFrom) {
        conditions.push(`created_at >= $${i++}`);
        params.push(dateFrom);
      }
      if (dateTo) {
        conditions.push(`created_at <= $${i++}`);
        params.push(dateTo);
      }

      const where = conditions.join(' AND ');

      const [dataRes, countRes] = await Promise.all([
        pool.query<Transaction>(
          `SELECT id, type, amount, balance_before, balance_after, status, ref, market_id, provider, created_at
           FROM transactions WHERE ${where}
           ORDER BY created_at DESC LIMIT $${i} OFFSET $${i + 1}`,
          [...params, limit, offset]
        ),
        pool.query<{ count: string }>(
          `SELECT COUNT(*) AS count FROM transactions WHERE ${where}`,
          params
        ),
      ]);

      res.json({
        data: {
          transactions: dataRes.rows,
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

// ─── POST /api/me/deposit/initiate ───────────────────────────────────────────
// Calls Flutterwave to create a hosted checkout link. Client redirects/opens the link.
router.post(
  '/me/deposit/initiate',
  requireAuth as never,
  paymentLimiter,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.user!.sub;
      const { amount } = req.body as { amount: number };

      if (!amount || amount < 100) {
        throw new AppError(400, 'Minimum deposit amount is ₦100');
      }
      if (amount > 5_000_000) {
        throw new AppError(400, 'Maximum single deposit is ₦5,000,000');
      }

      // Fetch user email + display name for Flutterwave
      const { rows } = await pool.query<Pick<User, 'email' | 'display_name'>>(
        'SELECT email, display_name FROM users WHERE id = $1', [userId]
      );
      if (!rows[0]?.email) throw new AppError(400, 'Account email is required to deposit');

      const reference = generateRef('dep');

      // Create pending transaction record first (idempotency anchor)
      await pool.query(
        `INSERT INTO transactions (user_id, type, amount, balance_before, balance_after, status, ref, provider, metadata)
         SELECT $1, 'deposit', $2, wallet_balance, wallet_balance, 'pending', $3, 'flutterwave',
                jsonb_build_object('initiated_at', NOW())
         FROM users WHERE id = $1`,
        [userId, amount, reference]
      );

      const flwRes = await initializePayment({
        email:        rows[0].email,
        name:         rows[0].display_name ?? 'NoCut.ng User',
        amount,
        tx_ref:       reference,
        redirect_url: `${process.env.APP_URL}/api/me/deposit/callback`,
        metadata:     { user_id: userId },
      });

      if (flwRes.status !== 'success') {
        throw new AppError(502, 'Payment gateway error. Please try again.');
      }

      res.json({
        data: {
          authorization_url: flwRes.data.link,
          reference,
        },
      });
    } catch (err) {
      next(err);
    }
  }
);

// ─── GET /api/me/deposit/callback ────────────────────────────────────────────
// Flutterwave redirects the user's browser here after hosted checkout completes.
// Public route (no auth header on a browser redirect) — identifies the user via
// the tx_ref on the pending transaction. Verifies server-side via the Flutterwave
// API rather than trusting the query string, as a second confirmation path
// alongside the webhook (credit_wallet() is idempotent, so whichever fires first wins).
router.get('/me/deposit/callback', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { status, tx_ref, transaction_id } = req.query as Record<string, string>;

    if (!tx_ref) throw new AppError(400, 'Missing transaction reference');

    if (status !== 'successful' || !transaction_id) {
      await pool.query(
        `UPDATE transactions SET status = 'failed', updated_at = NOW() WHERE ref = $1 AND status = 'pending'`,
        [tx_ref]
      );
      res.json({ data: { status: 'failed', message: 'Payment was not completed.' } });
      return;
    }

    const { rows: txRows } = await pool.query<{ id: string; user_id: string; amount: string; status: string }>(
      `SELECT id, user_id, amount, status FROM transactions WHERE ref = $1`,
      [tx_ref]
    );
    if (!txRows[0]) throw new AppError(404, 'Transaction not found');

    if (txRows[0].status === 'confirmed') {
      res.json({ data: { status: 'success', message: 'Deposit already confirmed.' } });
      return;
    }

    const verified = await verifyTransaction(transaction_id);
    const v = verified.data;

    if (
      verified.status !== 'success' ||
      v.status !== 'successful' ||
      v.tx_ref !== tx_ref ||
      v.currency !== 'NGN' ||
      Number(v.amount) !== Number(txRows[0].amount)
    ) {
      throw new AppError(400, 'Payment verification failed. Please contact support if you were charged.');
    }

    try {
      await pool.query(
        `SELECT credit_wallet($1, $2, $3, $4, $5)`,
        [
          txRows[0].user_id,
          v.amount,
          'flutterwave',
          tx_ref,
          JSON.stringify({ flw_ref: v.flw_ref, flw_transaction_id: v.id, customer_email: v.customer.email }),
        ]
      );
    } catch (creditErr) {
      // The webhook may have credited concurrently — that's success, not an error.
      if (!(creditErr as Error).message?.includes('already_processed')) throw creditErr;
    }

    res.json({ data: { status: 'success', message: 'Deposit confirmed. Your wallet has been credited.' } });
  } catch (err) {
    next(err);
  }
});

// ─── POST /api/me/withdraw ────────────────────────────────────────────────────
// Queues a withdrawal request. Wallet debit happens when admin approves.
router.post(
  '/me/withdraw',
  requireAuth as never,
  paymentLimiter,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.user!.sub;
      const { amount, bank_code, account_number, account_name } = req.body as {
        amount: number;
        bank_code: string;
        account_number: string;
        account_name: string;
      };

      if (!amount || amount < 500)    throw new AppError(400, 'Minimum withdrawal is ₦500');
      if (!bank_code)                  throw new AppError(400, 'Bank code is required');
      if (!account_number?.match(/^\d{10}$/)) throw new AppError(400, 'Account number must be 10 digits');
      if (!account_name)               throw new AppError(400, 'Account name is required');

      // Verify user has sufficient balance
      const { rows } = await pool.query<Pick<User, 'wallet_balance'>>(
        'SELECT wallet_balance FROM users WHERE id = $1',
        [userId]
      );
      if (!rows[0]) throw new AppError(404, 'User not found');
      if (parseFloat(rows[0].wallet_balance) < amount) {
        throw new AppError(400, 'Your wallet balance is insufficient for this withdrawal');
      }

      const ref = generateRef('wdr');

      // Create pending transaction and withdrawal request atomically
      const client = await pool.connect();
      try {
        await client.query('BEGIN');

        const txRes = await client.query<{ id: string }>(
          `INSERT INTO transactions (user_id, type, amount, balance_before, balance_after, status, ref, provider)
           SELECT $1, 'withdrawal', $2, wallet_balance, wallet_balance - $2, 'pending', $3, 'flutterwave'
           FROM users WHERE id = $1
           RETURNING id`,
          [userId, amount, ref]
        );

        const wdrRes = await client.query<{ id: string }>(
          `INSERT INTO withdrawal_requests (user_id, amount, bank_code, account_number, account_name, transaction_id)
           VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
          [userId, amount, bank_code, account_number, account_name, txRes.rows[0].id]
        );

        await client.query('COMMIT');

        res.status(201).json({
          data: {
            withdrawal_id: wdrRes.rows[0].id,
            message: 'Withdrawal request submitted. Processing within 1-2 business days.',
          },
        });
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally {
        client.release();
      }
    } catch (err) {
      next(err);
    }
  }
);

// ─── GET /api/banks ───────────────────────────────────────────────────────────
// Public: list of supported Nigerian banks (for withdrawal form).
router.get('/banks', async (_req, res: Response, next: NextFunction) => {
  try {
    const banks = await listBanks();
    res.json({ data: banks.data });
  } catch (err) {
    next(err);
  }
});

// ─── GET /api/banks/resolve ───────────────────────────────────────────────────
// Verify account number + bank code → returns account name for confirmation.
router.get(
  '/banks/resolve',
  requireAuth as never,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { account_number, bank_code } = req.query as Record<string, string>;
      if (!account_number || !bank_code) {
        throw new AppError(400, 'account_number and bank_code are required');
      }

      const result = await resolveAccount({ account_number, account_bank: bank_code });
      if (result.status !== 'success') {
        throw new AppError(400, 'Could not verify account details. Please check and try again.');
      }

      res.json({ data: result.data });
    } catch (err) {
      next(err);
    }
  }
);

export default router;
