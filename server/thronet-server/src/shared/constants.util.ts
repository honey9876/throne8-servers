/**
 * Application Configuration Constants
 * @module utils/constants.util
 * @version 3.0.1
 */
interface AuditStatus {
    SUCCESS: 'SUCCESS';  // ✅ NEW: literal type
    FAILURE: 'FAILURE';
    PENDING: 'PENDING';
    ERROR: 'ERROR';
}

interface AuditSeverities {
    LOW: 'LOW';
    MEDIUM: 'MEDIUM';
    HIGH: 'HIGH';
    CRITICAL: 'CRITICAL';
}

interface AppInfo {
    NAME: string;
    VERSION: string;
    ENV: string;
    PORT: number;
}

interface TokenTypes {
    ACCESS: string;
    REFRESH: string;
    EMAIL_VERIFICATION: string;
    PASSWORD_RESET: string;
    MAGIC_LINK: string;
    API_KEY: string;
}

interface TokenExpiry {
    ACCESS_TOKEN: string;
    ACCESS_TOKEN_MS: number;
    REFRESH_TOKEN: string;
    REFRESH_TOKEN_MS: number;
    REFRESH_TOKEN_REMEMBER_ME: string;
    REFRESH_TOKEN_REMEMBER_ME_MS: number;
    EMAIL_VERIFICATION: number;
    EMAIL_VERIFICATION_HOURS: number;
    PASSWORD_RESET: number;
    MAGIC_LINK: number;
    OTP: number;
    MFA_CODE: number;
}

interface UserStatus {
    ACTIVE: string;
    INACTIVE: string;
    SUSPENDED: string;
    DEACTIVATED: string;
    DELETED: string;
    ANONYMIZED: string;
}

interface UserRoles {
    USER: string;
    EMPLOYER: string;
    ADMIN: string;
    SUPER_ADMIN: string;
}

interface RateLimit {
    max: number;
    windowMs: number;
    message: string;
    retryAfter?: number;
}

interface CacheTTLs {
    SESSION: number;
    SESSION_LONG: number;
    TOKEN: number;
    TOKEN_BLACKLIST: number;
    USER: number;
    USER_PROFILE: number;
    USER_STATS: number;
    USER_SESSIONS: number;
    NOTIFICATION: number;
    ANALYTICS: number;
    SEARCH_RESULTS: number;
    RATE_LIMIT: number;
    OTP: number;
    MFA_TRUST: number;
    EMAIL_VERIFICATION_TOKEN: number;
    PHONE_VERIFICATION_OTP: number;
    VERIFICATION_RATE_LIMIT: number;
    HEADLINE: number;
    HEADLINE_USER: number;
    CONTACT: number;
    CONTACT_USER: number;
    CAREER_BREAK: number;
    CAREER_BREAK_USER: number;
    TEST_SCORE: number;
    TEST_SCORE_USER: number;
    USER_DATA: number;
    COMPANY_PAGE: number; // 1 hour
    EMPLOYEE_REVIEWS: number; // 30 minutes
    COMPANY_CULTURE: number; // 2 hours

    company_verification: number; // 1 week
    spam_check: number; // 1 day
    salary_verification: number; // 1 day
    duplicate_check: number; // 1 hour
    quality_assessment: number; // 1 day

    MATCH_SCORE: number;
    RECOMMENDED_JOBS: number;
    RECENT_JOBS: number;
    EXPIRING_JOBS: number;
    // USER_PROFILE: number;
    // ANALYTICS: number;
    BATCH_RESULTS: number;
    INVITATION_ANALYTICS: number; // 24 hours for invitation analytics

    COMPANY_VERIFICATION: number; // 1 week
    JOB_SPAM: number; // 1 day
    SALARY_VERIFICATION: number; // 1 day
    DUPLICATE_APPLICATION: number; // 1 hour
    JOB_QUALITY: number; // 1 day

    RESUME_OPTIMIZATION: number; // 1 day
    JOB_MATCHES: number; // 1 hour
    JOB_ANALYSIS: number; // 2 hours
    TOP_APPLICANT_JOBS: number; // 30 minutes

    //premium
    FOLLOW_UPS: number; // 30 days
    INTERVIEWS: number; // 90 days
    OFFERS: number; // 180 days
    NOTES: number; // 1 year
    TEMPLATES: number; // 1 year
    QUICK_APPLY: number; // 30 days
    SCORING: number; // 7 days
    REFERENCES: number; // 1 year
    PORTFOLIO: number; // 1 year
    THANK_YOU: number; // 30 days
    VIDEO: number; // 90 days

    // professional development
    SKILLS_GAP: number;
    CAREER_PATH: number;
    ASSESSMENT: number;
    ASSESSMENT_RESULTS: number;
    USER_CERTIFICATIONS: number;
    LINKEDIN_COURSES: number;
    MOCK_INTERVIEWS: number;
    RESUME_REVIEWS: number;
    REVIEW_FEEDBACK: number;
    COACHING_PLAN: number;
    SALARY_DATA: number;
    NEGOTIATION_TIPS: number;
    MARKET_REPORT: number;
    INDUSTRY_SKILLS: number;
    AVAILABLE_COACHES: number;

    //notification seting
    // Smart Notification Timing
    NOTIFICATION_TIMING: number; // 2 hours
    OPTIMAL_TIME: number; // 24 hours
    TIMING_ANALYSIS: number; // 6 hours
    USER_ENGAGEMENT_PATTERN: number; // 12 hours

    // Do Not Disturb Mode
    DND_STATUS: number; // 1 hour
    DND_SCHEDULE: number; // 24 hours
    ACTIVE_DND_USERS: number; // 5 minutes

    // VIP Company Alerts
    VIP_COMPANIES: number; // 1 hour
    VIP_ALERTS: number; // 30 minutes
    COMPANY_INFO: number; // 6 hours

    // Application Deadline Reminders
    DEADLINE_REMINDERS: number; // 1 hour
    UPCOMING_DEADLINES: number; // 30 minutes
    REMINDER_SCHEDULE: number; // 2 hours

    // Profile Visibility Controls
    VISIBILITY_SETTINGS: number; // 2 hours
    PROFILE_PRIVACY: number; // 3 hours
    RECRUITER_VISIBILITY: number; // 1 hour

    // Anonymous Browsing
    ANONYMOUS_SESSION: number; // 30 minutes
    ANONYMOUS_USER_MAP: number; // 1 hour
    ANONYMOUS_ACTIVITY: number; // 30 minutes

    // Job Alert Frequency
    ALERT_FREQUENCY: number; // 2 hours
    ALERT_SCHEDULE: number; // 24 hours
    FREQUENCY_HISTORY: number; // 1 week

    // Email Preferences
    EMAIL_PREFERENCES: number; // 2 hours
    EMAIL_SUBSCRIPTIONS: number; // 4 hours
    UNSUBSCRIBE_TOKENS: number; // 24 hours

    // Data Export
    EXPORT_REQUEST: number; // 1 hour
    EXPORT_STATUS: number; // 30 minutes
    EXPORT_QUEUE: number; // 5 minutes

    // Account Security
    SECURITY_SETTINGS: number; // 2 hours
    TWO_FA_SETTINGS: number; // 4 hours
    LOGIN_ATTEMPTS: number; // 15 minutes
    SECURITY_TOKENS: number; // 10 minutes
    ACCOUNT_LOCKS: number; // 30 minutes
    APPLICANT_INSIGHTS: number;
    COMPETITION_LEVEL: number;
    JOB_COMPETITION: number;
    SALARY_BENCHMARK: number;

    INMAIL_CREDITS: number;
    INTERVIEW_QUESTIONS: number;
    INTERVIEW_TIPS: number;
    INTERVIEW_PREP: number;
    PREMIUM_FEATURES: number;
    PREMIUM_ANALYTICS: number;
    USER_PREFERENCES: number;
    USER_NETWORK: number;
    APPLICATION_TEMPLATE: number;
    APPLICATION_SCORE: number;
    FEATURE_USAGE: number;
    JOB_LIST: number;



}

interface CacheKeys {
    // NOTIFICATION_TIMING
    FOLLOW_UPS: (userId: string) => `followups:${string}`,
    INTERVIEWS: (userId: string) => `interviews:${string}`;
    OFFERS: (userId: string) => `offers:${string}`;
    NOTES: (applicationId: string) => `notes:${string}`;
    TEMPLATES: (userId: string) => `templates:${string}`;
    QUICK_APPLY: (userId: string) => `quickapply:${string}`;
    SCORING: (applicationId: string) => `scoring:${string}`;
    REFERENCES: (userId: string) => `references:${string}`;
    PORTFOLIO: (userId: string) => `portfolio:${string}`;
    SKILLS_GAP: (userId: string) => `skills_gap:${string}`;
    CAREER_PATH: (userId: string) => `career_path:${string}`;
    ASSESSMENT: (assessmentId: string) => `assessment:${string}`;
    ASSESSMENT_RESULTS: (userId: string, skillId: string) => `assessment_results:${string}:${string}`;
    USER_CERTIFICATIONS: (userId: string) => `certifications:${string}`;
    LINKEDIN_COURSES: (userId: string) => `linkedin_courses:${string}`;
    MOCK_INTERVIEWS: (userId: string) => `mock_interviews:${string}`;
    RESUME_REVIEWS: (userId: string) => `resume_reviews:${string}`;
    REVIEW_FEEDBACK: (reviewId: string) => `review_feedback:${string}`;
    COACHING_PLAN: (userId: string) => `coaching_plan:${string}`;
    SALARY_DATA: (jobTitle: string, location: string) => `salary_data:${string}:${string}`;
    NEGOTIATION_TIPS: (level: string, industry: string) => `negotiation_tips:${string}:${string}`;
    MARKET_REPORT: (reportId: string) => `market_report:${string}`;
    INDUSTRY_SKILLS: (industry: string) => `industry_skills:${string}`;
    // AVAILABLE_COACHES: 'available_coaches',

    // Smart Notification Timing
    NOTIFICATION_TIMING: (userId: string) => `notification_timing:${string}`;
    OPTIMAL_TIME: (userId: string) => `optimal_time:${string}`;
    TIMING_ANALYSIS: (userId: string) => `timing_analysis:${string}`;
    USER_ENGAGEMENT_PATTERN: (userId: string) => `engagement_pattern:${string}`;

    // Do Not Disturb Mode
    DND_STATUS: (userId: string) => `dnd_status:${string}`;
    DND_SCHEDULE: (userId: string) => `dnd_schedule:${string}`;
    ACTIVE_DND_USERS: 'active_dnd_users',

    // VIP Company Alerts
    VIP_COMPANIES: (userId: string) => `vip_companies:${string}`;
    VIP_ALERTS: (userId: string) => `vip_alerts:${string}`;
    COMPANY_INFO: (companyId: string) => `company_info:${string}`;

