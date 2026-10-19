/**
 * src/resume/models/user.model.ts
 * Adapter: reuse throne8-servers' existing User model instead of registering a duplicate.
 * The resume module only needs to reference User documents for foreign-key refs.
 */
import mongoose, { Document } from 'mongoose';

import User from '@/auth/models/User.model';

export { User };

// Minimal IUser type that resume controllers need
export interface IUser extends Document {
  _id: mongoose.Types.ObjectId;
  email: string;
  role: 'user' | 'admin' | 'super_admin' | 'moderator';
  status: 'active' | 'suspended';
  fullName?: string;
  password?: string;
  passwordHash?: string;
}

export const UserRoles = {
  USER: 'user',
  ADMIN: 'admin',
  SUPER_ADMIN: 'super_admin',
  MODERATOR: 'moderator',
} as const;
export const UserStatus = { ACTIVE: 'active', SUSPENDED: 'suspended' } as const;
export type UserRole = typeof UserRoles[keyof typeof UserRoles];