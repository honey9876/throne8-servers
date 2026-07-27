/**
 * events.types.ts
 * Professional-level event type definitions for auth-service-phase3-kafka
 * Defines event types for validation and consistency
 * Compliant with NIST 800-63B and OWASP guidelines
 * 
 * @module events/types/events.types
 * @version 3.0.0
 */

// ==================== AUTH EVENT TYPES ====================

export const AUTH_EVENTS = {
    LOGIN_SUCCESS: 'LOGIN_SUCCESS',
    LOGIN_FAILED: 'LOGIN_FAILED',
    LOGOUT_SUCCESS: 'LOGOUT_SUCCESS',
    TOKEN_REFRESH_SUCCESS: 'TOKEN_REFRESH_SUCCESS',
} as const;

export type AuthEventType = typeof AUTH_EVENTS[keyof typeof AUTH_EVENTS];

// ==================== USER EVENT TYPES ====================

export const USER_EVENTS = {
    PROFILE_UPDATED: 'PROFILE_UPDATED',
    REGISTRATION_SUCCESS: 'REGISTRATION_SUCCESS',
    ACCOUNT_DELETED: 'ACCOUNT_DELETED',
} as const;

export type UserEventType = typeof USER_EVENTS[keyof typeof USER_EVENTS];

// ==================== SYSTEM EVENT TYPES ====================

export const SYSTEM_EVENTS = {
    SERVICE_HEALTH: 'SERVICE_HEALTH',
    SYSTEM_ERROR: 'SYSTEM_ERROR',
    CONFIG_UPDATED: 'CONFIG_UPDATED',
} as const;

export type SystemEventType = typeof SYSTEM_EVENTS[keyof typeof SYSTEM_EVENTS];

// ==================== NOTIFICATION EVENT TYPES ====================

export const NOTIFICATION_EVENTS = [
    'login-success',
    'profile-updated',
    'welcome',
    'password-reset',
] as const;

export type NotificationEventType = typeof NOTIFICATION_EVENTS[number];

// ==================== COMBINED EVENT TYPES ====================

/**
 * Legacy EVENT_TYPES object for backward compatibility
 */
export const EVENT_TYPES = {
    AUTH: Object.values(AUTH_EVENTS) as AuthEventType[],
    USER: Object.values(USER_EVENTS) as UserEventType[],
    SYSTEM: Object.values(SYSTEM_EVENTS) as SystemEventType[],
    NOTIFICATION: [...NOTIFICATION_EVENTS] as NotificationEventType[],
} as const;

// ==================== TYPE GUARDS ====================

/**
 * Check if value is a valid auth event type
 */
export function isAuthEvent(value: string): value is AuthEventType {
    return EVENT_TYPES.AUTH.includes(value as AuthEventType);
}

/**
 * Check if value is a valid user event type
 */
export function isUserEvent(value: string): value is UserEventType {
    return EVENT_TYPES.USER.includes(value as UserEventType);
}

/**
 * Check if value is a valid system event type
 */
export function isSystemEvent(value: string): value is SystemEventType {
    return EVENT_TYPES.SYSTEM.includes(value as SystemEventType);
}

/**
 * Check if value is a valid notification event type
 */
export function isNotificationEvent(value: string): value is NotificationEventType {
    return EVENT_TYPES.NOTIFICATION.includes(value as NotificationEventType);
}

/**
 * Check if value is any valid event type
 */
export function isValidEvent(value: string): boolean {
    return (
        isAuthEvent(value) ||
        isUserEvent(value) ||
        isSystemEvent(value) ||
        isNotificationEvent(value)
    );
}

// ==================== UTILITY TYPES ====================

/**
 * All possible event types
 */
export type AllEventTypes = AuthEventType | UserEventType | SystemEventType | NotificationEventType;

/**
 * Event category
 */
export type EventCategory = 'AUTH' | 'USER' | 'SYSTEM' | 'NOTIFICATION';

/**
 * Get event category from event type
 */
export function getEventCategory(eventType: string): EventCategory | null {
    if (isAuthEvent(eventType)) return 'AUTH';
    if (isUserEvent(eventType)) return 'USER';
    if (isSystemEvent(eventType)) return 'SYSTEM';
    if (isNotificationEvent(eventType)) return 'NOTIFICATION';
    return null;
}

// ==================== EVENT METADATA INTERFACES ====================

export interface BaseEventMetadata {
    correlationId?: string;
    source?: string;
    version?: string;
    [key: string]: any;
}

export interface AuthEventMetadata extends BaseEventMetadata {
    deviceType?: string;
    deviceId?: string;
    sessionId?: string;
    rememberMe?: boolean;
}

export interface UserEventMetadata extends BaseEventMetadata {
    previousValue?: any;
    newValue?: any;
    reason?: string;
}

export interface SystemEventMetadata extends BaseEventMetadata {
    severity?: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
    component?: string;
    errorCode?: string;
}

export interface NotificationEventMetadata extends BaseEventMetadata {
    recipientEmail?: string;
    recipientId?: string;
    templateId?: string;
    priority?: 'LOW' | 'MEDIUM' | 'HIGH';
}

// ==================== EXPORTS ====================

export default EVENT_TYPES;