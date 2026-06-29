import rateLimit from 'express-rate-limit';

/** General rate limit: 100 requests per 15 minutes per IP. */
export const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests. Please try again later.' },
});

/** Stake rate limit: 20 requests per minute per IP (additional user-level check in route). */
export const stakeLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many position requests. Please slow down.' },
});

/** Deposit/withdraw: 10 per 15 minutes per IP. */
export const paymentLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many payment requests. Please try again later.' },
});