    // Application Deadline Reminders
    DEADLINE_REMINDERS: (userId: string) => `deadline_reminders:${string}`;
    UPCOMING_DEADLINES: (userId: string) => `upcoming_deadlines:${string}`;
    REMINDER_SCHEDULE: (userId: string) => `reminder_schedule:${string}`;

    // Profile Visibility Controls
    VISIBILITY_SETTINGS: (userId: string) => `visibility_settings:${string}`;
    PROFILE_PRIVACY: (userId: string) => `profile_privacy:${string}`;
    RECRUITER_VISIBILITY: (userId: string) => `recruiter_visibility:${string}`;

    // Anonymous Browsing
    ANONYMOUS_SESSION: (sessionId: string) => `anonymous_session:${string}`;
    ANONYMOUS_USER_MAP: (userId: string) => `anonymous_map:${string}`;
    ANONYMOUS_ACTIVITY: (sessionId: string) => `anonymous_activity:${string}`;

    // Job Alert Frequency
    ALERT_FREQUENCY: (userId: string) => `alert_frequency:${string}`;
    ALERT_SCHEDULE: (userId: string) => `alert_schedule:${string}`;
    FREQUENCY_HISTORY: (userId: string) => `frequency_history:${string}`;

    // Email Preferences
    EMAIL_PREFERENCES: (userId: string) => `email_preferences:${string}`;
    EMAIL_SUBSCRIPTIONS: (userId: string) => `email_subscriptions:${string}`;
    UNSUBSCRIBE_TOKENS: (token: string) => `unsubscribe_token:${string}`,

    // Data Export
    EXPORT_REQUEST: (userId: string) => `export_request:${string}`;
    EXPORT_STATUS: (exportId: string) => `export_status:${string}`;
    EXPORT_QUEUE: 'export_queue',

    // Account Security
    SECURITY_SETTINGS: (userId: string) => `security_settings:${string}`;
    TWO_FA_SETTINGS: (userId: string) => `two_fa_settings:${string}`;
    LOGIN_ATTEMPTS: (userId: string) => `login_attempts:${string}`;
    SECURITY_TOKENS: (token: string) => `security_token:${string}`;
    ACCOUNT_LOCKS: (userId: string) => `account_lock:${string}`;

    APPLICANT_INSIGHTS: (jobId: string) => `applicant_insights:${string}`;
    COMPETITION_LEVEL: (jobId: string) => `competition_level:${string}`;
    JOB_COMPETITION: (jobId: string) => `job_competition:${string}`;
    SALARY_BENCHMARK: (title: string, location: string, experience: string) => `salary_benchmark:${string}:${string}:${string}`;

    INMAIL_CREDITS: (userId: string) => `inmail_credits:${string}`;
    INTERVIEW_QUESTIONS: (jobId: string) => `job_competition:${string}`;
    INTERVIEW_TIPS: (companyId: string, roleType: string) => `interview_tips:${string}:${string}`;
    INTERVIEW_PREP: (jobId: string, userId: string) => `interview_prep:${string}:${string}`;
    PREMIUM_FEATURES: (userId: string) => `premium_features:${string}`,
    PREMIUM_ANALYTICS: (userId: string) => `premium_analytics:${string}`,
    USER_PREFERENCES: (userId: string) => `user_preference:${string}`,
    USER_NETWORK: (userId: string) => `user_network:${string}`,
    VIDEO: (userId: string) => `video:${string}`,
    APPLICATION_TEMPLATE: (userId: string, templateId: string) => `video:${string}:${string}`,
    APPLICATION_SCORE: (applicantId: string) => `security_settings:${string}`,
    AVAILABLE_COACHES: (userId: string) => `available_coaches:${string}`,


}

interface ShardKey {
    [key: string]: string | number;
}

interface PrivacySettings {
    VISIBILITY: string[];
    MESSAGE_PERMISSIONS: string[];
    VIEW_PERMISSIONS: string[];
    DATA_RETENTION_DAYS: {
        MIN: number;
        MAX: number;
        DEFAULT: number;
    };
}

interface ConnectionStatus {
    PENDING: string;
    ACCEPTED: string;
    DECLINED: string;
    BLOCKED: string;
    REMOVED: string;
    EXPIRED: string;
}

interface ProfileVisibility {
    PUBLIC: string;
    CONNECTIONS: string;
    PRIVATE: string;
    BLOCKED: string;
}

interface Constants {
    APP_INFO: AppInfo;
    TOKEN_TYPES: TokenTypes;
    TOKEN_EXPIRY: TokenExpiry;
    USER_STATUS: UserStatus;
    USER_ROLES: UserRoles;
    USER_PERMISSIONS: Record<string, string>;
    ROLE_PERMISSIONS: Record<string, string[]>;
    AUTH_PROVIDERS: Record<string, string>;
    MFA_METHODS: Record<string, string>;
    PASSWORD_STRENGTH: Record<string, number>;
    PASSWORD_POLICY: Record<string, number>;
    LOCATION_VALIDATION: Record<string, any>;
    USER_VALIDATION: Record<string, any>;
    ONBOARDING: Record<string, any>;
    EXPERIENCE_VALIDATION: Record<string, any>;
    EDUCATION_VALIDATION: Record<string, any>;
    CAREER_BREAK_VALIDATION: Record<string, any>;
    TEST_SCORE_VALIDATION: Record<string, any>;
    SKILLS_VALIDATION: Record<string, any>;
    CONTACT_VALIDATION: Record<string, any>;
    PROFILE_PHOTO_VALIDATION: Record<string, any>;
    COVER_PHOTO_VALIDATION: Record<string, any>;
    COMPANY_LOGO_VALIDATION: Record<string, any>;
    COMPANY_COVER_VALIDATION: Record<string, any>;
    ANALYTICS_VALIDATION: Record<string, any>;
    ANALYTICS_SETTINGS: Record<string, any>;
    IMPRESSION_SOURCES: Record<string, string>;
    COVER_STATUS: Record<string, string>;
    PHOTO_STATUS: Record<string, string>;
    INTRODUCTION_VALIDATION: Record<string, any>;
    VIDEO_UPLOAD_VALIDATION: Record<string, any>;
    ACTIVITY_VALIDATION: Record<string, any>;
    NOTIFICATION_CHANNELS: string[];
    NOTIFICATION_PRIORITIES: Record<string, string>;
    NOTIFICATION_TYPES: Record<string, string>;
    NOTIFICATION_STATUS: Record<string, string>;
    AUDIT_ACTIONS: Record<string, string>;
    AUDIT_STATUS: Record<string, string>;
    AUDIT_SEVERITIES: Record<string, string>;
    RATE_LIMITS: Record<string, RateLimit>;
    CACHE_TTLS: CacheTTLs;
    CACHE_KEYS: CacheKeys;
    CACHE_PREFIXES: Record<string, string>;
    KAFKA_TOPICS: Record<string, string>;
    CRITICAL_TOPICS: string[];
    SHARD_KEYS: Record<string, ShardKey>;
    HTTP_STATUS: Record<string, number>;
    ERROR_CODES: Record<string, string>;
    PAGINATION: Record<string, number>;
    FILE_UPLOAD: Record<string, any>;
    SECURITY: Record<string, any>;
    COMPLIANCE: Record<string, any>;
    MONITORING: Record<string, any>;
    OAUTH: Record<string, any>;
    CONNECTION_STATUS: Record<string, string>;
    PROFILE_VISIBILITY: Record<string, string>;
    PRIVACY_SETTINGS: Record<string, any>;
    CONNECTION_SERVICE_CONSTANTS: Record<string, any>;
}

