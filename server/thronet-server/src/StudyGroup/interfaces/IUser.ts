/**
 * ====================================
 * USER INTERFACE - UPDATED WITH BADGES
 * ====================================
 * TypeScript interface for User model
 */

import { Document, Types } from 'mongoose';
import { UserRole } from '../enums/UserRole.enum';
import { IUserBadge } from './IBadge'; // Import badge interface

export interface IUser extends Document {
  _id: Types.ObjectId;
  name: string;
  email: string;
  username?: string;
  password: string;
  role: UserRole;
  avatar?: string;
  phone?: string;
  bio?: string;
  isEmailVerified: boolean;
  isActive: boolean;
  lastActive: Date;
  
  // ==================================
  // NEW: Badges field for gamification
  // ==================================
  badges?: IUserBadge[];
  createdAt: Date;
  updatedAt: Date;

  // Methods
  comparePassword(candidatePassword: string): Promise<boolean>;
  generateAuthToken(): string;
  generateRefreshToken(): string;
}

// Add static methods interface
export interface IUserModel extends Document {
  findByEmail(email: string): Promise<IUser | null>;
  findByUsername(username: string): Promise<IUser | null>;
}

export default IUser;