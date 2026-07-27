// src/constants/sessionTypes.ts
export enum SessionType {
  QUICK_CALL = 'quick_call',
  DEEP_DIVE = 'deep_dive',
  RESUME_REVIEW = 'resume_review',
  MOCK_INTERVIEW = 'mock_interview',
  CAREER_PLANNING = 'career_planning',
  PORTFOLIO_REVIEW = 'portfolio_review',
  ASK_QUERY = 'ask_query',
  GROUP_SESSION = 'group_session',
}

export const SessionTypeLabels = {
  [SessionType.QUICK_CALL]: 'Quick Call (30 min)',
  [SessionType.DEEP_DIVE]: 'Deep Dive (60 min)',
  [SessionType.RESUME_REVIEW]: 'Resume Review',
  [SessionType.MOCK_INTERVIEW]: 'Mock Interview',
  [SessionType.CAREER_PLANNING]: 'Career Planning',
  [SessionType.PORTFOLIO_REVIEW]: 'Portfolio Review',
  [SessionType.ASK_QUERY]: 'Ask a Query',
  [SessionType.GROUP_SESSION]: 'Group Session',
};

export const SESSION_DURATIONS = {
  [SessionType.QUICK_CALL]: 30,
  [SessionType.DEEP_DIVE]: 60,
  [SessionType.RESUME_REVIEW]: 30,
  [SessionType.MOCK_INTERVIEW]: 60,
  [SessionType.CAREER_PLANNING]: 90,
  [SessionType.PORTFOLIO_REVIEW]: 45,
  [SessionType.ASK_QUERY]: 0, // Async
  [SessionType.GROUP_SESSION]: 60,
};

export const SessionTypeDurations = SESSION_DURATIONS; // Alias for backward compatibility

export const SessionTypePriceRange = {
  [SessionType.QUICK_CALL]: { min: 299, max: 799 },
  [SessionType.DEEP_DIVE]: { min: 999, max: 2499 },
  [SessionType.RESUME_REVIEW]: { min: 499, max: 1499 },
  [SessionType.MOCK_INTERVIEW]: { min: 999, max: 2999 },
  [SessionType.CAREER_PLANNING]: { min: 1499, max: 3999 },
  [SessionType.PORTFOLIO_REVIEW]: { min: 799, max: 1999 },
  [SessionType.ASK_QUERY]: { min: 99, max: 299 },
  [SessionType.GROUP_SESSION]: { min: 299, max: 499 },
};

export const SessionTypeDescriptions = {
  [SessionType.QUICK_CALL]: 'Quick 30-minute call for specific questions',
  [SessionType.DEEP_DIVE]: 'In-depth 60-minute session for detailed discussion',
  [SessionType.RESUME_REVIEW]: 'Professional resume review with ATS scoring',
  [SessionType.MOCK_INTERVIEW]: 'Practice interview with real-time feedback',
  [SessionType.CAREER_PLANNING]: 'Comprehensive career planning and roadmap',
  [SessionType.PORTFOLIO_REVIEW]: 'Portfolio review for designers and developers',
  [SessionType.ASK_QUERY]: 'Text-based async query (no live call)',
  [SessionType.GROUP_SESSION]: 'Group session with multiple participants',
};

// src/constants/bookingStatus.ts
export enum BookingStatus {
  DRAFT = 'draft',
  PENDING_PAYMENT = 'pending_payment',
  PAYMENT_FAILED = 'payment_failed',
  CONFIRMED = 'confirmed',
  IN_PROGRESS = 'in_progress',
  COMPLETED = 'completed',
  CANCELLED_BY_MENTEE = 'cancelled_by_mentee',
  CANCELLED_BY_MENTOR = 'cancelled_by_mentor',
  CANCELLED_BY_ADMIN = 'cancelled_by_admin',
  NO_SHOW_MENTEE = 'no_show_mentee',
  NO_SHOW_MENTOR = 'no_show_mentor',
  RESCHEDULED = 'rescheduled',
  REFUNDED = 'refunded',
  EXPIRED = 'expired',
}

export const BookingStatusLabels = {
  [BookingStatus.DRAFT]: 'Draft',
  [BookingStatus.PENDING_PAYMENT]: 'Pending Payment',
  [BookingStatus.PAYMENT_FAILED]: 'Payment Failed',
  [BookingStatus.CONFIRMED]: 'Confirmed',
  [BookingStatus.IN_PROGRESS]: 'In Progress',
  [BookingStatus.COMPLETED]: 'Completed',
  [BookingStatus.CANCELLED_BY_MENTEE]: 'Cancelled by Mentee',
  [BookingStatus.CANCELLED_BY_MENTOR]: 'Cancelled by Mentor',
  [BookingStatus.CANCELLED_BY_ADMIN]: 'Cancelled by Admin',
  [BookingStatus.NO_SHOW_MENTEE]: 'No Show (Mentee)',
  [BookingStatus.NO_SHOW_MENTOR]: 'No Show (Mentor)',
  [BookingStatus.RESCHEDULED]: 'Rescheduled',
  [BookingStatus.REFUNDED]: 'Refunded',
  [BookingStatus.EXPIRED]: 'Expired',
};

