/**
 * auth.types.ts
 * All primitive type aliases and union types for auth module
 */

export type UserType = 'working' | 'student' | 'fresher';

export type SessionType = 'web' | 'mobile' | 'desktop';

export type VerificationType = 'link' | 'otp';

export type AccountStatus = 'active' | 'locked' | 'disabled' | 'inactive';

export type UserRole = 'user' | 'admin' | 'moderator';

export type SortBy = 'newest' | 'oldest' | 'name' | 'email';

export type AuditSeverity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export type AuditStatus = 'SUCCESS' | 'FAILURE';

export type LoginStatus = 'success' | 'failed' | 'blocked';

export type OAuthProvider = 'github' | 'google' | 'facebook';

export type TerminationReason =
    | 'user_logout'
    | 'logout_all_devices'
    | 'account_deactivated'
    | 'session_expired';