const constants: Constants = {
    APP_INFO: {
        NAME: 'Auth Service',
        VERSION: process.env.APP_VERSION || '3.0.0',
        ENV: process.env.NODE_ENV || 'development',
        PORT: parseInt(process.env.PORT || '5000'),
    },

    TOKEN_TYPES: {
        ACCESS: 'access',
        REFRESH: 'refresh',
        EMAIL_VERIFICATION: 'email_verification',
        PASSWORD_RESET: 'password_reset',
        MAGIC_LINK: 'magic_link',
        API_KEY: 'api_key',
    },

    TOKEN_EXPIRY: {
        ACCESS_TOKEN: process.env.ACCESS_TOKEN_EXPIRY || '15m',
        ACCESS_TOKEN_MS: 15 * 60 * 1000,
        REFRESH_TOKEN: '30d',
        REFRESH_TOKEN_MS: 30 * 24 * 60 * 60 * 1000,
        REFRESH_TOKEN_REMEMBER_ME: process.env.REFRESH_TOKEN_REMEMBER_EXPIRY || '90d',
        REFRESH_TOKEN_REMEMBER_ME_MS: 90 * 24 * 60 * 60 * 1000,
        EMAIL_VERIFICATION: 24 * 60 * 60 * 1000,
        EMAIL_VERIFICATION_HOURS: 24,
        PASSWORD_RESET: 15 * 60 * 1000,
        MAGIC_LINK: 15 * 60 * 1000,
        OTP: 10 * 60 * 1000,
        MFA_CODE: 5 * 60 * 1000,
    },

    USER_STATUS: {
        ACTIVE: 'active',
        INACTIVE: 'inactive',
        SUSPENDED: 'suspended',
        DEACTIVATED: 'deactivated',
        DELETED: 'deleted',
        ANONYMIZED: 'anonymized',
    },

    USER_ROLES: {
        USER: 'user',
        EMPLOYER: 'employer',
        ADMIN: 'admin',
        SUPER_ADMIN: 'super_admin',
    },

    USER_PERMISSIONS: {
        'user:read': 'Read user profile',
        'user:update': 'Update user profile',
        'user:delete': 'Delete user account',
        'employer:create': 'Create employer profile',
        'employer:read': 'Read employer data',
        'employer:update': 'Update employer data',
        'admin:users:read': 'View all users',
        'admin:users:update': 'Update any user',
        'admin:users:delete': 'Delete any user',
        'admin:analytics:read': 'View analytics',
        'admin:audit:read': 'View audit logs',
        'superadmin:*': 'Full system access',
    },

    ROLE_PERMISSIONS: {
        user: ['user:read', 'user:update', 'user:delete'],
        employer: ['user:read', 'user:update', 'user:delete', 'employer:create', 'employer:read', 'employer:update'],
        admin: ['admin:users:read', 'admin:users:update', 'admin:users:delete', 'admin:analytics:read', 'admin:audit:read'],
        super_admin: ['superadmin:*'],
    },

    AUTH_PROVIDERS: {
        LOCAL: 'local',
        GOOGLE: 'google',
        GITHUB: 'github',
    },

    MFA_METHODS: {
        TOTP: 'totp',
        SMS: 'sms',
        EMAIL: 'email',
        NONE: 'none',
    },

    PASSWORD_STRENGTH: {
        WEAK: 0,
        FAIR: 1,
        GOOD: 2,
        STRONG: 3,
        VERY_STRONG: 4,
    },

    PASSWORD_POLICY: {
        MIN_LENGTH: 8,
        MAX_LENGTH: 128,
        MIN_STRENGTH_SCORE: 3,
        HISTORY_COUNT: 5,
        EXPIRY_DAYS: 90,
        CHANGE_OTP_EXPIRY_MINUTES: 10,
        RESET_CODE_EXPIRY_MINUTES: 15,
        MAX_RESET_ATTEMPTS: 5,
        MAX_CHANGE_ATTEMPTS: 3,
    },

    LOCATION_VALIDATION: {
        MIN_LENGTH: 2,
        MAX_LENGTH: 50,
        ALLOWED_COUNTRIES: ['India', 'USA', 'UK', 'Canada', 'Australia'],
        MAJOR_INDIAN_CITIES: [
            'Mumbai', 'Delhi', 'Bangalore', 'Hyderabad', 'Ahmedabad',
            'Chennai', 'Kolkata', 'Surat', 'Pune', 'Jaipur',
            'Lucknow', 'Kanpur', 'Nagpur', 'Indore', 'Thane',
            'Bhopal', 'Visakhapatnam', 'Pimpri-Chinchwad', 'Patna',
            'Vadodara', 'Ghaziabad', 'Ludhiana', 'Agra', 'Nashik',
            'Faridabad', 'Meerut', 'Rajkot', 'Kalyan-Dombivli',
            'Vasai-Virar', 'Varanasi', 'Srinagar', 'Aurangabad',
            'Dhanbad', 'Amritsar', 'Navi Mumbai', 'Allahabad',
            'Ranchi', 'Howrah', 'Coimbatore', 'Jabalpur', 'Gwalior',
            'Vijayawada', 'Jodhpur', 'Madurai', 'Raipur', 'Kota',
            'Chandigarh', 'Guwahati', 'Solapur', 'Hubli-Dharwad',
            'Mysore', 'Tiruchirappalli', 'Bareilly', 'Aligarh',
            'Tiruppur', 'Moradabad', 'Jalandhar', 'Bhubaneswar',
            'Salem', 'Warangal', 'Guntur', 'Bhiwandi', 'Saharanpur',
            'Gorakhpur', 'Bikaner', 'Amravati', 'Noida', 'Jamshedpur',
            'Bhilai', 'Cuttack', 'Firozabad', 'Kochi', 'Nellore',
            'Bhavnagar', 'Dehradun', 'Durgapur', 'Asansol', 'Rourkela',
            'Nanded', 'Kolhapur', 'Ajmer', 'Akola', 'Gulbarga',
            'Jamnagar', 'Ujjain', 'Loni', 'Siliguri', 'Jhansi',
            'Ulhasnagar', 'Jammu', 'Sangli-Miraj-Kupwad', 'Mangalore',
            'Erode', 'Belgaum', 'Ambattur', 'Tirunelveli', 'Malegaon',
            'Gaya', 'Jalgaon', 'Udaipur', 'Maheshtala'
        ],
        PATTERN: /^[A-Z][a-zA-Z\s\-]{1,49}$/,  // First letter capital, allows spaces and hyphens
    },

    USER_VALIDATION: {
        FIRST_NAME: {
            MIN_LENGTH: 2,
            MAX_LENGTH: 50,
            PATTERN: /^[A-Za-z\s\-']+$/,  // Letters, spaces, hyphens, apostrophes
            REQUIRED: true,
        },
        LAST_NAME: {
            MIN_LENGTH: 2,
            MAX_LENGTH: 50,
            PATTERN: /^[A-Za-z\s\-']+$/,
            REQUIRED: false,
        },
        PASSWORD_CONFIRMATION: {
            REQUIRED: true,
            MUST_MATCH: true,
        },
    },
    // ==================== ONBOARDING VALIDATION ====================
    ONBOARDING: {
        USER_TYPES: ['working', 'student', 'fresher'] as const,

        // Working Professional Validation
        WORKING: {
            MIN_JOB_DURATION_MONTHS: 1,
            MAX_JOB_DURATION_YEARS: 50,
            JOB_TITLES: [
                'software-engineer',
                'senior-software-engineer',
                'staff-engineer',
                'principal-engineer',
                'engineering-manager',
                'product-manager',
                'senior-product-manager',
                'data-scientist',
                'senior-data-scientist',
                'ml-engineer',
                'devops-engineer',
                'sre-engineer',
                'frontend-developer',
                'backend-developer',
                'fullstack-developer',
                'mobile-developer',
                'ios-developer',
                'android-developer',
                'ui-ux-designer',
                'product-designer',
                'qa-engineer',
                'test-engineer',
                'data-analyst',
                'business-analyst',
                'project-manager',
                'scrum-master',
                'technical-lead',
                'architect',
                'cloud-engineer',
                'security-engineer',
                'blockchain-developer',
                'game-developer',
                'other'
            ],
            COMPANIES: [
                'Google',
                'Microsoft',
                'Amazon',
                'Meta',
                'Apple',
                'Netflix',
                'Adobe',
                'Salesforce',
                'Oracle',
                'IBM',
                'Intel',
                'NVIDIA',
                'TCS',
                'Infosys',
                'Wipro',
                'HCL',
                'Tech Mahindra',
                'Cognizant',
                'Accenture',
                'Capgemini',
                'Deloitte',
                'EY',
                'PwC',
                'KPMG',
                'Flipkart',
                'Paytm',
                'PhonePe',
                'Razorpay',
                'Swiggy',
                'Zomato',
                'Ola',
                'Uber',
                'Startup',
                'Freelance',
                'Self-Employed',
                'Other'
            ],
        },

        // Student Validation
        STUDENT: {
            MIN_COLLEGE_NAME_LENGTH: 3,
            MAX_COLLEGE_NAME_LENGTH: 100,
            VALID_DEGREES: [
                'B.Tech',
                'B.E',
                'B.Sc',
                'BCA',
                'B.Com',
                'B.A',
                'M.Tech',
                'M.E',
                'M.Sc',
                'MCA',
                'M.Com',
                'M.A',
                'MBA',
                'PhD',
                'Diploma',
                'Other'
            ],
            VALID_FIELDS: [
                'Computer Science',
                'Information Technology',
                'Electronics',
                'Electrical',
                'Mechanical',
                'Civil',
                'Chemical',
                'Biotechnology',
                'Aerospace',
                'Automobile',
                'Data Science',
                'Artificial Intelligence',
                'Machine Learning',
                'Cyber Security',
                'Business Administration',
                'Finance',
                'Marketing',
                'Mathematics',
                'Physics',
                'Chemistry',
                'Biology',
                'Other'
            ],
            MIN_GRAD_YEAR: 2020,
            MAX_GRAD_YEAR: 2035,
            GRAD_YEAR_PATTERN: /^\d{4}$/,
        },

        // Fresher Validation
        FRESHER: {
            VALID_EDUCATION_LEVELS: [
                '10th Pass',
                '12th Pass',
                'Diploma',
                'B.Tech',
                'B.E',
                'B.Sc',
                'BCA',
                'B.Com',
                'B.A',
                'M.Tech',
                'M.Sc',
                'MCA',
                'MBA',
                'Other'
            ],
            VALID_JOB_ROLES: [
                'Software Developer',
                'Frontend Developer',
                'Backend Developer',
                'Full Stack Developer',
                'Mobile App Developer',
                'Data Analyst',
                'Data Scientist',
                'Machine Learning Engineer',
                'DevOps Engineer',
                'Quality Assurance Engineer',
                'UI/UX Designer',
                'Product Manager',
                'Business Analyst',
                'Digital Marketing',
                'Content Writer',
                'Sales Executive',
                'Customer Support',
                'HR Recruiter',
                'Other'
            ],
            CGPA_PATTERN: /^(\d{1,2}(\.\d{1,2})?|10(\.0{1,2})?)$/,  // 0.00 to 10.00
            PERCENTAGE_PATTERN: /^([1-9]\d?|100)(\.\d{1,2})?$/,  // 0.00 to 100.00
        },
    },

    // After ONBOARDING section, add:

    EXPERIENCE_VALIDATION: {
        TITLE: {
            MIN_LENGTH: 2,
            MAX_LENGTH: 100,
            PATTERN: /^[A-Z][a-zA-Z\s\-'.&()]+$/,  // First letter capital, allows letters, spaces, hyphens, apostrophes, &, ()
            REQUIRED: true,
            EXAMPLES: [
                'Software Engineer',
                'Senior Product Manager',
                'Co-Founder & CEO',
                'Full Stack Developer',
                'Data Scientist (ML)',
                'Engineering Manager',
            ]
        },
        COMPANY_NAME: {
            MIN_LENGTH: 2,
            MAX_LENGTH: 150,
            PATTERN: /^[A-Z0-9][a-zA-Z0-9\s\-'.&()]+$/,  // First char capital/number, allows alphanumeric, spaces, special chars
            REQUIRED: true,
            EXAMPLES: [
                'Thronet Technology Private Limited (Throne8)',
                'Google LLC',
                'Microsoft Corporation',
                'Amazon Web Services (AWS)',
                'Self-Employed',
            ]
        },
        DESCRIPTION: {
            MIN_LENGTH: 10,
            MAX_LENGTH: 5000,
            PATTERN: /^[\s\S]+$/,  // Allow any characters including newlines
            REQUIRED: false,
        },
        DATE_VALIDATION: {
            MIN_YEAR: 1970,
            MAX_YEAR: new Date().getFullYear() + 1,  // Allow 1 year in future for notice period
            START_DATE_REQUIRED: true,
            END_DATE_REQUIRED: false,
            ALLOW_ONGOING: true,  // If endDate is null, considered as "Present"
        },
        EMPLOYMENT_TYPES: [
            'full-time',
            'part-time',
            'contract',
            'freelance',
            'internship',
            'self-employed',
        ] as const,
        LOCATION_TYPES: [
            'on-site',
            'remote',
            'hybrid',
        ] as const,
    },

    // After EXPERIENCE_VALIDATION section, add:

    EDUCATION_VALIDATION: {
        SCHOOL_COLLEGE_NAME: {
            MIN_LENGTH: 2,
            MAX_LENGTH: 200,
            PATTERN: /^[A-Z0-9][a-zA-Z0-9\s\-'.&(),]+$/,  // First char capital/number
            REQUIRED: true,
            EXAMPLES: [
                'Indian Institute of Technology (IIT) Bombay',
                'Delhi Public School',
                'Harvard University',
                'St. Xavier\'s College',
                'National Institute of Technology (NIT) Trichy',
            ]
        },
        DEGREE_TYPES: [
            'High School',           // 10th/12th
            'Diploma',              // Polytechnic
            'Bachelor\'s',          // B.Tech, B.Sc, BCA, etc.
            'Master\'s',            // M.Tech, M.Sc, MBA, etc.
            'Doctorate',            // PhD
            'Certificate',          // Short courses
            'Other'
        ] as const,
        DEGREE: {
            MIN_LENGTH: 2,
            MAX_LENGTH: 100,
            PATTERN: /^[A-Z][a-zA-Z\s\-.()]+$/,  // First letter capital
            REQUIRED: true,
            VALID_DEGREES: [
                // School
                '10th Grade',
                '12th Grade',
                'High School Diploma',

                // Undergraduate
                'B.Tech',
                'B.E',
                'B.Sc',
                'BCA',
                'B.Com',
                'B.A',
                'BBA',
                'B.Des',
                'B.Arch',

                // Postgraduate
                'M.Tech',
                'M.E',
                'M.Sc',
                'MCA',
                'M.Com',
                'M.A',
                'MBA',
                'M.Des',
                'M.Arch',

                // Doctorate
                'PhD',
                'Doctorate',

                // Diploma
                'Diploma',
                'Polytechnic Diploma',
                'Advanced Diploma',

                // Other
                'Other',
            ]
        },
        SPECIALIZATION: {
            MIN_LENGTH: 2,
            MAX_LENGTH: 150,
            PATTERN: /^[A-Z][a-zA-Z\s\-&(),]+$/,  // First letter capital
            REQUIRED: false,
            EXAMPLES: [
                'Computer Science and Engineering',
                'Electronics and Communication',
                'Mechanical Engineering',
                'Information Technology',
                'Data Science and AI',
                'Business Administration',
                'Finance and Accounting',
            ]
        },
        DESCRIPTION: {
            MIN_LENGTH: 10,
            MAX_LENGTH: 5000,
            PATTERN: /^[\s\S]+$/,  // Any characters including newlines
            REQUIRED: false,
        },
        DATE_VALIDATION: {
            MIN_YEAR: 1970,
            MAX_YEAR: new Date().getFullYear() + 5,  // Allow 5 years in future for ongoing courses
            START_DATE_REQUIRED: true,
            END_DATE_REQUIRED: false,
            ALLOW_ONGOING: true,  // If endDate is null, considered as "Present"
        },
        EDUCATION_TYPES: [
            'full-time',
            'part-time',
            'distance',
            'online',
        ] as const,
        GRADE_TYPES: [
            'percentage',
            'cgpa',
            'gpa',
            'grade',
        ] as const,
    },

    CAREER_BREAK_VALIDATION: {
        BREAK_TYPES: [
            'Caregiving',
            'Personal travel',
            'Career transition',
            'Layoff',
            'Full-time parenting',
            'Sabbatical',
            'Health & well-being',
            'Bereavement',
            'Gap year',
            'Relocation',
            'Retirement',
            'Volunteer work',
            'Other'
        ] as const,
        DESCRIPTION: {
            MIN_LENGTH: 10,
            MAX_LENGTH: 500,
            PATTERN: /^[\s\S]+$/,
            REQUIRED: false,
        },
        DATE_VALIDATION: {
            MIN_YEAR: 1970,
            MAX_YEAR: new Date().getFullYear() + 1,
            START_DATE_REQUIRED: true,
            END_DATE_REQUIRED: false,
            ALLOW_ONGOING: true,
        },
    },

    TEST_SCORE_VALIDATION: {
        TEST_NAMES: [
            'GRE',
            'GMAT',
            'TOEFL',
            'IELTS',
            'SAT',
            'ACT',
            'LSAT',
            'MCAT',
            'CAT',
            'JEE',
            'NEET',
            'GATE',
            'UPSC',
            'PTE',
            'Duolingo English Test',
            'Other'
        ] as const,
        SCORE: {
            MIN_LENGTH: 1,
            MAX_LENGTH: 50,
            PATTERN: /^[0-9.\/\s-]+$/,  // Numbers, dots, slashes, spaces, hyphens (e.g., "320/340", "7.5", "1450")
            REQUIRED: true,
        },
        DESCRIPTION: {
            MIN_LENGTH: 10,
            MAX_LENGTH: 500,
            PATTERN: /^[\s\S]+$/,
            REQUIRED: false,
        },
        DATE_VALIDATION: {
            MIN_YEAR: 1970,
            MAX_YEAR: new Date().getFullYear() + 1,
            REQUIRED: true,
        },
        VALIDITY_YEARS: {
            GRE: 5,
            GMAT: 5,
            TOEFL: 2,
            IELTS: 2,
            SAT: 5,
            ACT: 5,
            LSAT: 5,
            MCAT: 3,
            PTE: 2,
            'Duolingo English Test': 2,
            DEFAULT: 5,
        },
    },

    SKILLS_VALIDATION: {
        SKILL_NAME: {
            MIN_LENGTH: 2,
            MAX_LENGTH: 100,
            PATTERN: /^[A-Za-z0-9][a-zA-Z0-9\s\-+#.()]+$/,
            REQUIRED: true,
            EXAMPLES: [
                'JavaScript',
                'Python',
                'React.js',
                'Node.js',
                'Machine Learning',
                'UI/UX Design',
                'Project Management',
                'C++',
                'Data Analysis',
            ]
        },
        CATEGORY: {
            MAX_LENGTH: 50,
            EXAMPLES: [
                'Programming',
                'Design',
                'Marketing',
                'Management',
                'Data Science',
                'DevOps',
                'Cloud Computing',
            ]
        },
        SKILL_STRENGTHS: [
            'beginner',
            'intermediate',
            'advanced',
            'expert',
        ] as const,
        MAX_SKILLS_PER_USER: 50,
        MAX_PINNED_SKILLS: 3,
        YEARS_OF_EXPERIENCE: {
            MIN: 0,
            MAX: 50,
        },
    },

    CONTACT_VALIDATION: {
        // Profile URL
        PROFILE_URL: {
            MIN_LENGTH: 3,
            MAX_LENGTH: 50,
            PATTERN: /^[a-z0-9_-]+$/,  // lowercase, numbers, underscore, hyphen
            RESERVED_USERNAMES: [
                'admin', 'api', 'www', 'mail', 'ftp', 'localhost',
                'root', 'system', 'support', 'help', 'about',
                'contact', 'careers', 'jobs', 'blog', 'news',
                'settings', 'account', 'profile', 'user', 'login',
                'signup', 'register', 'logout', 'dashboard', 'home'
            ],
        },

        // Phone Numbers
        PHONES: {
            MAX_PHONES: 3,
            MIN_LENGTH: 10,
            MAX_LENGTH: 15,
            PATTERN: /^\+?[1-9]\d{9,14}$/,  // International format
            COUNTRY_CODES: ['+1', '+44', '+91', '+61', '+81', '+86'],
        },

        PHONE_TYPES: ['mobile', 'home', 'work'] as const,

        // Birthday
        BIRTHDAY: {
            MIN_YEAR: 1900,
            MAX_YEAR: new Date().getFullYear() - 13,  // Minimum 13 years old
            ALLOW_HIDE_YEAR: true,
        },

        // Address/Location
        ADDRESS: {
            MIN_LENGTH: 5,
            MAX_LENGTH: 500,
            STREET_MAX_LENGTH: 200,
            CITY_MAX_LENGTH: 100,
            STATE_MAX_LENGTH: 100,
            COUNTRY_MAX_LENGTH: 100,
            POSTAL_CODE_MAX_LENGTH: 20,
        },

        // Websites
        WEBSITES: {
            MAX_WEBSITES: 3,
            MAX_URL_LENGTH: 500,
            ALLOWED_PROTOCOLS: ['http://', 'https://'],
        },

        WEBSITE_TYPES: ['personal', 'company', 'portfolio', 'blog', 'social', 'other'] as const,

        // Visibility Levels
        VISIBILITY_LEVELS: ['public', 'connections', 'private', 'me_only'] as const,

        // Discovery Options
        DISCOVERY_OPTIONS: ['anyone', 'connections_only', 'no_one'] as const,
    },

    PROFILE_PHOTO_VALIDATION: {
        MAX_FILE_SIZE: 50 * 1024 * 1024,  // 50MB
        ALLOWED_MIME_TYPES: ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif'],
        ALLOWED_EXTENSIONS: ['.jpg', '.jpeg', '.png', '.webp', '.gif'],
        MIN_WIDTH: 100,
        MIN_HEIGHT: 100,
        MAX_WIDTH: 10000,
        MAX_HEIGHT: 10000,
        RECOMMENDED_WIDTH: 800,
        RECOMMENDED_HEIGHT: 800,
        CLOUDINARY_FOLDER: 'profile-photos',
        MAX_PHOTOS_PER_USER: 10,  // User can upload max 10 photos
    },

    ANALYTICS_VALIDATION: {
        DATE_RANGES: {
            LAST_7_DAYS: 7,
            LAST_30_DAYS: 30,
            LAST_90_DAYS: 90,
        },
        MAX_VIEWS_STORED: 1000,           // Max profile views to store
        MAX_IMPRESSIONS_STORED: 5000,     // Max post impressions to store
        MAX_APPEARANCES_STORED: 1000,     // Max search appearances to store
        DATA_RETENTION_DAYS: 90,          // Keep data for 90 days
    },

    ANALYTICS_SETTINGS: {
        // Impression counting rules
        IMPRESSION_COOLDOWN_HOURS: 6,  // ✅ User can't re-count for 6 hours
        SESSION_TIMEOUT_MINUTES: 30,    // Session expires after 30 min inactivity

        // Graph generation
        MAX_CUSTOM_DAYS: 365,
        DEFAULT_GRAPH_DAYS: 30,

        // Rate limiting for analytics recording
        MAX_IMPRESSIONS_PER_HOUR: 100,
        MAX_VIEWS_PER_HOUR: 50,
    },

    // ADD impression sources
    IMPRESSION_SOURCES: {
        HOME_FEED: 'home_feed',
        PROFILE: 'profile',
        SEARCH: 'search',
        HASHTAG: 'hashtag',
        NOTIFICATIONS: 'notifications',
        DIRECT_LINK: 'direct_link',
    } as const,

    // ==================== ADD TO YOUR CONSTANTS FILE ====================
    // Add this section after PROFILE_PHOTO_VALIDATION

    COVER_PHOTO_VALIDATION: {
        MAX_FILE_SIZE: 50 * 1024 * 1024,  // 50MB
        ALLOWED_MIME_TYPES: ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif'],
        ALLOWED_EXTENSIONS: ['.jpg', '.jpeg', '.png', '.webp', '.gif'],

        // Minimum dimensions for cover photos (landscape orientation)
        MIN_WIDTH: 400,
        MIN_HEIGHT: 200,

        // Maximum dimensions
        MAX_WIDTH: 10000,
        MAX_HEIGHT: 10000,

        // Recommended dimensions (16:9 aspect ratio)
        RECOMMENDED_WIDTH: 1920,
        RECOMMENDED_HEIGHT: 1080,

        // Aspect ratio validation (to ensure landscape format)
        MIN_ASPECT_RATIO: 1.5,   // 3:2 minimum (1.5:1)
        MAX_ASPECT_RATIO: 4.0,   // 4:1 maximum (very wide)
        RECOMMENDED_ASPECT_RATIO: 16 / 9,  // 1.78:1 (standard widescreen)

        CLOUDINARY_FOLDER: 'cover-photos',
        MAX_COVERS_PER_USER: 10,  // User can upload max 10 covers
    },

    COMPANY_LOGO_VALIDATION: {
        MAX_FILE_SIZE: 10 * 1024 * 1024,
        ALLOWED_MIME_TYPES: ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'],
        ALLOWED_EXTENSIONS: ['.jpg', '.jpeg', '.png', '.webp'],
        MIN_WIDTH: 100,
        MIN_HEIGHT: 100,
        MAX_WIDTH: 10000,        // logo ke liye theek hai
        MAX_HEIGHT: 10000,
        RECOMMENDED_WIDTH: 400,
        RECOMMENDED_HEIGHT: 400,
        CLOUDINARY_FOLDER: 'company-logos',
    },

    // ✅ YE ADD KARO — naya section:
    COMPANY_COVER_VALIDATION: {
        MAX_FILE_SIZE: 10 * 1024 * 1024,
        ALLOWED_MIME_TYPES: ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'],
        ALLOWED_EXTENSIONS: ['.jpg', '.jpeg', '.png', '.webp'],
        MIN_WIDTH: 100,
        MIN_HEIGHT: 100,
        MAX_WIDTH: 5000,
        MAX_HEIGHT: 5000,
        RECOMMENDED_WIDTH: 5000,
        RECOMMENDED_HEIGHT: 5000,
        CLOUDINARY_FOLDER: 'company-covers',
    },

    COVER_STATUS: {
        ACTIVE: 'active',
        ARCHIVED: 'archived',
        DELETED: 'deleted',
    } as const,

    // ==================== INTRODUCTION VALIDATION ====================
    INTRODUCTION_VALIDATION: {
        MIN_LENGTH: 50,
        MAX_LENGTH: 3000,  // ~500 words (average 6 chars per word)
        MAX_WORDS: 500,
        PATTERN: /^[A-Z].*/,  // Must start with capital letter
        REQUIRED: true,
    },

    // ==================== VIDEO UPLOAD VALIDATION ====================
    VIDEO_UPLOAD_VALIDATION: {
        MAX_FILE_SIZE: 500 * 1024 * 1024,  // 500MB
        MAX_DURATION_SECONDS: 90,  // 90 seconds max
        ALLOWED_MIME_TYPES: [
            'video/mp4',
            'video/mpeg',
            'video/quicktime',
            'video/x-msvideo',
            'video/webm',
        ],
        ALLOWED_EXTENSIONS: ['.mp4', '.mov', '.avi', '.webm', '.mpeg'],
        CLOUDINARY_FOLDER: 'profile-videos',
        MAX_VIDEOS_PER_USER: 5,
    },

    ACTIVITY_VALIDATION: {
        POST: {
            TITLE_MIN_LENGTH: 1,
            TITLE_MAX_LENGTH: 300,
            TITLE_PATTERN: /^[A-Z].*/,  // Must start with capital
            CONTENT_MAX_LENGTH: 10000,
            MAX_IMAGES_PER_POST: 10,
            MAX_VIDEOS_PER_POST: 5,
            MAX_DOCUMENTS_PER_POST: 5,
        },
        COMMENT: {
            MIN_LENGTH: 1,
            MAX_LENGTH: 2000,
        },
        IMAGE: {
            MAX_FILE_SIZE: 10 * 1024 * 1024,  // 10MB
            ALLOWED_MIME_TYPES: ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif'],
            ALLOWED_EXTENSIONS: ['.jpg', '.jpeg', '.png', '.webp', '.gif'],
            MIN_WIDTH: 100,
            MIN_HEIGHT: 100,
            MAX_WIDTH: 10000,
            MAX_HEIGHT: 10000,
            CLOUDINARY_FOLDER: 'activity-images',
        },
        VIDEO: {
            MAX_FILE_SIZE: 500 * 1024 * 1024,  // 500MB
            MAX_DURATION_SECONDS: 300,  // 5 minutes
            ALLOWED_MIME_TYPES: ['video/mp4', 'video/mpeg', 'video/quicktime', 'video/webm'],
            ALLOWED_EXTENSIONS: ['.mp4', '.mov', '.webm', '.mpeg'],
            CLOUDINARY_FOLDER: 'activity-videos',
        },
        DOCUMENT: {
            MAX_FILE_SIZE: 50 * 1024 * 1024,  // 50MB
            ALLOWED_MIME_TYPES: ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
            ALLOWED_EXTENSIONS: ['.pdf', '.doc', '.docx'],
            CLOUDINARY_FOLDER: 'activity-documents',
        },

        POLL: {
            QUESTION_MAX_LENGTH: 140,
            OPTION_MAX_LENGTH: 100,
            MIN_OPTIONS: 2,
            MAX_OPTIONS: 4,
            ALLOWED_DURATIONS: [1, 3, 7, 14] as const,
        },

        EVENT: {
            NAME_MAX_LENGTH: 75,
            DESCRIPTION_MAX_LENGTH: 5000,
            ALLOWED_TYPES: ['online', 'in-person', 'hybrid'] as const,
            ALLOWED_FORMATS: ['conference', 'webinar', 'workshop', 'meetup', 'seminar', 'other'] as const,
        },

        SCHEDULED_POST: {
            MIN_FUTURE_MINUTES: 5, // Minimum 5 minutes in future
            MAX_FUTURE_DAYS: 365,  // Maximum 1 year in future
        }
    },


    PHOTO_STATUS: {
        ACTIVE: 'active',
        ARCHIVED: 'archived',
        DELETED: 'deleted',
    } as const,

    NOTIFICATION_CHANNELS: ['web', 'mobile', 'email', 'sms', 'push'],

    NOTIFICATION_PRIORITIES: {
        LOW: 'low',
        NORMAL: 'normal',
        HIGH: 'high',
        URGENT: 'urgent',
    },

    NOTIFICATION_TYPES: {
        INFO: 'info',
        SUCCESS: 'success',
        WARNING: 'warning',
        ERROR: 'error',
        MARKETING: 'marketing',
        SYSTEM: 'system',
        SECURITY: 'security',
    },

    NOTIFICATION_STATUS: {
        PENDING: 'pending',
        SENT: 'sent',
        DELIVERED: 'delivered',
        READ: 'read',
        FAILED: 'failed',
        EXPIRED: 'expired',
    },

    AUDIT_ACTIONS: {
        USER_REGISTERED: 'USER_REGISTERED',
        REGISTRATION_FAILED: 'REGISTRATION_FAILED',
        REGISTRATION_ERROR: 'REGISTRATION_ERROR',
        USER_LOGIN: 'USER_LOGIN',
        USER_LOGOUT: 'USER_LOGOUT',
        LOGIN_FAILED: 'LOGIN_FAILED',
        PASSWORD_CHANGED: 'PASSWORD_CHANGED',
        MFA_ENABLED: 'MFA_ENABLED',
        EMAIL_VERIFIED: 'EMAIL_VERIFIED',
        SERVER_STARTED: 'SERVER_STARTED',
        APP_INIT_FAILED: 'APP_INIT_FAILED',
        QUEUE_MANAGER_INITIALIZED: 'QUEUE_MANAGER_INITIALIZED',
        QUEUE_MANAGER_SHUTDOWN: 'QUEUE_MANAGER_SHUTDOWN',

        EMAIL_VERIFICATION_LINK_SENT: 'EMAIL_VERIFICATION_LINK_SENT',
        EMAIL_VERIFICATION_LINK_FAILED: 'EMAIL_VERIFICATION_LINK_FAILED',
        EMAIL_VERIFICATION_RATE_LIMIT_EXCEEDED: 'EMAIL_VERIFICATION_RATE_LIMIT_EXCEEDED',
        EMAIL_VERIFICATION_USER_NOT_FOUND: 'EMAIL_VERIFICATION_USER_NOT_FOUND',
        EMAIL_ALREADY_VERIFIED: 'EMAIL_ALREADY_VERIFIED',

        AADHAAR_VERIFICATION_OTP_SENT: 'AADHAAR_VERIFICATION_OTP_SENT',
        AADHAAR_VERIFIED: 'AADHAAR_VERIFIED',
        COMPANY_EMAIL_OTP_SENT: 'COMPANY_EMAIL_OTP_SENT',
        COMPANY_EMAIL_VERIFIED: 'COMPANY_EMAIL_VERIFIED',

        HEADLINE_CREATED: 'HEADLINE_CREATED',
        HEADLINE_UPDATED: 'HEADLINE_UPDATED',
        HEADLINE_DELETED: 'HEADLINE_DELETED',
        HEADLINE_CREATE_FAILED: 'HEADLINE_CREATE_FAILED',

        EXPERIENCE_CREATED: 'EXPERIENCE_CREATED',
        EXPERIENCE_CREATE_FAILED: 'EXPERIENCE_CREATE_FAILED',

        EDUCATION_CREATED: 'EDUCATION_CREATED',
        EDUCATION_CREATE_FAILED: 'EDUCATION_CREATE_FAILED',

        PROFILE_PHOTO_UPLOADED: 'PROFILE_PHOTO_UPLOADED',
        PROFILE_PHOTO_UPLOAD_FAILED: 'PROFILE_PHOTO_UPLOAD_FAILED',
        PROFILE_PHOTO_DELETED: 'PROFILE_PHOTO_DELETED',

        PROFILE_PHOTO_UPDATED: 'PROFILE_PHOTO_UPDATED',
        PROFILE_PHOTO_UPDATE_FAILED: 'PROFILE_PHOTO_UPDATE_FAILED',

        INTRODUCTION_CREATED: 'INTRODUCTION_CREATED',
        VIDEO_UPLOADED: 'VIDEO_UPLOADED',
        VIDEO_DELETED: 'VIDEO_DELETED',
        EXPERIENCE_UPDATED: 'EXPERIENCE_UPDATED',
        EXPERIENCE_DELETED_SOFT: 'EXPERIENCE_DELETED_SOFT',
        EXPERIENCE_DELETED_PERMANENT: 'EXPERIENCE_DELETED_PERMANENT',
        EXPERIENCE_ARCHIVED: 'EXPERIENCE_ARCHIVED',
        EXPERIENCE_RESTORED: 'EXPERIENCE_RESTORED',

        POST_CREATED: 'POST_CREATED',
        POST_UPDATED: 'POST_UPDATED',
        POST_DELETED: 'POST_DELETED',
        POST_ARCHIVED: 'POST_ARCHIVED',
        POST_RESTORED: 'POST_RESTORED',
        POST_PINNED: 'POST_PINNED',
        POST_SAVED: 'POST_SAVED',
        COMMENT_CREATED: 'COMMENT_CREATED',
        COMMENT_DELETED: 'COMMENT_DELETED',

        COVER_PHOTO_UPLOADED: 'COVER_PHOTO_UPLOADED',
        COVER_PHOTO_UPLOAD_FAILED: 'COVER_PHOTO_UPLOAD_FAILED',
        COVER_PHOTO_UPDATED: 'COVER_PHOTO_UPDATED',
        COVER_PHOTO_UPDATE_FAILED: 'COVER_PHOTO_UPDATE_FAILED',
        COVER_PHOTO_DELETED: 'COVER_PHOTO_DELETED',

        CONTACT_CREATED: 'CONTACT_CREATED',
        CONTACT_UPDATED: 'CONTACT_UPDATED',
        CONTACT_DELETED: 'CONTACT_DELETED',
        CONTACT_CREATE_FAILED: 'CONTACT_CREATE_FAILED',
        CONTACT_ARCHIVED: 'CONTACT_ARCHIVED',
        CONTACT_RESTORED: 'CONTACT_RESTORED',

        CAREER_BREAK_CREATED: 'CAREER_BREAK_CREATED',
        CAREER_BREAK_CREATE_FAILED: 'CAREER_BREAK_CREATE_FAILED',
        CAREER_BREAK_UPDATED: 'CAREER_BREAK_UPDATED',
        CAREER_BREAK_DELETED: 'CAREER_BREAK_DELETED',
        CAREER_BREAK_ARCHIVED: 'CAREER_BREAK_ARCHIVED',
        CAREER_BREAK_RESTORED: 'CAREER_BREAK_RESTORED',

        TEST_SCORE_CREATED: 'TEST_SCORE_CREATED',
        TEST_SCORE_CREATE_FAILED: 'TEST_SCORE_CREATE_FAILED',
        TEST_SCORE_UPDATED: 'TEST_SCORE_UPDATED',
        TEST_SCORE_DELETED: 'TEST_SCORE_DELETED',
        TEST_SCORE_ARCHIVED: 'TEST_SCORE_ARCHIVED',
        TEST_SCORE_RESTORED: 'TEST_SCORE_RESTORED',
        TEST_SCORE_REORDERED: 'TEST_SCORE_REORDERED',
    },

    OAUTH: {
        GITHUB: {
            AUTHORIZATION_URL: 'https://github.com/login/oauth/authorize',
            TOKEN_URL: 'https://github.com/login/oauth/access_token',
            USER_PROFILE_URL: 'https://api.github.com/user',
            USER_EMAIL_URL: 'https://api.github.com/user/emails',
            SCOPE: ['user:email', 'read:user'],
        },
        SESSION_TTL: 7 * 24 * 60 * 60 * 1000, // 7 days
    },

    AUDIT_STATUS: {
        SUCCESS: 'SUCCESS',
        FAILURE: 'FAILURE',
        PENDING: 'PENDING',
        ERROR: 'ERROR',
    } as const,

    AUDIT_SEVERITIES: {
        LOW: 'LOW',
        MEDIUM: 'MEDIUM',
        HIGH: 'HIGH',
        CRITICAL: 'CRITICAL',
    } as const,

    RATE_LIMITS: {
        LOGIN: { max: 5, windowMs: 15 * 60 * 1000, message: 'Too many login attempts' },
        REGISTER: { max: 3, windowMs: 60 * 60 * 1000, message: 'Too many registration attempts' },
        PASSWORD_RESET: { max: 3, windowMs: 60 * 60 * 1000, message: 'Too many password reset attempts' },
        EMAIL_VERIFICATION: { max: 3, windowMs: 3600, retryAfter: 3600, message: 'Too many verification emails' },
        AADHAAR_VERIFICATION: { max: 3, windowMs: 3600, retryAfter: 3600, message: 'Too many Aadhaar verification requests' },
        COMPANY_EMAIL_VERIFICATION: { max: 3, windowMs: 3600, retryAfter: 3600, message: 'Too many company email verification requests' },
        PRIVACY_READ: { max: 100, windowMs: 900000, message: 'Too many privacy read requests' },
        PRIVACY_WRITE: { max: 20, windowMs: 900000, message: 'Too many privacy write requests' },
        BLOCK_OPERATIONS: { max: 10, windowMs: 900000, message: 'Too many block operations' },
        BATCH_OPERATIONS: { max: 5, windowMs: 3600000, message: 'Too many batch operations' },
        CONNECTION_REQUESTS: { max: 50, windowMs: 86400000, message: 'Too many connection requests' },
    },

    CACHE_TTLS: {
        // SESSION: 3600,
        SESSION: 30 * 24 * 60 * 60,
        SESSION_LONG: 2592000,
        TOKEN: 3600,
        TOKEN_BLACKLIST: 30 * 24 * 60 * 60,
        USER: 86400,
        USER_PROFILE: 3600,
        USER_STATS: 600,
        USER_SESSIONS: 300,
        NOTIFICATION: 86400,
        ANALYTICS: 600,
        SEARCH_RESULTS: 300,
        RATE_LIMIT: 900,
        OTP: 600,
        MFA_TRUST: 2592000,
        EMAIL_VERIFICATION_TOKEN: 86400,
        PHONE_VERIFICATION_OTP: 600,
        VERIFICATION_RATE_LIMIT: 3600,
        HEADLINE: 600,              // 10 minutes
        HEADLINE_USER: 300,

        CONTACT: 600,              // 10 minutes
        CONTACT_USER: 300,         // 5 minutes

        CAREER_BREAK: 600,              // 10 minutes
        CAREER_BREAK_USER: 300,         // 5 minutes

        TEST_SCORE: 600,              // 10 minutes
        TEST_SCORE_USER: 300,         // 5 minutes

        USER_DATA: 1800,
        JOB_MATCHES: 3600,
        COMPANY_PAGE: 3600, // 1 hour
        EMPLOYEE_REVIEWS: 1800, // 30 minutes
        COMPANY_CULTURE: 7200, // 2 hours

        company_verification: 604800, // 1 week
        spam_check: 86400, // 1 day
        salary_verification: 86400, // 1 day
        duplicate_check: 3600, // 1 hour
        quality_assessment: 86400, // 1 day

        MATCH_SCORE: 300,
        RECOMMENDED_JOBS: 600,
        RECENT_JOBS: 180,
        EXPIRING_JOBS: 300,
        // USER_PROFILE: 900,
        // ANALYTICS: 1800,
        BATCH_RESULTS: 3600,
        INVITATION_ANALYTICS: 86400, // 24 hours for invitation analytics

        COMPANY_VERIFICATION: 604800, // 1 week
        JOB_SPAM: 86400, // 1 day
        SALARY_VERIFICATION: 86400, // 1 day
        DUPLICATE_APPLICATION: 3600, // 1 hour
        JOB_QUALITY: 86400, // 1 day

        RESUME_OPTIMIZATION: 86400, // 1 day
        // JOB_MATCHES: 3600, // 1 hour
        JOB_ANALYSIS: 7200, // 2 hours
        TOP_APPLICANT_JOBS: 1800, // 30 minutes
        // COMPANY_VERIFICATION: 604800, // 1 week

        //premium
        FOLLOW_UPS: 86400 * 30, // 30 days
        INTERVIEWS: 86400 * 90, // 90 days
        OFFERS: 86400 * 180, // 180 days
        NOTES: 86400 * 365, // 1 year
        TEMPLATES: 86400 * 365, // 1 year
        QUICK_APPLY: 86400 * 30, // 30 days
        SCORING: 86400 * 7, // 7 days
        REFERENCES: 86400 * 365, // 1 year
        PORTFOLIO: 86400 * 365, // 1 year
        THANK_YOU: 86400 * 30, // 30 days
        VIDEO: 86400 * 90, // 90 days

        // professional development
        SKILLS_GAP: 24 * 60 * 60,
        CAREER_PATH: 7 * 24 * 60 * 60,
        ASSESSMENT: 60 * 60,
        ASSESSMENT_RESULTS: 7 * 24 * 60 * 60,
        USER_CERTIFICATIONS: 24 * 60 * 60,
        LINKEDIN_COURSES: 24 * 60 * 60,
        MOCK_INTERVIEWS: 24 * 60 * 60,
        RESUME_REVIEWS: 24 * 60 * 60,
        REVIEW_FEEDBACK: 7 * 24 * 60 * 60,
        COACHING_PLAN: 7 * 24 * 60 * 60,
        SALARY_DATA: 30 * 24 * 60 * 60,
        NEGOTIATION_TIPS: 30 * 24 * 60 * 60,
        MARKET_REPORT: 7 * 24 * 60 * 60,
        INDUSTRY_SKILLS: 7 * 24 * 60 * 60,
        AVAILABLE_COACHES: 60 * 60,

        //notification seting
        // Smart Notification Timing
        NOTIFICATION_TIMING: 7200, // 2 hours
        OPTIMAL_TIME: 86400, // 24 hours
        TIMING_ANALYSIS: 21600, // 6 hours
        USER_ENGAGEMENT_PATTERN: 43200, // 12 hours

        // Do Not Disturb Mode
        DND_STATUS: 3600, // 1 hour
        DND_SCHEDULE: 86400, // 24 hours
        ACTIVE_DND_USERS: 300, // 5 minutes

        // VIP Company Alerts
        VIP_COMPANIES: 3600, // 1 hour
        VIP_ALERTS: 1800, // 30 minutes
        COMPANY_INFO: 21600, // 6 hours

        // Application Deadline Reminders
        DEADLINE_REMINDERS: 3600, // 1 hour
        UPCOMING_DEADLINES: 1800, // 30 minutes
        REMINDER_SCHEDULE: 7200, // 2 hours

        // Profile Visibility Controls
        VISIBILITY_SETTINGS: 7200, // 2 hours
        PROFILE_PRIVACY: 10800, // 3 hours
        RECRUITER_VISIBILITY: 3600, // 1 hour

        // Anonymous Browsing
        ANONYMOUS_SESSION: 1800, // 30 minutes
        ANONYMOUS_USER_MAP: 3600, // 1 hour
        ANONYMOUS_ACTIVITY: 1800, // 30 minutes

        // Job Alert Frequency
        ALERT_FREQUENCY: 7200, // 2 hours
        ALERT_SCHEDULE: 86400, // 24 hours
        FREQUENCY_HISTORY: 604800, // 1 week

        // Email Preferences
        EMAIL_PREFERENCES: 7200, // 2 hours
        EMAIL_SUBSCRIPTIONS: 14400, // 4 hours
        UNSUBSCRIBE_TOKENS: 86400, // 24 hours

        // Data Export
        EXPORT_REQUEST: 3600, // 1 hour
        EXPORT_STATUS: 1800, // 30 minutes
        EXPORT_QUEUE: 300, // 5 minutes

        // Account Security
        SECURITY_SETTINGS: 7200, // 2 hours
        TWO_FA_SETTINGS: 14400, // 4 hours
        LOGIN_ATTEMPTS: 900, // 15 minutes
        SECURITY_TOKENS: 600, // 10 minutes
        ACCOUNT_LOCKS: 1800, // 30 minutes
        APPLICANT_INSIGHTS: 900,

        COMPETITION_LEVEL: 1800,
        JOB_COMPETITION: 18000,
        SALARY_BENCHMARK: 18000,
        INMAIL_CREDITS: 900,
        INTERVIEW_QUESTIONS: 86400,
        INTERVIEW_TIPS: 900,
        INTERVIEW_PREP: 86400,
        PREMIUM_FEATURES: 86400,
        PREMIUM_ANALYTICS: 86400,
        USER_PREFERENCES: 1800,
        USER_NETWORK: 1800,
        APPLICATION_TEMPLATE: 1800,
        APPLICATION_SCORE: 1800,
        FEATURE_USAGE: 1800,
        JOB_LIST: 1800,



    },

    CACHE_KEYS: {
        FOLLOW_UPS: (userId: string) => `followups:${userId}`,
        INTERVIEWS: (userId: string) => `interviews:${userId}`,
        OFFERS: (userId: string) => `offers:${userId}`,
        NOTES: (applicationId: string) => `notes:${applicationId}`,
        TEMPLATES: (userId: string) => `templates:${userId}`,
        QUICK_APPLY: (userId: string) => `quickapply:${userId}`,
        SCORING: (applicationId: string) => `scoring:${applicationId}`,
        REFERENCES: (userId: string) => `references:${userId}`,
        PORTFOLIO: (userId: string) => `portfolio:${userId}`,
        SKILLS_GAP: (userId: string) => `skills_gap:${userId}`,
        CAREER_PATH: (userId: string) => `career_path:${userId}`,
        ASSESSMENT: (assessmentId: string) => `assessment:${assessmentId}`,
        ASSESSMENT_RESULTS: (userId: string, skillId: string) => `assessment_results:${userId}:${skillId}`,
        USER_CERTIFICATIONS: (userId: string) => `certifications:${userId}`,
        LINKEDIN_COURSES: (userId: string) => `linkedin_courses:${userId}`,
        MOCK_INTERVIEWS: (userId: string) => `mock_interviews:${userId}`,
        RESUME_REVIEWS: (userId: string) => `resume_reviews:${userId}`,
        REVIEW_FEEDBACK: (reviewId: string) => `review_feedback:${reviewId}`,
        COACHING_PLAN: (userId: string) => `coaching_plan:${userId}`,
        SALARY_DATA: (jobTitle: string, location: string) => `salary_data:${jobTitle}:${location}`,
        NEGOTIATION_TIPS: (level: string, industry: string) => `negotiation_tips:${level}:${industry}`,
        MARKET_REPORT: (reportId: string) => `market_report:${reportId}`,
        INDUSTRY_SKILLS: (industry: string) => `industry_skills:${industry}`,
        // AVAILABLE_COACHES: 'available_coaches',

        // Smart Notification Timing
        NOTIFICATION_TIMING: (userId: string) => `notification_timing:${userId}`,
        OPTIMAL_TIME: (userId: string) => `optimal_time:${userId}`,
        TIMING_ANALYSIS: (userId: string) => `timing_analysis:${userId}`,
        USER_ENGAGEMENT_PATTERN: (userId: string) => `engagement_pattern:${userId}`,

        // Do Not Disturb Mode
        DND_STATUS: (userId: string) => `dnd_status:${userId}`,
        DND_SCHEDULE: (userId: string) => `dnd_schedule:${userId}`,
        ACTIVE_DND_USERS: 'active_dnd_users',

        // VIP Company Alerts
        VIP_COMPANIES: (userId: string) => `vip_companies:${userId}`,
        VIP_ALERTS: (userId: string) => `vip_alerts:${userId}`,
        COMPANY_INFO: (companyId: string) => `company_info:${companyId}`,

        // Application Deadline Reminders
        DEADLINE_REMINDERS: (userId: string) => `deadline_reminders:${userId}`,
        UPCOMING_DEADLINES: (userId: string) => `upcoming_deadlines:${userId}`,
        REMINDER_SCHEDULE: (userId: string) => `reminder_schedule:${userId}`,

        // Profile Visibility Controls
        VISIBILITY_SETTINGS: (userId: string) => `visibility_settings:${userId}`,
        PROFILE_PRIVACY: (userId: string) => `profile_privacy:${userId}`,
        RECRUITER_VISIBILITY: (userId: string) => `recruiter_visibility:${userId}`,

        // Anonymous Browsing
        ANONYMOUS_SESSION: (sessionId: string) => `anonymous_session:${sessionId}`,
        ANONYMOUS_USER_MAP: (userId: string) => `anonymous_map:${userId}`,
        ANONYMOUS_ACTIVITY: (sessionId: string) => `anonymous_activity:${sessionId}`,

        // Job Alert Frequency
        ALERT_FREQUENCY: (userId: string) => `alert_frequency:${userId}`,
        ALERT_SCHEDULE: (userId: string) => `alert_schedule:${userId}`,
        FREQUENCY_HISTORY: (userId: string) => `frequency_history:${userId}`,

        // Email Preferences
        EMAIL_PREFERENCES: (userId: string) => `email_preferences:${userId}`,
        EMAIL_SUBSCRIPTIONS: (userId: string) => `email_subscriptions:${userId}`,
        UNSUBSCRIBE_TOKENS: (token: string) => `unsubscribe_token:${token}`,

        // Data Export
        EXPORT_REQUEST: (userId: string) => `export_request:${userId}`,
        EXPORT_STATUS: (exportId: string) => `export_status:${exportId}`,
        EXPORT_QUEUE: 'export_queue',

        // Account Security
        SECURITY_SETTINGS: (userId: string) => `security_settings:${userId}`,
        TWO_FA_SETTINGS: (userId: string) => `two_fa_settings:${userId}`,
        LOGIN_ATTEMPTS: (userId: string) => `login_attempts:${userId}`,
        SECURITY_TOKENS: (token: string) => `security_token:${token}`,
        ACCOUNT_LOCKS: (userId: string) => `account_lock:${userId}`,
        APPLICANT_INSIGHTS: (jobId: string) => `applicant_insights:${jobId}`,
        COMPETITION_LEVEL: (jobId: string) => `competition_level:${jobId}`,
        JOB_COMPETITION: (jobId: string) => `job_competition:${jobId}`,
        SALARY_BENCHMARK: (title: string, location: string, experience: string) => `salary_benchmark:${title}:${location}:${experience}`,
        INMAIL_CREDITS: (userId: string) => `inmail_credits:${userId}`,
        INTERVIEW_QUESTIONS: (jobId: string) => `job_competition:${jobId}`,
        INTERVIEW_TIPS: (companyId: string, roleType: string) => `interview_tips:${companyId}:${roleType}`,
        INTERVIEW_PREP: (jobId: string, userId: string) => `interview_prep:${jobId}:${userId}`,
        PREMIUM_FEATURES: (userId: string) => `premium_features:${userId}`,
        PREMIUM_ANALYTICS: (userId: string) => `premium_analytics:${userId}`,
        USER_PREFERENCES: (userId: string) => `user_preference:${userId}`,
        USER_NETWORK: (userId: string) => `user_network:${userId}`,
        VIDEO: (userId: string) => `video:${userId}`,
        APPLICATION_TEMPLATE: (userId: string, templateId: string) => `video:${userId}:${templateId}`,
        APPLICATION_SCORE: (applicantId: string) => `security_settings:${applicantId}`,
        AVAILABLE_COACHES: (userId: string) => `available_coaches:${userId}`,
    },

    CACHE_PREFIXES: {
        USER: 'user:',
        SESSION: 'session:',
        TOKEN: 'token:',
        ACCESS_TOKEN: 'access_token:',
        REFRESH_TOKEN: 'refresh_token:',
        BLACKLIST: 'blacklist:',
        BLACKLIST_ACCESS: 'blacklist:access:',
        BLACKLIST_REFRESH: 'blacklist:refresh:',
        RATE_LIMIT: 'ratelimit:',
        OTP: 'otp:',
        MFA: 'mfa:',

        EMAIL_VERIFY_RATE: 'email_verify_rate:',
        AADHAAR_VERIFY_RATE: 'aadhaar_verify_rate:',
        COMPANY_EMAIL_VERIFY_RATE: 'company_email_verify_rate:',

        HEADLINE: 'headline:',
        HEADLINES_USER: 'headlines:user:',

        CONTACT: 'contact:',
        CONTACTS_USER: 'contacts:user:',

        CAREER_BREAK: 'career-break:',
        CAREER_BREAKS_USER: 'career-breaks:user:',

        TEST_SCORE: 'test-score:',
        TEST_SCORES_USER: 'test-scores:user:',

        PRIVACY_SETTINGS: 'privacy:settings:',
        BLOCKED_USERS: 'privacy:blocked:',
        PRIVACY_ANALYTICS: 'privacy:analytics:',
        CONNECTION_LIST: 'connection:list:',
        MUTUAL_CONNECTIONS: 'mutual:connections:',
    },

    KAFKA_TOPICS: {
        AUDIT: 'audit_events',
        USER: 'user_events',
        NOTIFICATION: 'notification_events',
    },

    CRITICAL_TOPICS: ['audit_events', 'auth_events'],

    SHARD_KEYS: {
        USERS: { userId: 'hashed' },
        SESSIONS: { userId: 'hashed' },
        NOTIFICATIONS: { userId: 'hashed' },
    },

    HTTP_STATUS: {
        // Success responses
        OK: 200,
        CREATED: 201,
        ACCEPTED: 202,
        NO_CONTENT: 204,

        // Redirection messages
        MOVED_PERMANENTLY: 301,
        FOUND: 302,
        NOT_MODIFIED: 304,

        // Client error responses
        BAD_REQUEST: 400,
        UNAUTHORIZED: 401,
        FORBIDDEN: 403,
        NOT_FOUND: 404,
        METHOD_NOT_ALLOWED: 405,
        NOT_ACCEPTABLE: 406,
        CONFLICT: 409,
        GONE: 410,
        PAYLOAD_TOO_LARGE: 413,
        UNPROCESSABLE_ENTITY: 422,
        TOO_MANY_REQUESTS: 429,

        // Server error responses
        INTERNAL_SERVER_ERROR: 500,
        NOT_IMPLEMENTED: 501,
        BAD_GATEWAY: 502,
        SERVICE_UNAVAILABLE: 503,
        GATEWAY_TIMEOUT: 504,
    },

    ERROR_CODES: {
        // Validation Errors (VAL)
        VALIDATION_FAILED: 'VAL_001',
        INVALID_INPUT: 'VAL_002',
        MISSING_REQUIRED_FIELD: 'VAL_003',
        INVALID_FORMAT: 'VAL_004',
        VALIDATION_ERROR: 'VALIDATION_ERROR', // Keep for backward compatibility

        // Rate Limiting Errors (RL)
        RATE_LIMIT_EXCEEDED: 'RL_001',
        TOO_MANY_REQUESTS: 'RL_002',

        // Authentication Errors (AUTH)
        AUTH_FAILED: 'AUTH_001',
        UNAUTHORIZED: 'AUTH_002',
        FORBIDDEN: 'AUTH_003',
        INVALID_TOKEN: 'AUTH_004',
        TOKEN_EXPIRED: 'AUTH_005',
        INSUFFICIENT_PERMISSIONS: 'AUTH_006',
        AUTH_INVALID_CREDENTIALS: 'AUTH_INVALID_CREDENTIALS', // Keep for backward compatibility
        AUTH_TOKEN_EXPIRED: 'AUTH_TOKEN_EXPIRED', // Keep for backward compatibility

        // Privacy Errors (PRIV)
        PRIVACY_VIOLATION: 'PRIV_001',
        ACCESS_RESTRICTED: 'PRIV_002',
        PRIVACY_ERROR: 'PRIV_003',
        PRIVACY_SETTINGS_INVALID: 'PRIV_004',
        PRIVACY_UPDATE_FAILED: 'PRIV_005',

        // Block Errors (BLOCK)
        BLOCK_ERROR: 'BLOCK_001',
        ALREADY_BLOCKED: 'BLOCK_002',
        CANNOT_BLOCK_SELF: 'BLOCK_003',
        BLOCK_NOT_FOUND: 'BLOCK_004',
        BLOCK_LIMIT_EXCEEDED: 'BLOCK_005',
        UNBLOCK_FAILED: 'BLOCK_006',

        // View Errors (VIEW)
        DUPLICATE_VIEW: 'VIEW_001',
        VIEW_NOT_FOUND: 'VIEW_002',
        VIEW_ACCESS_DENIED: 'VIEW_003',

        // Export Errors (EXP)
        EXPORT_FAILED: 'EXP_001',
        EXPORT_TOO_LARGE: 'EXP_002',
        EXPORT_FORMAT_INVALID: 'EXP_003',

        // GDPR/Compliance Errors (GDPR)
        GDPR_COMPLIANCE_ERROR: 'GDPR_001',
        DATA_EXPORT_FAILED: 'GDPR_002',
        DATA_IMPORT_FAILED: 'GDPR_003',
        DATA_DELETION_FAILED: 'GDPR_004',

        // Database Errors (DB)
        DATABASE_ERROR: 'DB_001',
        MONGODB_ERROR: 'DB_002',
        DATABASE_CONNECTION_FAILED: 'DB_003',
        DATABASE_TIMEOUT: 'DB_004',

        // Cache Errors
        CACHE_ERROR: 'CACHE_001',
        CACHE_MISS: 'CACHE_002',
        CACHE_TIMEOUT: 'CACHE_003',
        REDIS_ERROR: 'REDIS_001',
        REDIS_CONNECTION_FAILED: 'REDIS_002',
        // NEO4J_ERROR: 'NEO4J_001',
        // NEO4J_CONNECTION_FAILED: 'NEO4J_002',

        // Service Errors (SRV)
        SERVICE_UNAVAILABLE: 'SRV_001',
        SERVICE_TIMEOUT: 'SRV_002',
        SERVICE_ERROR: 'SRV_003',
        API_TIMEOUT: 'API_001',
        API_ERROR: 'API_002',

        // Circuit Breaker Errors (CB)
        CIRCUIT_OPEN: 'CB_001',
        CIRCUIT_HALF_OPEN: 'CB_002',

        // Connection Errors (CONN)
        CONNECTION_NOT_FOUND: 'CONN_001',
        CONNECTION_ALREADY_EXISTS: 'CONN_002',
        CONNECTION_LIMIT_EXCEEDED: 'CONN_003',
        CONNECTION_BLOCKED: 'CONN_004',
        CONNECTION_PENDING: 'CONN_005',

        // Request Errors (REQ)
        REQUEST_NOT_FOUND: 'REQ_001',
        REQUEST_ALREADY_EXISTS: 'REQ_002',
        INVALID_REQUEST_STATUS: 'REQ_003',
        REQUEST_EXPIRED: 'REQ_004',
        REQUEST_CANCELLED: 'REQ_005',

        // User Errors (USER)
        USER_NOT_FOUND: 'USER_001',
        USER_BLOCKED: 'USER_002',
        USER_INACTIVE: 'USER_003',
        USER_SUSPENDED: 'USER_004',

        // Algorithm Errors (ALG)
        ALGORITHM_ERROR: 'ALG_001',
        PATH_NOT_FOUND: 'ALG_002',
        GRAPH_COMPUTATION_FAILED: 'ALG_003',
        INVALID_ALGORITHM_PARAMS: 'ALG_004',

        // Network Errors (NET)
        NETWORK_ERROR: 'NET_001',
        GRAPH_ERROR: 'NET_002',
        NETWORK_TIMEOUT: 'NET_003',
        CONNECTION_RESET: 'NET_004',

        // Follow System Errors (FOLLOW)
        FOLLOW_ALREADY_EXISTS: 'FOLLOW_001',
        FOLLOW_NOT_FOUND: 'FOLLOW_002',
        CANNOT_FOLLOW_SELF: 'FOLLOW_003',
        FOLLOW_LIMIT_EXCEEDED: 'FOLLOW_004',

        // Batch Operation Errors (BATCH)
        BATCH_LIMIT_EXCEEDED: 'BATCH_001',
        BATCH_OPERATION_FAILED: 'BATCH_002',
        BATCH_PARTIAL_FAILURE: 'BATCH_003',

        // Conflict Errors
        CONFLICT: 'CONF_001',
        DUPLICATE_RECORD: 'CONF_002',
        ALREADY_EXISTS: 'CONF_002',

        // General System Errors
        INTERNAL_ERROR: 'SYS_001',
        CONFIGURATION_ERROR: 'SYS_002',
        RESOURCE_EXHAUSTED: 'SYS_003',
        MAINTENANCE_MODE: 'SYS_004',
        NOT_FOUND: 'SYS_005',
        ACCESS_DENIED: 'SYS_006',
    },

    PAGINATION: {
        DEFAULT_PAGE: 1,
        DEFAULT_LIMIT: 20,
        MAX_LIMIT: 100,
    },

    FILE_UPLOAD: {
        MAX_SIZE: 5 * 1024 * 1024,
        ALLOWED_TYPES: ['image/jpeg', 'image/png'],
    },

    SECURITY: {
        PASSWORD_MIN_LENGTH: 8,
        MAX_LOGIN_ATTEMPTS: 5,
        ACCOUNT_LOCK_DURATION: 30 * 60 * 1000,
    },

    COMPLIANCE: {
        DATA_RETENTION_DAYS: 365,
        GDPR_ENABLED: true,
    },

    MONITORING: {
        METRICS_ENABLED: true,
        HEALTH_CHECK_INTERVAL: 30000,
    },

    // ==================== CONNECTION SERVICE CONSTANTS ====================
    CONNECTION_STATUS: {
        PENDING: 'pending',
        ACCEPTED: 'accepted',
        DECLINED: 'declined',
        BLOCKED: 'blocked',
        REMOVED: 'removed',
        EXPIRED: 'expired',
    } as const,

    PROFILE_VISIBILITY: {
        PUBLIC: 'public',
        CONNECTIONS: 'connections',
        PRIVATE: 'private',
        BLOCKED: 'blocked',
    } as const,

    PRIVACY_SETTINGS: {
        VISIBILITY: ['public', 'private', 'connections'],
        MESSAGE_PERMISSIONS: ['everyone', 'connections', 'nobody'],
        VIEW_PERMISSIONS: ['public', 'connections', 'private'],
        DATA_RETENTION_DAYS: { MIN: 30, MAX: 365, DEFAULT: 90 },
    } as const,

    // Connection Service Specific Constants
    CONNECTION_SERVICE_CONSTANTS: {
        // Pagination
        MAX_PAGINATION_LIMIT: 100,
        DEFAULT_PAGINATION_LIMIT: 10,
        MAX_BATCH_SIZE: 100,
        MAX_METADATA_KEYS: 10,

        // Valid enumeration values
        VALID_SOURCES: ['web', 'mobile', 'api', 'system', 'cron'] as const,
        VALID_PRIVACY_LEVELS: ['public', 'private', 'blocked', 'connections'] as const,
        VALID_INSIGHT_TYPES: ['trends', 'patterns', 'predictions', 'recommendations'] as const,
        VALID_CONNECTION_TYPES: ['professional', 'personal', 'mentor', 'mentee', 'other'] as const,

        // Rate Limiting
        RATE_LIMIT_WINDOW_MS: 15 * 60 * 1000,
        RATE_LIMIT_MAX_REQUESTS: 1000,
        MAX_CONNECTION_REQUESTS_PER_DAY: 50,

        // Regular Expressions
        ID_REGEX: /^[a-zA-Z0-9_-]{10,50}$/,
        ISO_DATE_REGEX: /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2}(\.\d{3})?Z?)?$/,
        MONGODB_ID_REGEX: /^[0-9a-fA-F]{24}$/,

        // Timeouts
        API_TIMEOUT_MS: 5000,
        REDIS_TTL_SECONDS: 3600,
        MAX_RETRY_ATTEMPTS: 3,
        RETRY_DELAY_MS: 1000,
        CONNECTION_TIMEOUT_MS: 30000,

        // Circuit Breaker
        CIRCUIT_BREAKER_THRESHOLD: 5,
        CIRCUIT_BREAKER_RESET_TIMEOUT_MS: 30000,

        // Cache Keys
        CACHE_KEYS: {
            USER_PROFILE: 'user:profile',
            USER_CONNECTIONS: 'user:connections',
            CONNECTION_COUNT: 'user:connection:count',
            MUTUAL_CONNECTIONS: 'mutual:connections',
            PROFILE_VIEWS: 'profile:views',
            SEARCH_RESULTS: 'search:results',
            DEGREE_CALCULATIONS: 'degree:calculations',
            CENTRALITY_MEASURES: 'centrality:measures',
            SHORTEST_PATHS: 'paths:shortest',
            COMMUNITIES: 'graph:communities',
            NETWORK_METRICS: 'network:metrics',
            VISUALIZATION_DATA: 'viz:data',
            ANALYTICS_DATA: 'analytics:data',
            PRIVACY_SETTINGS: 'privacy:settings',
            BLOCKED_USERS: 'privacy:blocked',
            PRIVACY_ANALYTICS: 'privacy:analytics',
        },

        // Default Values
        DEFAULT_VALUES: {
            PAGINATION_LIMIT: 10,
            MAX_PAGINATION_LIMIT: 100,
            CACHE_TTL_SECONDS: 3600,
            CONNECTION_EXPIRY_DAYS: 30,
            MAX_CONNECTIONS_PER_USER: 1000,
            MAX_RETRY_ATTEMPTS: 3,
            REQUEST_TIMEOUT_MS: 30000,
            DEFAULT_PROFILE_VISIBILITY: 'public',
            MAX_BLOCKS_PER_USER: 1000,
            PRIVACY_CACHE_TTL: 1800,
        },
    } as const,
};

export default constants;