export const CancellableStatuses = [
  BookingStatus.CONFIRMED,
  BookingStatus.PENDING_PAYMENT,
];

export const ReschedulableStatuses = [
  BookingStatus.CONFIRMED,
];

export const FinalStatuses = [
  BookingStatus.COMPLETED,
  BookingStatus.CANCELLED_BY_MENTEE,
  BookingStatus.CANCELLED_BY_MENTOR,
  BookingStatus.CANCELLED_BY_ADMIN,
  BookingStatus.NO_SHOW_MENTEE,
  BookingStatus.NO_SHOW_MENTOR,
  BookingStatus.REFUNDED,
  BookingStatus.EXPIRED,
];

// Mock Interview Types
export enum InterviewType {
  TECHNICAL = 'technical',
  BEHAVIORAL = 'behavioral',
  CASE_STUDY = 'case_study',
  HR = 'hr',
  SYSTEM_DESIGN = 'system_design',
  CODING = 'coding',
}

export const InterviewTypeLabels = {
  [InterviewType.TECHNICAL]: 'Technical Interview',
  [InterviewType.BEHAVIORAL]: 'Behavioral Interview',
  [InterviewType.CASE_STUDY]: 'Case Study Interview',
  [InterviewType.HR]: 'HR Interview',
  [InterviewType.SYSTEM_DESIGN]: 'System Design Interview',
  [InterviewType.CODING]: 'Coding Interview',
};

// Refund Policy
export const RefundPolicy = {
  MORE_THAN_24H: {
    percentage: 100,
    description: 'Full refund if cancelled 24+ hours before session',
  },
  BETWEEN_12_24H: {
    percentage: 50,
    description: '50% refund if cancelled 12-24 hours before session',
  },
  LESS_THAN_12H: {
    percentage: 0,
    description: 'No refund if cancelled less than 12 hours before session',
  },
  MENTOR_CANCELLATION: {
    percentage: 100,
    description: 'Full refund + 10% credit if mentor cancels',
  },
  NO_SHOW_MENTEE: {
    percentage: 0,
    description: 'No refund for mentee no-show',
  },
  NO_SHOW_MENTOR: {
    percentage: 100,
    description: 'Full refund + 20% credit for mentor no-show',
  },
};

// Reschedule Policy
export const ReschedulePolicy = {
  FREE_LIMIT: 1,
  FEE_AFTER_LIMIT: 100, // ₹100 per reschedule after first
  MAX_RESCHEDULES: 2,
  MIN_HOURS_BEFORE: 24,
};

// Meeting Platforms
export enum MeetingPlatform {
  ZOOM = 'zoom',
  GOOGLE_MEET = 'google_meet',
  MICROSOFT_TEAMS = 'microsoft_teams',
  DAILY_CO = 'daily_co',
  CUSTOM = 'custom',
}

export const MeetingPlatformLabels = {
  [MeetingPlatform.ZOOM]: 'Zoom',
  [MeetingPlatform.GOOGLE_MEET]: 'Google Meet',
  [MeetingPlatform.MICROSOFT_TEAMS]: 'Microsoft Teams',
  [MeetingPlatform.DAILY_CO]: 'Daily.co',
  [MeetingPlatform.CUSTOM]: 'Custom Link',
};

// Payment Methods
export enum PaymentMethod {
  RAZORPAY = 'razorpay',
  STRIPE = 'stripe',
  PACKAGE_CREDIT = 'package_credit',
  WALLET = 'wallet',
}

export const PaymentMethodLabels = {
  [PaymentMethod.RAZORPAY]: 'Razorpay',
  [PaymentMethod.STRIPE]: 'Stripe',
  [PaymentMethod.PACKAGE_CREDIT]: 'Package Credit',
  [PaymentMethod.WALLET]: 'Wallet',
};

// Reminder Timings
export const ReminderTimings = {
  REMINDER_24H: 24 * 60 * 60 * 1000, // 24 hours
  REMINDER_1H: 60 * 60 * 1000, // 1 hour
  REMINDER_15M: 15 * 60 * 1000, // 15 minutes
};

export default {
  SessionType,
  SessionTypeLabels,
  SessionTypeDurations,
  SessionTypePriceRange,
  SessionTypeDescriptions,
  BookingStatus,
  BookingStatusLabels,
  CancellableStatuses,
  ReschedulableStatuses,
  FinalStatuses,
  InterviewType,
  InterviewTypeLabels,
  RefundPolicy,
  ReschedulePolicy,
  MeetingPlatform,
  MeetingPlatformLabels,
  PaymentMethod,
  PaymentMethodLabels,
  ReminderTimings,
};