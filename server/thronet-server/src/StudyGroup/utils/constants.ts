/**
 * ====================================
 * APPLICATION CONSTANTS
 * ====================================
 * Centralized constants used across the application
 */

/**
 * Authentication Constants
 */
export const AUTH_CONSTANTS = {
  JWT_EXPIRE: '7d' as const,
  REFRESH_TOKEN_EXPIRE: '30d' as const,
  BCRYPT_SALT_ROUNDS: 12,
  PASSWORD_MIN_LENGTH: 6,
  PASSWORD_MAX_LENGTH: 128,
  TOKEN_TYPES: {
    ACCESS: 'access',
    REFRESH: 'refresh',
    RESET_PASSWORD: 'reset_password',
    EMAIL_VERIFICATION: 'email_verification',
  },
} as const;

/**
 * Pagination Constants
 */
export const PAGINATION_CONSTANTS = {
  DEFAULT_PAGE: 1,
  DEFAULT_LIMIT: 10,
  MAX_LIMIT: 100,
  MIN_LIMIT: 1,
};

/**
 * File Upload Constants
 */
export const FILE_UPLOAD_CONSTANTS = {
  MAX_FILE_SIZE: 10 * 1024 * 1024, // 10MB in bytes
  MAX_FILES_PER_UPLOAD: 5,
  ALLOWED_IMAGE_TYPES: ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'],
  ALLOWED_DOCUMENT_TYPES: [
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  ],
  ALLOWED_ALL_TYPES: [
    'image/jpeg',
    'image/jpg',
    'image/png',
    'image/gif',
    'image/webp',
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  ],
};

/**
 * Group Constants
 */
export const GROUP_CONSTANTS = {
  TITLE_MIN_LENGTH: 3,
  TITLE_MAX_LENGTH: 100,
  DESCRIPTION_MAX_LENGTH: 500,
  MIN_CAPACITY: 2,
  MAX_CAPACITY: 100,
  DEFAULT_CAPACITY: 50,
  GOAL_HOURS_MIN: 1,
  GOAL_HOURS_MAX: 24,
  INACTIVE_DAYS_THRESHOLD: 30,
  MAX_PINNED_MESSAGES: 5,
  MAX_PINNED_FILES: 10,
};

/**
 * Message Constants
 */
export const MESSAGE_CONSTANTS = {
  MAX_LENGTH: 2000,
  EDIT_TIME_LIMIT: 15 * 60 * 1000, // 15 minutes in milliseconds
  MAX_REACTIONS_PER_MESSAGE: 6,
  ALLOWED_REACTIONS: ['👍', '❤️', '😂', '😮', '😢', '😡'],
};

/**
 * Task Constants
 */
export const TASK_CONSTANTS = {
  TITLE_MIN_LENGTH: 3,
  TITLE_MAX_LENGTH: 200,
  DESCRIPTION_MAX_LENGTH: 1000,
  MAX_TAGS: 10,
};

/**
 * Goal Constants
 */
export const GOAL_CONSTANTS = {
  MIN_DAILY_HOURS: 1,
  MAX_DAILY_HOURS: 24,
  MIN_WEEKLY_HOURS: 7,
  MAX_WEEKLY_HOURS: 168, // 24 * 7
};

/**
 * Timer/Pomodoro Constants
 */
export const TIMER_CONSTANTS = {
  POMODORO_DURATION: 25 * 60, // 25 minutes in seconds
  SHORT_BREAK_DURATION: 5 * 60, // 5 minutes
  LONG_BREAK_DURATION: 15 * 60, // 15 minutes
  MIN_DURATION: 1 * 60, // 1 minute
  MAX_DURATION: 180 * 60, // 180 minutes (3 hours)
};

/**
 * Streak Constants
 */
export const STREAK_CONSTANTS = {
  MILESTONES: [7, 30, 50, 100, 365],
  WARNING_HOURS_BEFORE_BREAK: 2,
};

/**
 * Attendance Constants
 */
export const ATTENDANCE_CONSTANTS = {
  MIN_STUDY_TIME_FOR_AUTO_ATTENDANCE: 1, // 1 hour
  RESET_TIME: '00:00', // Midnight
};

/**
 * Ranking Constants
 */
export const RANKING_CONSTANTS = {
  WEIGHTS: {
    STUDY_TIME: 0.4,
    ATTENDANCE: 0.3,
    STREAK: 0.3,
  },
  UPDATE_INTERVAL: 6 * 60 * 60 * 1000, // 6 hours in milliseconds
  TOP_USERS_LIMIT: 100,
};

/**
 * Notification Constants
 */
export const NOTIFICATION_CONSTANTS = {
  EXPIRY_DAYS: 30,
  MAX_UNREAD: 100,
  BATCH_SIZE: 50,
};

/**
 * Rate Limiting Constants
 */
