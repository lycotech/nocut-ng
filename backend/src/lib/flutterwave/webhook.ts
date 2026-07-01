import crypto from 'crypto';

/**
 * Verifies the verif-hash header against the secret hash configured in the
 * Flutterwave dashboard (Settings → Webhooks). Unlike Paystack's HMAC scheme,
 * Flutterwave sends back the exact static secret you configured — so this is
 * a direct (timing-safe) string comparison, not a signature computation.
 * MUST be called before any webhook processing — reject immediately if invalid.
 */
export function verifyFlutterwaveSignature(receivedHash: string | undefined): boolean {
  const secretHash = process.env.FLUTTERWAVE_WEBHOOK_HASH;
  if (!secretHash) throw new Error('FLUTTERWAVE_WEBHOOK_HASH is not configured');
  if (!receivedHash) return false;

  const expected = Buffer.from(secretHash);
  const received = Buffer.from(receivedHash);
  if (expected.length !== received.length) return false;

  return crypto.timingSafeEqual(expected, received);
}
