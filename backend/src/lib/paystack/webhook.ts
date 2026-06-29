import crypto from 'crypto';

/**
 * Verifies the X-Paystack-Signature header against the raw request body.
 * Paystack signs with HMAC-SHA512 using the secret key.
 * MUST be called before any webhook processing — reject immediately if invalid.
 */
export function verifyPaystackSignature(rawBody: Buffer, signature: string): boolean {
  const secret = process.env.PAYSTACK_SECRET_KEY;
  if (!secret) throw new Error('PAYSTACK_SECRET_KEY is not configured');

  const hash = crypto
    .createHmac('sha512', secret)
    .update(rawBody)
    .digest('hex');

  return hash === signature;
}
