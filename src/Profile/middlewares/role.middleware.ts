/**
 * role.middleware.ts
 * Role-based access control middleware
 */

import { Request, Response, NextFunction } from 'express';
import ResponseUtil from '@/shared/response.util';
import { LoggerUtil } from '@/shared/logger.util';

interface UserPayload {
    userId: string;
    role: string;
    sessionId: string;
    deviceId: string;
}

/**
 * Require specific role
 */
export const requireRole = (requiredRole: string) => {
    return (req: Request & { user?: UserPayload }, res: Response, next: NextFunction) => {
        const userRole = req.user?.role;

        if (!userRole) {
            LoggerUtil.warn('Role check failed - no role found', {
                userId: req.user?.userId,
                path: req.path,
            });

            return ResponseUtil.forbidden(res, 'Access denied');
        }

        if (userRole !== requiredRole && userRole !== 'super_admin') {
            LoggerUtil.warn('Role check failed - insufficient permissions', {
                userId: req.user?.userId,
                userRole,
                requiredRole,
                path: req.path,
            });

            return ResponseUtil.forbidden(
                res,
                `${requiredRole.charAt(0).toUpperCase() + requiredRole.slice(1)} privileges required`
            );
        }

        next();
    };
};

/**
 * Require any of the specified roles
 */
export const requireAnyRole = (roles: string[]) => {
    return (req: Request & { user?: UserPayload }, res: Response, next: NextFunction) => {
        const userRole = req.user?.role;

        if (!userRole) {
            return ResponseUtil.forbidden(res, 'Access denied');
        }

        if (!roles.includes(userRole) && userRole !== 'super_admin') {
            LoggerUtil.warn('Role check failed - insufficient permissions', {
                userId: req.user?.userId,
                userRole,
                requiredRoles: roles,
                path: req.path,
            });

            return ResponseUtil.forbidden(res, 'Insufficient permissions');
        }

        next();
    };
};

export default { requireRole, requireAnyRole };