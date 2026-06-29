import { Request, Response, NextFunction } from 'express';

export class AppError extends Error {
  constructor(
    public statusCode: number,
    public message: string,
    public code?: string
  ) {
    super(message);
    this.name = 'AppError';
  }
}

// Map DB-level exception codes → user-facing messages
const DB_ERROR_MESSAGES: Record<string, { status: number; message: string }> = {
  market_not_active:   { status: 400, message: 'This market is no longer accepting positions' },
  age_not_confirmed:   { status: 403, message: 'Please confirm you are 18+ before taking a position' },
  kyc_not_verified:    { status: 403, message: 'Please complete KYC verification before taking a position' },
  user_self_excluded:  { status: 403, message: 'Your account is currently in a cooling-off period' },
  insufficient_balance:{ status: 400, message: 'Your wallet balance is too low. Please deposit funds.' },
  daily_limit_exceeded:{ status: 400, message: 'You have reached your daily position limit' },
  stake_exceeds_pool:  { status: 400, message: 'This amount would overshoot the reward pool. Try a smaller amount.' },
  market_not_closed:   { status: 400, message: 'Market must be closed before it can be settled' },
  invalid_winning_side:{ status: 400, message: 'Winning side must be yes or no' },
  already_settled:     { status: 409, message: 'This market has already been settled' },
  already_processed:   { status: 409, message: 'This transaction has already been processed' },
  invalid_amount:      { status: 400, message: 'Amount must be greater than zero' },
};

export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  // AppError — intentional, known errors
  if (err instanceof AppError) {
    res.status(err.statusCode).json({ error: err.message, code: err.code });
    return;
  }

  // PostgreSQL raised exceptions from DB functions (e.g. place_stake)
  if (err && typeof err === 'object' && 'message' in err) {
    const msg = (err as { message: string }).message;
    const mapped = DB_ERROR_MESSAGES[msg];
    if (mapped) {
      res.status(mapped.status).json({ error: mapped.message, code: msg });
      return;
    }
  }

  // Unexpected error — log it, never expose internals to client
  console.error('[error]', err);
  res.status(500).json({ error: 'Something went wrong. Please try again.' });
}
