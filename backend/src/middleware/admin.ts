import { Request, Response, NextFunction } from 'express';

/** Must be used after requireAuth. Rejects non-admin requests with 403. */
export function requireAdmin(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  if (!req.user?.is_admin) {
    res.status(403).json({ error: 'Admin access required' });
    return;
  }
  next();
}
