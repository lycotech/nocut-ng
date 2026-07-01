// Phase 3 — Payment Webhook Handlers
// express.raw() is applied to this route prefix in index.ts so we get the raw Buffer.
import { Router, Request, Response, NextFunction } from 'express';
import { verifyPaystackSignature } from '../lib/paystack/webhook';
import { verifyFlutterwaveSignature } from '../lib/flutterwave/webhook';
import { verifyTransaction as verifyFlutterwaveTransaction } from '../lib/flutterwave/client';
import { PaystackWebhookEvent, FlutterwaveWebhookEvent } from '../types';
import pool from '../db/client';

const router = Router();

// ─── Flutterwave — ACTIVE processor ──────────────────────────────────────────
router.post(
  '/flutterwave',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const receivedHash = req.headers['verif-hash'] as string | undefined;

      // Step 1: Signature verification — reject immediately if invalid.
      // Note: Flutterwave's verif-hash is a static shared secret, not an HMAC
      // of the body, so it cannot itself prove the payload wasn't tampered with.
      // We additionally re-verify the transaction via the Flutterwave API below
      // before crediting any wallet.
      if (!verifyFlutterwaveSignature(receivedHash)) {
        console.warn('[webhook] Invalid Flutterwave signature — rejecting');
        res.status(401).json({ error: 'Invalid signature' });
        return;
      }

      const event = req.body as FlutterwaveWebhookEvent;

      // Always respond 200 quickly; Flutterwave retries on non-200
      res.status(200).json({ received: true });

      await handleFlutterwaveEvent(event).catch((err) => {
        console.error('[webhook] Flutterwave processing error:', err);
      });
    } catch (err) {
      next(err);
    }
  }
);

async function handleFlutterwaveEvent(event: FlutterwaveWebhookEvent): Promise<void> {
  switch (event.event) {
    case 'charge.completed':
      await handleFlutterwaveChargeCompleted(event);
      break;
    case 'transfer.completed':
      await handleFlutterwaveTransferCompleted(event);
      break;
    default:
      console.info('[webhook] Unhandled Flutterwave event type:', event.event);
  }
}

async function handleFlutterwaveChargeCompleted(event: FlutterwaveWebhookEvent): Promise<void> {
  const { tx_ref, id, status } = event.data;

  if (status?.toLowerCase() !== 'successful') {
    console.info('[webhook] charge.completed: non-success status, skipping ref', tx_ref);
    return;
  }

  const txRes = await pool.query<{ id: string; user_id: string; amount: string; status: string }>(
    `SELECT id, user_id, amount, status FROM transactions WHERE ref = $1`,
    [tx_ref]
  );

  if (txRes.rows.length === 0) {
    console.warn('[webhook] charge.completed: no matching transaction for ref', tx_ref);
    return;
  }

  const tx = txRes.rows[0];

  if (tx.status === 'confirmed') {
    console.info('[webhook] charge.completed: already processed, skipping ref', tx_ref);
    return;
  }

  // Re-verify against the Flutterwave API before crediting — the webhook body
  // itself is not cryptographically signed, only gated by a static shared secret.
  const verified = await verifyFlutterwaveTransaction(id);
  const v = verified.data;
  if (
    verified.status !== 'success' ||
    v.status?.toLowerCase() !== 'successful' ||
    v.tx_ref !== tx_ref ||
    v.currency !== 'NGN' ||
    Number(v.amount) !== Number(tx.amount)
  ) {
    console.error('[webhook] charge.completed: verification mismatch for ref', tx_ref);
    return;
  }

  await pool.query(
    `SELECT credit_wallet($1, $2, $3, $4, $5)`,
    [
      tx.user_id,
      v.amount,
      'flutterwave',
      tx_ref,
      JSON.stringify({
        flw_ref:        v.flw_ref,
        flw_transaction_id: v.id,
        customer_email: v.customer.email,
      }),
    ]
  );

  console.info(`[webhook] Credited ₦${v.amount} to user ${tx.user_id} — ref: ${tx_ref}`);
}

