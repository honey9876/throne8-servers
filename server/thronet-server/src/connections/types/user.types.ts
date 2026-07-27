// src/types/user.types.ts

/**
 * User Type Definitions
 * Complete user-related type definitions for Connection Service
 * Aligned with auth.middleware.ts and your existing code
 */

/**
 * User Role Types
 */
export type UserRole = 'user' | 'admin';

/**
 * User Status Types
 */
export type UserStatus = 'active' | 'inactive' | 'suspended' | 'deleted';

/**
 * User Permission Types
 */
export type UserPermission = 
  | 'read'
  | 'write'
  | 'connect'
  | 'admin'
  | 'delete'
  | 'block'
  | 'moderate';

/**
 * Core User Interface (matches your auth.middleware.ts)
 */
export interface IUser {
  id: string;
  email?: string;
  role: UserRole;
  name?: string;
  region?: string;
  permissions?: UserPermission[];
  status?: UserStatus;
  [key: string]: any; // For additional fields
}

/**
 * Authenticated User (from JWT token)
 * Used in req.user
 */
export interface AuthenticatedUser {
  id: string;
  email?: string;
  role: UserRole;
  [key: string]: any;
}

/**
 * JWT Payload Structure
 */
export interface JWTPayload {
  id: string;
  email?: string;
  role?: UserRole;
  iat?: number;  // Issued at
  exp?: number;  // Expiration
}

/**
 * JWT Decoded Token
 */
export interface DecodedToken extends JWTPayload {
  iat: number;
  exp: number;
}

/**
 * User Profile (Extended information)
 */
export interface UserProfile extends IUser {
  username?: string;
  fullName?: string;
  bio?: string;
  avatar?: string;
  location?: string;
  website?: string;
  dateOfBirth?: Date;
  phoneNumber?: string;
  verified?: boolean;
  createdAt?: Date;
  updatedAt?: Date;
  lastLoginAt?: Date;
}

/**
 * User Connection Metadata
 */
export interface UserConnectionData {
  userId: string;
  connectionCount?: number;
  followerCount?: number;
  followingCount?: number;
  mutualConnectionCount?: number;
}

/**
 * User Privacy Settings
 */
export interface UserPrivacySettings {
  profileVisibility: 'public' | 'connections' | 'private';
  showEmail: boolean;
  showPhone: boolean;
  allowConnectionRequests: boolean;
  allowFollows: boolean;
  showConnections: boolean;
  allowProfileViews: boolean;
}

/**
 * User Notification Settings
 */
export interface UserNotificationSettings {
  emailNotifications: boolean;
  pushNotifications: boolean;
  connectionRequests: boolean;
  newConnections: boolean;
  profileViews: boolean;
  messages: boolean;
}

/**
 * User Authentication Data
 */
export interface UserAuthData {
  userId: string;
  passwordHash?: string;
  lastPasswordChange?: Date;
  twoFactorEnabled?: boolean;
  twoFactorSecret?: string;
  refreshTokens?: string[];
  deviceIds?: string[];
}

/**
 * User Session Data (Redis)
 */
export interface UserSession {
  userId: string;
  sessionId: string;
  deviceInfo?: {
    userAgent: string;
    ip: string;
    deviceType: string;
  };
  createdAt: Date;
  expiresAt: Date;
  lastActivity: Date;
}

/**
 * User Search Result
 */
export interface UserSearchResult {
  id: string;
  name: string;
  email?: string;
  username?: string;
  avatar?: string;
  bio?: string;
  isConnected?: boolean;
  mutualConnections?: number;
  region?: string;
}

/**
 * User Statistics
 */
export interface UserStatistics {
  userId: string;
  totalConnections: number;
  totalFollowers: number;
  totalFollowing: number;
  totalProfileViews: number;
  totalPosts?: number;
  engagementRate?: number;
  lastActive?: Date;
}

/**
 * User Activity Log
 */
export interface UserActivityLog {
  userId: string;
  action: string;
  timestamp: Date;
  metadata?: Record<string, any>;
  ipAddress?: string;
  userAgent?: string;
}

/**
 * User Validation Result
 */
export interface UserValidationResult {
  isValid: boolean;
  errors?: string[];
  user?: IUser;
}

/**
 * Test User Interface (for development/testing)
 */
export interface TestUser extends IUser {
  testKey: string;
  isTestUser: true;
}

/**
 * User DTO (Data Transfer Object)
 */
export interface UserDTO {
  id: string;
  name?: string;
  email?: string;
  username?: string;
  avatar?: string;
  role: UserRole;
  status: UserStatus;
  createdAt: Date;
}

/**
 * User Creation Data
 */
export interface CreateUserData {
  email: string;
  password: string;
  name?: string;
  username?: string;
  role?: UserRole;
  region?: string;
}

/**
 * User Update Data
 */
export interface UpdateUserData {
  name?: string;
  username?: string;
  bio?: string;
  avatar?: string;
  location?: string;
  website?: string;
  phoneNumber?: string;
}

/**
 * Type Guards
 */

export function isAuthenticatedUser(user: any): user is AuthenticatedUser {
  return (
    user &&
    typeof user.id === 'string' &&
    (user.role === 'user' || user.role === 'admin')
  );
}

export function isTestUser(user: any): user is TestUser {
  return user && user.isTestUser === true && typeof user.testKey === 'string';
}

export function hasPermission(user: IUser, permission: UserPermission): boolean {
  return user.permissions?.includes(permission) || user.role === 'admin';
}

export function isAdmin(user: IUser): boolean {
  return user.role === 'admin';
}

/**
 * Export all types
 */
export type {
  IUser as User,
  AuthenticatedUser as AppUser, // Alias for Express Request compatibility
};

// Default export for convenience
export default {
  isAuthenticatedUser,
  isTestUser,
  hasPermission,
  isAdmin,
};