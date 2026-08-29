/**
 * auth.interfaces.ts
 * All interface definitions for auth module
 */

import { UserType, VerificationType, SortBy } from '../types/auth.types';

// ==================== DEVICE & SESSION ====================

export interface DeviceData {
    deviceType?: string;
    deviceName?: string;
    os?: string;
    browser?: string;
    userAgent?: string;
    ipAddress?: string;
}

// ==================== PROFILE DATA ====================

export interface WorkingProfile {
    jobTitle?: string;
    companyName?: string;
    startDate?: string;
    endDate?: string;
}

export interface StudentProfile {
    collegeName?: string;
    degree?: string;
    fieldOfStudy?: string;
    graduationYear?: string;
}

export interface FresherProfile {
    highestEducation?: string;
    preferredRole?: string;
    cgpa?: string;
}

export interface ProfileData {
    phoneNumber?: string;
    firstName: string;
    lastName?: string;
    location: string;
    displayName?: string;
    userType: UserType;

    // Working profile fields
    jobTitle?: string;
    companyName?: string;
    startDate?: string;
    endDate?: string;

    // Student profile fields
    collegeName?: string;
    degree?: string;
    fieldOfStudy?: string;
    graduationYear?: string;

    // Fresher profile fields
    highestEducation?: string;
    preferredRole?: string;
    cgpa?: string;
}

// ==================== RESULT INTERFACES ====================

export interface LoginResult {
    userId: string;
    sessionId: string;
    deviceId: string;
}

export interface RegisterResult {
    userId: string;
    email: string;
    role: string;
    sessionId: string;
    deviceId: string;
}

export interface LogoutResult {
    success: boolean;
    message: string;
    loggedOut: boolean;
    loggedOutAt: Date;
    tokenBlacklisted: boolean;
    sessionTerminated: boolean;
    deviceDeactivated: boolean;
}

export interface LogoutAllResult {
    [x: string]: any;
    success: boolean;
    message: string;
    sessionsTerminated: number;
    tokensBlacklisted: number;
    devicesDeactivated: number;
    loggedOutAt: Date;
}

export interface RefreshResult {
    sessionId: string;
    userId: string;
}

// ==================== PROFILE QUERY ====================

export interface ProfileOptions {
    includeStats?: boolean;
    includeSessions?: boolean;
}

export interface GetAllUsersParams {
    page: number;
    limit: number;
    skip: number;
    filters: {
        status?: string;
        role?: string;
        userType?: string;
        location?: string;
        search?: string;
    };
    sortBy: SortBy;
}

export interface GetAllUsersResult {
    users: any[];
    total: number;
    totalPages: number;
}

// ==================== PROFILE UPDATES ====================

export interface OnboardingUpdates {
    userType?: UserType;
    workingProfile?: WorkingProfile;
    studentProfile?: StudentProfile;
    fresherProfile?: FresherProfile;
}

export interface ProfileUpdates {
    email?: string | null;
    password?: string | null;
    phoneNumber?: string | null;
    phoneVerified?: boolean;
    firstName?: string | null;
    lastName?: string | null;
    location?: string | null;
    currentPosition?: string | null;
    company?: string | null;
    education?: string | null;
    pronouns?: string | null;
    onboarding?: OnboardingUpdates;
    preferences?: Record<string, any>;
}

// ==================== USER VERIFICATION ====================

export interface UserForVerification {
    userId: string;
    email: string;
    emailVerified: boolean;
    phoneNumber?: string;
    phoneVerified?: boolean;
    firstName?: string;
    lastName?: string;
    status: string;
    accountStatus?: string;
}

// ==================== EMAIL VERIFICATION ====================

export interface EmailVerificationTokenData {
    userId: string;
    email: string;
    createdAt: number;
    type: VerificationType;
}

export interface EmailTokenResult {
    userId: string;
    email: string;
    tokenHash: string;
}

export interface EmailVerificationResult {
    otp?: string;
    token?: string;
    verificationLink?: string;
    expiryMinutes?: number;
    expiryHours?: number;
}

// ==================== RATE LIMITING ====================

export interface RateLimitResult {
    allowed: boolean;
    remainingAttempts: number;
    retryAfter?: number;
    attempts?: number;
}

// ==================== OAUTH ====================

export interface OAuthProviderEntry {
    provider: string;
    providerId: string;
    accessToken: string;
    refreshToken: string;
    connectedAt: Date;
}

export interface GitHubProfile {
    id: string;
    username: string;
    displayName?: string;
    name?: string;
    emails?: Array<{ value: string; primary?: boolean }>;
    photos?: Array<{ value: string }>;
    location?: string;
    bio?: string;
    html_url?: string;
    avatar_url?: string;
}

// ==================== AUDIT ====================

export interface AuditEventPayload {
    eventId: string;
    userId: string;
    action: string;
    ipAddress: string;
    status: string;
    severity: string;
    timestamp: string;
    metadata: Record<string, any>;
}