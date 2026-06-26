import type { Request, Response, NextFunction } from 'express';
import { config } from '../../config';

// spec §12: /admin/* 固定 token 鉴权
export function adminAuth(req: Request, res: Response, next: NextFunction): void {
  const auth = req.header('authorization') ?? '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (!token || token !== config.adminToken) {
    res.status(401).json({ c: 1, m: 'unauthorized' });
    return;
  }
  next();
}
