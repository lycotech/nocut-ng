// Phase 3 — Paystack Webhook Handler
// express.raw() is applied to this route in index.ts so we get the raw Buffer.
import { Router, Request, Response, NextFunction } from 'express';
import { verifyPaystackSignature } from '../lib/paystack/webhook';
import { PaystackWebhookEvent } from '../types';
import pool from '../db/client';

const router = Router();

router.post(
  '/paystack',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const signature = req.headers['x-paystack-signature'] as string | undefined;
      const rawBody   = (req as Request & { rawBody?: Buffer }).rawBody;

      // Step 1: Signature verification — reject immediately if invalid
      if (!signature || !rawBody || !verifyPaystackSignature(rawBody, signature)) {
        console.warn('[webhook] Invalid Paystack signature — rejecting');
        res.status(401).json({ error: 'Invalid signature' });
        return;
      }

      const event = req.body as PaystackWebhookEvent;

      // Always respond 200 quickly; Paystack retries on non-200
      res.status(200).json({ received: true });

      // Process asynchronously after responding
      await handlePaystackEvent(event).catch((err) => {
        console.error('[webhook] Processing error:', err);
      });
    } catch (err) {
      next(err);
    }
  }
);

async function handlePaystackEvent(event: PaystackWebhookEvent): Promise<void> {
  switch (event.event) {
    case 'charge.success':
      await handleChargeSuccess(event);
      break;
    case 'transfer.success':
      await handleTransferSuccess(event);
      break;
    case 'transfer.failed':
      await handleTransferFailed(event);
      break;
    default:
      // Log unhandled event types for future implementation
      console.info('[webhook] Unhandled event type:', event.event);
  }
}

async function handleChargeSuccess(event: PaystackWebhookEvent): Promise<void> {
  const { reference, amount, customer, metadata } = event.data;
  const amountNgn = amount / 100;   // convert kobo → naira

  // Step 2: Look up the pending transaction to get user_id
  const txRes = await pool.query<{ id: string; user_id: string; status: string }>(
    `SELECT id, user_id, status FROM transactions WHERE ref = $1`,
    [reference]
  );

  if (txRes.rows.length === 0) {
    // Transaction not found — could be from a different flow; log and skip
    console.warn('[webhook] charge.success: no matching transaction for ref', reference);
    return;
  }

  const tx = txRes.rows[0];

  // Step 3: Idempotency check — skip if already confirmed
  if (tx.status === 'confirmed') {
    console.info('[webhook] charge.success: already processed, skipping ref', reference);
    return;
  }

  // Step 4: Credit wallet atomically using the credit_wallet DB function
  await pool.query(
    `SELECT credit_wallet($1, $2, $3, $4, $5)`,
    [
      tx.user_id,
      amountNgn,
      'paystack',
      reference,
      JSON.stringify({
        customer_email: customer.email,
        customer_code:  customer.customer_code,
        gateway:        event.data.gateway_response,
        metadata,
      }),
    ]
  );

  console.info(`[webhook] Credited ₦${amountNgn} to user ${tx.user_id} — ref: ${reference}`);
}

async function handleTransferSuccess(event: PaystackWebhookEvent): Promise<void> {
  const { reference } = event.data;

  // Mark the withdrawal transaction as confirmed
  await pool.query(
    `UPDATE transactions SET status = 'confirmed', updated_at = NOW() WHERE ref = $1`,
    [reference]
  );

  // Mark the withdrawal request as completed
  await pool.query(
    `UPDATE withdrawal_requests SET status = 'completed', updated_at = NOW()
     WHERE transaction_id = (SELECT id FROM transactions WHERE ref = $1)`,
    [reference]
  );

  console.info('[webhook] Transfer success for ref:', reference);
}

async function handleTransferFailed(event: PaystackWebhookEvent): Promise<void> {
  const { reference } = event.data;

  // Mark the withdrawal transaction as failed
  await pool.query(
    `UPDATE transactions SET status = 'failed', updated_at = NOW() WHERE ref = $1`,
    [reference]
  );

  // Refund the user's wallet (re-credit the held amount)
  const wdrRes = await pool.query<{ user_id: string; amount: string }>(
    `SELECT wr.user_id, wr.amount
     FROM withdrawal_requests wr
     JOIN transactions t ON t.id = wr.transaction_id
     WHERE t.ref = $1`,
    [reference]
  );

  if (wdrRes.rows.length > 0) {
    const { user_id, amount } = wdrRes.rows[0];
    await pool.query(
      `UPDATE users SET wallet_balance = wallet_balance + $1, updated_at = NOW() WHERE id = $2`,
      [amount, user_id]
    );

    await pool.query(
      `UPDATE withdrawal_requests SET status = 'rejected', rejection_reason = 'Transfer failed',
       updated_at = NOW()
       WHERE transaction_id = (SELECT id FROM transactions WHERE ref = $1)`,
      [reference]
    );
  }

  console.warn('[webhook] Transfer failed for ref:', reference);
}

export default router;
