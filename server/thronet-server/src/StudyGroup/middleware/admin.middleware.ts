/**
 * ====================================
 * ADMIN MIDDLEWARE
 * ====================================
 * Admin-only access control middleware
 */

import { Response, NextFunction } from 'express';
import { AuthRequest, ReqUser } from '@/shared/middlewares/auth.middleware';
import { AuthorizationError, ForbiddenError } from '@/shared/errors/app.error';
import { UserRole } from '../enums/UserRole.enum';
import { asyncHandler } from '@/shared/errors/app.error';
import { User } from '@/auth/models';
import { IUser } from '@/auth/models/User.model';

/**
 * Check if user is authenticated and is an admin
 */
export const isAdmin = asyncHandler(
  async (req: AuthRequest, _res: Response, next: NextFunction) => {
    // Check if user is authenticated
    if (!req.user?.id) {
      throw new AuthorizationError('Authentication required. Please login to continue');
    }

    // Fetch user with role
    const user = await User.findById(req.user?.id).select('role isActive');

    if (!user) {
      throw new AuthorizationError('User not found. Please login again');
    }

    // Check if user is active
    if (user.status !== 'active') {
      throw new AuthorizationError('Your account has been deactivated');
    }

    // Check if user has admin role
    if (user.role !== UserRole.ADMIN) {
      throw new ForbiddenError(
        'Access denied. Admin privileges required to perform this action'
      );
    }

    // Attach user to request
    req.user = user as unknown as ReqUser;
    next();
  }
);

/**
 * Check if user is admin or super admin
 */
export const isSuperAdmin = asyncHandler(
  async (req: AuthRequest, _res: Response, next: NextFunction) => {
    if (!req.user?.id) {
      throw new AuthorizationError('Authentication required');
    }

    const user = await User.findById(req.user?.id).select('role isActive email');

    if (!user) {
      throw new AuthorizationError('User not found');
    }

    if (user.status !== 'active') {
      throw new AuthorizationError('Account deactivated');
    }

    // Check if user is admin
    if (user.role !== UserRole.ADMIN) {
      throw new ForbiddenError('Admin access required');
    }

    // Optional: Check for super admin email (hardcoded list)
    const SUPER_ADMIN_EMAILS = (process.env.SUPER_ADMIN_EMAILS || '')
      .split(',')
      .map((email) => email.trim().toLowerCase());

    if (SUPER_ADMIN_EMAILS.length > 0 && !SUPER_ADMIN_EMAILS.includes(user.email)) {
      throw new ForbiddenError('Super admin access required');
    }

    req.user = user as unknown as ReqUser;

    next();
  }
);

/**
 * Check if user is admin or mentor
 */
export const isAdminOrMentor = asyncHandler(
  async (req: AuthRequest, _res: Response, next: NextFunction) => {
    if (!req.user?.id) {
      throw new AuthorizationError('Authentication required');
    }

    const user = await User.findById(req.user?.id).select('role isActive');

    if (!user) {
      throw new AuthorizationError('User not found');
    }

    if (user.status !== 'active') {
      throw new AuthorizationError('Account deactivated');
    }

    // Check if user is admin or mentor
    if (user.role !== UserRole.ADMIN && user.role !== UserRole.MENTOR) {
      throw new ForbiddenError(
        'Access denied. Admin or Mentor privileges required'
      );
    }

    req.user = user as unknown as ReqUser;;

    next();
  }
);

/**
 * Check if user can manage users (Admin only)
 */
export const canManageUsers = asyncHandler(
  async (req: AuthRequest, _res: Response, next: NextFunction) => {
    if (!req.user?.id) {
      throw new AuthorizationError('Authentication required');
    }

    const user = await User.findById(req.user?.id).select('role isActive');

    if (!user) {
      throw new AuthorizationError('User not found');
    }

    if (user.status !== 'active') {
      throw new AuthorizationError('Account deactivated');
    }

    if (user.role !== UserRole.ADMIN) {
      throw new ForbiddenError('Only admins can manage users');
    }

    req.user = user as unknown as ReqUser;;

    next();
  }
);

/**
 * Check if user can manage groups (Admin only)
 */
export const canManageGroups = asyncHandler(
  async (req: AuthRequest, _res: Response, next: NextFunction) => {
    if (!req.user?.id) {
      throw new AuthorizationError('Authentication required');
    }

    const user = await User.findById(req.user?.id).select('role isActive');

    if (!user) {
      throw new AuthorizationError('User not found');
    }

    if (user.status !== 'active') {
      throw new AuthorizationError('Account deactivated');
    }

    if (user.role !== UserRole.ADMIN) {
      throw new ForbiddenError('Only admins can manage groups');
    }

    req.user = user as unknown as ReqUser;;

    next();
  }
);

/**
 * Check if user can access admin dashboard
 */
export const canAccessAdminDashboard = asyncHandler(
  async (req: AuthRequest, _res: Response, next: NextFunction) => {
    if (!req.user?.id) {
      throw new AuthorizationError('Authentication required');
    }

    const user = await User.findById(req.user?.id).select('role isActive');

    if (!user) {
      throw new AuthorizationError('User not found');
    }

    if (user.status !== 'active') {
      throw new AuthorizationError('Account deactivated');
    }

    // Allow both admin and mentor to access dashboard
    if (user.role !== UserRole.ADMIN && user.role !== UserRole.MENTOR) {
      throw new ForbiddenError('Admin or Mentor access required for dashboard');
    }

    req.user = user as unknown as ReqUser;;

    next();
  }
);

/**
 * Check if user can moderate content
 */
export const canModerateContent = asyncHandler(
  async (req: AuthRequest, _res: Response, next: NextFunction) => {
    if (!req.user?.id) {
      throw new AuthorizationError('Authentication required');
    }

    const user = await User.findById(req.user?.id).select('role isActive');

    if (!user) {
      throw new AuthorizationError('User not found');
    }

    if (user.status !== 'active') {
      throw new AuthorizationError('Account deactivated');
    }

    // Allow admin and mentor to moderate content
    if (user.role !== UserRole.ADMIN && user.role !== UserRole.MENTOR) {
      throw new ForbiddenError('Moderation privileges required');
    }

    req.user = user as unknown as ReqUser;;

    next();
  }
);

export default {
  isAdmin,
  isSuperAdmin,
  isAdminOrMentor,
  canManageUsers,
  canManageGroups,
  canAccessAdminDashboard,
  canModerateContent,
};