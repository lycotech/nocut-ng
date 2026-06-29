import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { JwtPayload } from '../types';
import pool from '../db/client';

export async function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  const token = authHeader.slice(7);
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    res.status(500).json({ error: 'Server misconfiguration' });
    return;
  }

  let payload: JwtPayload;
  try {
    payload = jwt.verify(token, secret) as JwtPayload;
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
    return;
  }

  // Verify user exists in DB and is not banned/deleted
  try {
    const { rows } = await pool.query<{ id: string; is_admin: boolean }>(
      'SELECT id, is_admin FROM users WHERE id = $1',
      [payload.sub]
    );
    if (rows.length === 0) {
      res.status(401).json({ error: 'User account not found' });
      return;
    }
    // Attach full payload; enrich is_admin from DB (source of truth)
    req.user = { ...payload, is_admin: rows[0].is_admin };
  } catch {
    res.status(500).json({ error: 'Authentication check failed' });
    return;
  }

  next();
}
