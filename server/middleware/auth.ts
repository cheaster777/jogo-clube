import type { NextFunction, Request, Response } from 'express';
import type { AppConfig } from '../config';
import { AppError, asyncHandler } from '../errors';
import { loadAuthUser } from '../auth/session';
import type { AuthenticatedRequest, Queryable } from '../types';

export function requireAuth(db: Queryable, config: AppConfig) {
  return asyncHandler(async (req: Request, _res: Response, next: NextFunction) => {
    const auth = await loadAuthUser(db, req, config);
    if (!auth) {
      next(new AppError(401, 'UNAUTHORIZED', 'Autenticação necessária.'));
      return;
    }
    const authenticated = req as AuthenticatedRequest;
    authenticated.user = auth.user;
    authenticated.sessionId = auth.sessionId;
    next();
  });
}