export const RATE_LIMIT_CONSTANTS = {
  WINDOW_MS: 15 * 60 * 1000, // 15 minutes
  MAX_REQUESTS: 100,
  AUTH_MAX_REQUESTS: 5,
  AUTH_WINDOW_MS: 15 * 60 * 1000,
};

/**
 * Search Constants
 */
export const SEARCH_CONSTANTS = {
  MIN_SEARCH_LENGTH: 2,
  MAX_SEARCH_LENGTH: 100,
  RESULTS_LIMIT: 50,
};

/**
 * Moderation Constants
 */
export const MODERATION_CONSTANTS = {
  MAX_WARNINGS: 3,
  WARNING_EXPIRY_DAYS: 30,
  BAN_DURATION_DAYS: 365,
  MAX_RULES_PER_GROUP: 10,
};

/**
 * Cache Constants
 */
export const CACHE_CONSTANTS = {
  TTL: {
    SHORT: 5 * 60, // 5 minutes
    MEDIUM: 30 * 60, // 30 minutes
    LONG: 60 * 60, // 1 hour
    VERY_LONG: 24 * 60 * 60, // 24 hours
  },
};

/**
 * Email Constants
 */
export const EMAIL_CONSTANTS = {
  FROM: 'noreply@studygroup.com',
  SUPPORT: 'support@studygroup.com',
  TEMPLATES: {
    WELCOME: 'welcome',
    RESET_PASSWORD: 'reset-password',
    EMAIL_VERIFICATION: 'email-verification',
    GROUP_INVITE: 'group-invite',
  },
};

/**
 * Time Constants
 */
export const TIME_CONSTANTS = {
  SECOND: 1000,
  MINUTE: 60 * 1000,
  HOUR: 60 * 60 * 1000,
  DAY: 24 * 60 * 60 * 1000,
  WEEK: 7 * 24 * 60 * 60 * 1000,
  MONTH: 30 * 24 * 60 * 60 * 1000,
};

/**
 * Regex Patterns
 */
export const REGEX_PATTERNS = {
  EMAIL: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
  PHONE: /^[6-9]\d{9}$/,
  URL: /^(https?:\/\/)?([\da-z\.-]+)\.([a-z\.]{2,6})([\/\w \.-]*)*\/?$/,
  USERNAME: /^[a-zA-Z0-9_-]{3,20}$/,
  PASSWORD: /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/,
};

/**
 * Error Messages
 */
export const ERROR_MESSAGES = {
  // Authentication
  INVALID_CREDENTIALS: 'Invalid email or password',
  USER_NOT_FOUND: 'User not found',
  USER_ALREADY_EXISTS: 'User with this email already exists',
  INVALID_TOKEN: 'Invalid or expired token',
  UNAUTHORIZED: 'Unauthorized access',
  
  // Group
  GROUP_NOT_FOUND: 'Group not found',
  GROUP_FULL: 'Group has reached maximum capacity',
  ALREADY_MEMBER: 'You are already a member of this group',
  NOT_MEMBER: 'You are not a member of this group',
  ONLY_LEADER: 'Only group leader can perform this action',
  
  // Validation
  VALIDATION_ERROR: 'Validation failed',
  REQUIRED_FIELD: 'This field is required',
  INVALID_EMAIL: 'Invalid email format',
  INVALID_PASSWORD: 'Password must be at least 6 characters',
  
  // Server
  INTERNAL_ERROR: 'Internal server error',
  NOT_FOUND: 'Resource not found',
};

/**
 * Success Messages
 */
export const SUCCESS_MESSAGES = {
  // Authentication
  LOGIN_SUCCESS: 'Login successful',
  LOGOUT_SUCCESS: 'Logout successful',
  REGISTER_SUCCESS: 'Registration successful',
  
  // Group
  GROUP_CREATED: 'Group created successfully',
  GROUP_UPDATED: 'Group updated successfully',
  GROUP_DELETED: 'Group deleted successfully',
  JOINED_GROUP: 'Joined group successfully',
  LEFT_GROUP: 'Left group successfully',
  
  // General
  SUCCESS: 'Operation successful',
  DELETED: 'Deleted successfully',
  UPDATED: 'Updated successfully',
  CREATED: 'Created successfully',
};

export default {
  AUTH_CONSTANTS,
  PAGINATION_CONSTANTS,
  FILE_UPLOAD_CONSTANTS,
  GROUP_CONSTANTS,
  MESSAGE_CONSTANTS,
  TASK_CONSTANTS,
  GOAL_CONSTANTS,
  TIMER_CONSTANTS,
  STREAK_CONSTANTS,
  ATTENDANCE_CONSTANTS,
  RANKING_CONSTANTS,
  NOTIFICATION_CONSTANTS,
  RATE_LIMIT_CONSTANTS,
  SEARCH_CONSTANTS,
  MODERATION_CONSTANTS,
  CACHE_CONSTANTS,
  EMAIL_CONSTANTS,
  TIME_CONSTANTS,
  REGEX_PATTERNS,
  ERROR_MESSAGES,
  SUCCESS_MESSAGES,
};