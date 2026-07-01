import express, { Request, Response } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import dotenv from 'dotenv';

import { generalLimiter } from './middleware/rateLimit';
import { errorHandler } from './middleware/errorHandler';
import authRouter     from './routes/auth';
import meRouter       from './routes/me';
import marketsRouter, { leaderboardRouter } from './routes/markets';
import stakesRouter   from './routes/stakes';
import walletRouter   from './routes/wallet';
import webhooksRouter from './routes/webhooks';
import adminRouter    from './routes/admin';

dotenv.config();

const app  = express();
const PORT = process.env.PORT || 4000;

// ─── Security headers ─────────────────────────────────────────────────────────
app.set('trust proxy', 1);
app.use(helmet());

// ─── CORS — lock to nocut.ng domains ─────────────────────────────────────────
const allowedOrigins = [
  'https://nocut.ng',
  'https://www.nocut.ng',
  'http://localhost:3000',   // Next.js dev
  'http://localhost:3001',
];

app.use(cors({
  origin: (origin, cb) => {
    if (!origin || allowedOrigins.includes(origin)) return cb(null, true);
    cb(new Error(`CORS: origin ${origin} not allowed`));
  },
  credentials: true,
}));

// ─── Raw body for webhook signature verification ──────────────────────────────
// Must come BEFORE express.json() to capture the raw buffer on webhook routes
app.use('/api/webhooks', express.raw({ type: 'application/json' }), (req, _res, next) => {
  (req as Request & { rawBody?: Buffer }).rawBody = req.body as Buffer;
  next();
});

// ─── Body parsing for all other routes ───────────────────────────────────────
app.use(express.json({ limit: '1mb' }));

// ─── Global rate limit ────────────────────────────────────────────────────────
app.use('/api', generalLimiter);

// ─── Routes ───────────────────────────────────────────────────────────────────
app.use('/api/auth',         authRouter);
app.use('/api/me',           meRouter);       // /api/me, /api/me/self-exclude, /api/me/kyc, /api/me/referral
app.use('/api/markets',      marketsRouter);
app.use('/api/leaderboard',  leaderboardRouter);
app.use('/api/me/stakes',    stakesRouter);
app.use('/api',              walletRouter);   // /api/me/wallet, /api/me/deposit, /api/me/withdraw, /api/banks
app.use('/api/webhooks',     webhooksRouter);
app.use('/api/admin',        adminRouter);

// ─── Health check ─────────────────────────────────────────────────────────────
app.get('/health', (_req, res: Response) => {
  res.json({ status: 'ok', env: process.env.NODE_ENV });
});

// ─── Dev-only: generate a test JWT ───────────────────────────────────────────
// DELETE this block before production. Used to obtain tokens for local testing.
if (process.env.NODE_ENV === 'development') {
  const jwt = require('jsonwebtoken') as typeof import('jsonwebtoken');
  app.post('/dev/token', async (req, res: Response) => {
    const { user_id, is_admin = false } = req.body as { user_id: string; is_admin?: boolean };
    if (!user_id) { res.status(400).json({ error: 'user_id required' }); return; }
    const token = jwt.sign(
      { sub: user_id, is_admin, role: 'authenticated' },
      process.env.JWT_SECRET as string,
      { expiresIn: '24h' }
    );
    res.json({ token });
  });
}

// ─── 404 handler ─────────────────────────────────────────────────────────────
app.use((_req, res: Response) => {
  res.status(404).json({ error: 'Route not found' });
});

// ─── Global error handler ─────────────────────────────────────────────────────
app.use(errorHandler as never);

// ─── Start ────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`[server] NoCut.ng backend running on http://localhost:${PORT}`);
  console.log(`[server] Environment: ${process.env.NODE_ENV}`);
});

export default app;
