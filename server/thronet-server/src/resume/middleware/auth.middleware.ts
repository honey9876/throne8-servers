/**
 * src/resume/middleware/auth.middleware.ts
 * Bridge: wraps throne8-servers' AuthMiddleware so resume module's `protect`
 * is fully compatible. After authentication:
 *   - req.user  → set by throne8 AuthMiddleware (req.user.userId, req.user.id, etc.)
 *   - req.userId → injected here for resume controllers that use req.userId directly
 */
import { Request, Response, NextFunction } from 'express';
import AuthMiddleware from '@/shared/middlewares/auth.middleware';
import { ParamsDictionary } from 'express-serve-static-core';

// Resume controllers use this extended request type
export interface AuthRequest<
  P = ParamsDictionary,
  ResBody = any,
  ReqBody = any,
  ReqQuery = any,
> extends Request<P, ResBody, ReqBody, ReqQuery> {
  userId?: string;
}

/**
 * `protect` — drop-in replacement for resume12's own protect middleware.
 * Delegates to throne8's full JWT auth (blacklist, device, session checks),
 * then maps req.user.userId → req.userId for resume controller compatibility.
 */
export const protect = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  await AuthMiddleware.authenticate(req as any, res, async (err?: any) => {
    if (err) return next(err);
    // Map throne8's req.user.userId to the simple req.userId used by resume controllers
    if (req.user) {
      (req as any).userId = req.user.userId || (req.user as any).id || (req.user as any)._id;
    }
    next();
  });
};
