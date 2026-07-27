/**
 * auth/index.ts
 * Barrel export for the entire auth module.
 * Import from here instead of deep paths.
 *
 * Usage:
 *   import AuthService from '@/services/auth';
 *   import { LoginResult, ProfileUpdates } from '@/services/auth';
 *   import { UserRepository } from '@/services/auth';
 */

// ── Service (default + named) ──────────────────────────────────────────────
export { default } from './services/auth.service';
export { default as AuthService } from './services/auth.service';

// ── Types ──────────────────────────────────────────────────────────────────
export type {
    UserType,
    SessionType,
    VerificationType,
    AccountStatus,
    UserRole,
    SortBy,
    AuditSeverity,
    AuditStatus,
    LoginStatus,
    OAuthProvider,
    TerminationReason,
} from './types/auth.types';

// ── Interfaces ─────────────────────────────────────────────────────────────
export type {
    DeviceData,
    WorkingProfile,
    StudentProfile,
    FresherProfile,
    ProfileData,
    LoginResult,
    RegisterResult,
    LogoutResult,
    LogoutAllResult,
    RefreshResult,
    ProfileOptions,
    GetAllUsersParams,
    GetAllUsersResult,
    OnboardingUpdates,
    ProfileUpdates,
    UserForVerification,
    EmailVerificationTokenData,
    EmailTokenResult,
    EmailVerificationResult,
    RateLimitResult,
    OAuthProviderEntry,
    GitHubProfile,
    AuditEventPayload,
} from './interfaces/auth.interfaces';

// ── Repositories (for testing or advanced use) ────────────────────────────
export {
    UserRepository,
    LoginAttemptRepository,
    SessionRepository,
    DeviceRepository,
    UserProfileRepository,
    AuditLogRepository,
    AuthCacheRepository,
} from './repository/auth.repository';