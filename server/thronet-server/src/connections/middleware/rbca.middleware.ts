// src/middleware/rbac.middleware.ts
import { Request, Response, NextFunction, RequestHandler } from 'express';
import logger, { LogCategory, PublicLogMetadata } from '../utils/logger';
import { ErrorResponse } from '../utils/response';
declare global {
  namespace Express {
    interface Request {
      user?: {
        [key: string]: any;
        id: string;
        email?: string;
        role: 'user' | 'admin';
      };
    }
  }
}

export const rbacMiddleware = (allowedRoles: string[]): RequestHandler => {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = req.user;

      if (!user) {
        logger.warn('Authentication required in RBAC middleware', {
          category: LogCategory.SECURITY,
          data: { url: req.originalUrl },
        } as PublicLogMetadata);
        return res.status(401).json(
          new ErrorResponse('Authentication required', 401, 'AUTH_REQUIRED')
        );
      }

      // Check if user's role is in allowed roles
      const userRoles = [user.role]; // Convert to array for consistency with example
if (!allowedRoles.some((role) => userRoles.includes(role as 'user' | 'admin'))) {
          logger.warn('Access denied due to insufficient permissions', {
          category: LogCategory.SECURITY,
          data: { url: req.originalUrl, userId: user.id, userRole: user.role, requiredRoles: allowedRoles },
        } as PublicLogMetadata);
        return res.status(403).json(
          new ErrorResponse(
            'Access denied. Insufficient permissions.',
            403,
            'INSUFFICIENT_PERMISSIONS',
            { required: allowedRoles, current: user.role }
          )
        );
      }

      return next(); // Explicit return for allowed access
    } catch (error : any) {
      logger.error('RBAC middleware error', {
        category: LogCategory.SECURITY,
        data: { url: req.originalUrl, error: error instanceof Error ? error.message : String(error) },
      } as PublicLogMetadata);
      return res.status(500).json(
        new ErrorResponse('Internal server error during authorization', 500, 'AUTH_ERROR')
      );
    }
  };
};




 export const roleBasedAccess = (allowedRoles: string[]): RequestHandler => {
  return (req: Request, res: Response, next: NextFunction) => {
   try {
  const user = req.user;

  if (!user) {
    logger.warn('Authentication required in RBAC middleware', {
      category: LogCategory.SECURITY,
      data: { url: req.originalUrl }
    } as PublicLogMetadata);
    return res.status(401).json(
      new ErrorResponse('Authentication required', 401, 'AUTH_REQUIRED')
    );
  }

      // Check if user's role is in allowed roles
      if (!allowedRoles.includes(user.role)) {
        logger.warn('Access denied due to insufficient permissions', {
          category: LogCategory.SECURITY,
          data: { url: req.originalUrl, userId: user.id, userRole: user.role, requiredRoles: allowedRoles }
        } as PublicLogMetadata);
        return res.status(403).json(
          new ErrorResponse(
            'Access denied. Insufficient permissions.',
            403,
            'INSUFFICIENT_PERMISSIONS',
            { required: allowedRoles, current: user.role }
          )
        );
      }

      return next(); // Add this line
} catch (error : any) {
  logger.error('RBAC middleware error', {
    category: LogCategory.SECURITY,
    data: { url: req.originalUrl, error: error instanceof Error ? error.message : String(error) },
  } as PublicLogMetadata);
  return res.status(500).json(
    new ErrorResponse('Internal server error during authorization', 500, 'AUTH_ERROR')
  );
}
  };
};

// Role hierarchy check
export const hasPermission = (userRole: string, requiredRole: string): boolean => {
  const roleHierarchy: Record<string, number> = {
    user: 1,
    premium: 2,
    admin: 3,
    system: 4,
    monitoring: 3,
  };

  return (roleHierarchy[userRole] || 0) >= (roleHierarchy[requiredRole] || 0);
};