async function handleFlutterwaveTransferCompleted(event: FlutterwaveWebhookEvent): Promise<void> {
  const { reference, status } = event.data;
  const isSuccess = status?.toUpperCase() === 'SUCCESSFUL';

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { rows: txRows } = await client.query<{ id: string; status: string }>(
      `SELECT id, status FROM transactions WHERE ref = $1 FOR UPDATE`,
      [reference]
    );
    if (txRows.length === 0) {
      console.warn('[webhook] transfer.completed: no matching transaction for ref', reference);
      await client.query('ROLLBACK');
      return;
    }
    if (txRows[0].status === 'confirmed' || txRows[0].status === 'failed') {
      console.info('[webhook] transfer.completed: already processed, skipping ref', reference);
      await client.query('ROLLBACK');
      return;
    }

    if (isSuccess) {
      await client.query(
        `UPDATE transactions SET status = 'confirmed', updated_at = NOW() WHERE id = $1`,
        [txRows[0].id]
      );
      await client.query(
        `UPDATE withdrawal_requests SET status = 'completed', updated_at = NOW()
         WHERE transaction_id = $1`,
        [txRows[0].id]
      );
    } else {
      await client.query(
        `UPDATE transactions SET status = 'failed', updated_at = NOW() WHERE id = $1`,
        [txRows[0].id]
      );

      // Refund the user's wallet (re-credit the held amount) and reject the withdrawal
      const { rows: wdrRows } = await client.query<{ user_id: string; amount: string }>(
        `SELECT wr.user_id, wr.amount
         FROM withdrawal_requests wr
         WHERE wr.transaction_id = $1
         FOR UPDATE`,
        [txRows[0].id]
      );

      if (wdrRows.length > 0) {
        const { user_id, amount } = wdrRows[0];
        await client.query(
          `UPDATE users SET wallet_balance = wallet_balance + $1, updated_at = NOW() WHERE id = $2`,
          [amount, user_id]
        );
        await client.query(
          `UPDATE withdrawal_requests SET status = 'rejected', rejection_reason = 'Transfer failed',
           updated_at = NOW()
           WHERE transaction_id = $1`,
          [txRows[0].id]
        );
      }
    }

    await client.query('COMMIT');
    console.info(`[webhook] Transfer ${isSuccess ? 'success' : 'failed'} for ref:`, reference);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// ─── Paystack — kept wired but inactive (see CLAUDE.md primary/secondary plan) ─
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

  const { rows: txRows } = await pool.query<{ id: string; status: string }>(
    `SELECT id, status FROM transactions WHERE ref = $1`,
    [reference]
  );
  if (txRows.length === 0) {
    console.warn('[webhook] transfer.success: no matching transaction for ref', reference);
    return;
  }
  if (txRows[0].status === 'confirmed') {
    console.info('[webhook] transfer.success: already processed, skipping ref', reference);
    return;
  }

  // Mark the withdrawal transaction as confirmed
  await pool.query(
    `UPDATE transactions SET status = 'confirmed', updated_at = NOW() WHERE id = $1`,
    [txRows[0].id]
  );

  // Mark the withdrawal request as completed
  await pool.query(
    `UPDATE withdrawal_requests SET status = 'completed', updated_at = NOW()
     WHERE transaction_id = $1`,
    [txRows[0].id]
  );

  console.info('[webhook] Transfer success for ref:', reference);
}

async function handleTransferFailed(event: PaystackWebhookEvent): Promise<void> {
  const { reference } = event.data;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Idempotency: skip if this transaction was already marked failed
    const { rows: txRows } = await client.query<{ id: string; status: string }>(
      `SELECT id, status FROM transactions WHERE ref = $1 FOR UPDATE`,
      [reference]
    );
    if (txRows.length === 0) {
      console.warn('[webhook] transfer.failed: no matching transaction for ref', reference);
      await client.query('ROLLBACK');
      return;
    }
    if (txRows[0].status === 'failed') {
      console.info('[webhook] transfer.failed: already processed, skipping ref', reference);
      await client.query('ROLLBACK');
      return;
    }

    await client.query(
      `UPDATE transactions SET status = 'failed', updated_at = NOW() WHERE id = $1`,
      [txRows[0].id]
    );

    // Refund the user's wallet (re-credit the held amount) and reject the withdrawal
    const { rows: wdrRows } = await client.query<{ user_id: string; amount: string }>(
      `SELECT wr.user_id, wr.amount
       FROM withdrawal_requests wr
       WHERE wr.transaction_id = $1
       FOR UPDATE`,
      [txRows[0].id]
    );

    if (wdrRows.length > 0) {
      const { user_id, amount } = wdrRows[0];
      await client.query(
        `UPDATE users SET wallet_balance = wallet_balance + $1, updated_at = NOW() WHERE id = $2`,
        [amount, user_id]
      );

      await client.query(
        `UPDATE withdrawal_requests SET status = 'rejected', rejection_reason = 'Transfer failed',
         updated_at = NOW()
         WHERE transaction_id = $1`,
        [txRows[0].id]
      );
    }

    await client.query('COMMIT');
    console.warn('[webhook] Transfer failed for ref:', reference);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export default router;
