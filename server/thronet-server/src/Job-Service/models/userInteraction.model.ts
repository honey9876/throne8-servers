import mongoose, { Schema, Document, Model } from 'mongoose';
import { v4 as uuidv4 } from 'uuid';
import logger from '@/shared/logger.util';
import { cacheHits } from '@/shared/metrics';
import CacheUtil from '@/shared/cache.util';

// ==================== INTERFACES ====================

interface ILocation {
  country?: string;
  region?: string;
  city?: string;
  timezone?: string;
}

interface IPlatform { 
  device: 'desktop' | 'mobile' | 'tablet';
  os?: string;
  browser?: string;
  version?: string;
}

interface ISearchFilters {
  location?: string;
  jobType?: 'full-time' | 'part-time' | 'contract' | 'internship' | 'remote';
  experience?: 'entry' | 'mid' | 'senior' | 'executive';
  salary?: {
    min?: number;
    max?: number;
  };
}

interface IActivityDetails {
  searchQuery?: string;
  searchFilters?: ISearchFilters;
  jobTitle?: string;
  companyName?: string;
  applicationStatus?: 'submitted' | 'in_review' | 'interviewed' | 'rejected' | 'accepted';
  sessionId?: string;
  ipAddress?: string;
  userAgent?: string;
  pageLoadTime?: number;
  timeSpent?: number;
  requestId?: string;
  reviewId?: mongoose.Types.ObjectId;
  rating?: number;
  matchScore?: number;
  companySimilarityScore?: number;
  invitationId?: mongoose.Types.ObjectId;
  deliveryChannels?: string[];
  conversationId?: mongoose.Types.ObjectId;
  recruiterId?: mongoose.Types.ObjectId;
  messageId?: mongoose.Types.ObjectId;
  scheduleId?: mongoose.Types.ObjectId;
  interviewType?: 'phone' | 'video' | 'in-person' | 'other';
  contactId?: mongoose.Types.ObjectId;
  confirmationId?: mongoose.Types.ObjectId;
  notificationId?: string;
  securityEventType?: 'login' | 'password_change' | '2fa_enable' | 'account_lock';
  type?: string;
}

interface IActivity {
  action: string;
  entityType?: 'job' | 'company' | 'search' | 'review' | 'invitation' | 'message' | 'interview' | 'contact' | 'confirmation' | 'notification' | 'privacy' | 'security';
  details?: IActivityDetails;
  jobId?: string;
  searchId?: string;
  companyId?: string;
  location?: ILocation;
  platform?: IPlatform;
  createdAt: Date;
  expiresAt: Date;
}

interface ISearchPattern {
  timeOfDay: number;
  frequency: number;
}

interface ISearchBehavior {
  preferredFilters: string[];
  commonKeywords: string[];
  searchPatterns: ISearchPattern[];
}

interface IViewedJob {
  jobId: string;
  viewedAt: Date;
  timeSpent?: number;
  source?: 'search' | 'trending' | 'network' | 'alumni';
}

interface ISavedJob {
  jobId: string;
  savedAt: Date;
  tags?: string[];
}

interface IAppliedJob {
  jobId: string;
  appliedAt: Date;
  applicationMethod?: 'quick' | 'custom' | 'external';
}

interface IJobInteractions {
  viewedJobs: IViewedJob[];
  savedJobs: ISavedJob[];
  appliedJobs: IAppliedJob[];
}

interface IConnection {
  connectionId: string;
  connectionType: 'friend' | 'colleague' | 'referral';
  name: string;
  email?: string;
  company?: string;
  companyId?: string;
  position?: string;
  canRefer: boolean;
  isActive: boolean;
  connectedAt: Date;
}

interface ITimeSlot {
  enabled: boolean;
  startTime: string;
  endTime: string;
}

interface IEngagementPattern {
  bestHour?: number;
  bestDay?: string;
  avgResponseTime?: number;
  engagementScore?: number;
  lastAnalyzed?: Date;
}

interface ISmartTiming {
  enabled: boolean;
  timezone: string;
  preferredTimes: {
    morning: ITimeSlot;
    afternoon: ITimeSlot;
    evening: ITimeSlot;
  };
  weekdayPreferences: string[];
  smartOptimization: boolean;
  engagementPattern?: IEngagementPattern;
  maxNotificationsPerHour: number;
}

interface IDNDSchedule {
  name?: string;
  days: string[];
  startTime: string;
  endTime: string;
  enabled: boolean;
}

interface IDNDStatus {
  isActive?: boolean;
  activeUntil?: Date;
  reason?: string;
}

interface IDoNotDisturb {
  enabled: boolean;
  schedules: IDNDSchedule[];
  allowEmergencyNotifications: boolean;
  emergencyKeywords: string[];
  vipBypass: boolean;
  currentStatus?: IDNDStatus;
}

interface IVIPCompany {
  companyId: string;
  companyName?: string;
  alertTypes: string[];
  priority: 'high' | 'medium' | 'low';
  instantNotifications: boolean;
  jobRoleFilters: string[];
  locationFilters: string[];
  addedAt: Date;
  lastAlertSent?: Date;
  alertCount: number;
}

interface IQuietHours {
  enabled: boolean;
  startTime: string;
  endTime: string;
}

interface IAlertFrequency {
  globalFrequency: 'instant' | 'hourly' | 'daily' | 'weekly' | 'monthly' | 'disabled';
  categoryFrequencies: {
    newJobs: 'instant' | 'hourly' | 'daily' | 'weekly' | 'disabled';
    jobRecommendations: 'daily' | 'weekly' | 'monthly' | 'disabled';
    applicationUpdates: 'instant' | 'daily' | 'weekly' | 'disabled';
    companyUpdates: 'daily' | 'weekly' | 'monthly' | 'disabled';
    networkActivity: 'daily' | 'weekly' | 'disabled';
    marketInsights: 'weekly' | 'monthly' | 'disabled';
    learningOpportunities: 'weekly' | 'monthly' | 'disabled';
  };
  quietHours: IQuietHours;
  weekendDelivery: boolean;
  maxAlertsPerDay: number;
}

interface IReminderSettings {
  firstReminder: 1 | 2 | 3 | 7 | 14;
  secondReminder: 1 | 2 | 3;
  finalReminder: 1 | 6 | 12 | 24;
  customMessage?: string;
}

interface IReminderSent {
  sentAt: Date;
  type: string;
  channel: string;
  success: boolean;
}

interface IDeadlineReminder {
  reminderId: string;
  jobId?: string;
  jobTitle?: string;
  companyName?: string;
  applicationDeadline?: Date;
  reminderSettings: IReminderSettings;
  priority: 'high' | 'medium' | 'low';
  notificationChannels: ('push' | 'email' | 'sms')[];
  status: 'active' | 'completed' | 'expired' | 'cancelled';
  remindersSent: IReminderSent[];
  createdAt: Date;
}

interface INotificationSettings {
  smartTiming: ISmartTiming;
  doNotDisturb: IDoNotDisturb;
  vipCompanies: IVIPCompany[];
  alertFrequency: IAlertFrequency;
  deadlineReminders: IDeadlineReminder[];
}

interface IVisibleFields {
  email: boolean;
  phone: boolean;
  currentSalary: boolean;
  workHistory: boolean;
  education: boolean;
  skills: boolean;
  certifications: boolean;
  portfolio: boolean;
}

interface IProfileVisibility {
  profileVisibility: 'public' | 'private' | 'network_only' | 'recruiters_only';
  searchableByRecruiters: boolean;
  showInCompanySearch: boolean;
  allowDirectMessages: boolean;
  showActivityStatus: boolean;
  hideFromCurrentEmployer: boolean;
  currentEmployerDomains: string[];
  blockedCompanies: string[];
  visibleFields: IVisibleFields;
  lastUpdated?: Date;
}

interface IAnonymousSession {
  sessionId?: string;
  startTime?: Date;
  expiresAt?: Date;
  isActive?: boolean;
}

interface ITrackingPreferences {
  saveSearchHistory: boolean;
  saveViewHistory: boolean;
  allowAnalytics: boolean;
}

interface ISessionHistory {
  sessionId: string;
  startTime: Date;
  endTime: Date;
  duration?: number;
  activitiesCount?: number;
}

interface IAnonymousBrowsing {
  enabled: boolean;
  currentSession?: IAnonymousSession;
  sessionDuration: number;
  trackingPreferences: ITrackingPreferences;
  autoExpire: boolean;
  sessionsHistory: ISessionHistory[];
}

interface IEmailSubscriptions {
  jobAlerts: boolean;
  applicationUpdates: boolean;
  companyNews: boolean;
  weeklyDigest: boolean;
  monthlyReport: boolean;
  marketingEmails: boolean;
  partnerOffers: boolean;
  surveyInvitations: boolean;
  productUpdates: boolean;
  securityAlerts: boolean;
}

interface IEmailFrequency {
  immediate: string[];
  daily: string[];
  weekly: string[];
  monthly: string[];
}

interface IUnsubscribeToken {
  token: string;
  category: string;
  createdAt: Date;
  expiresAt: Date;
}

interface IBounceHistory {
  timestamp: Date;
  reason: string;
  type: string;
}

interface IEmailPreferences {
  emailAddress?: string;
  globalEmailEnabled: boolean;
  subscriptions: IEmailSubscriptions;
  emailFormat: 'html' | 'text' | 'both';
  frequency: IEmailFrequency;
  unsubscribeTokens: IUnsubscribeToken[];
  bounceHistory: IBounceHistory[];
  lastEmailSent?: Date;
  emailVerified: boolean;
}

interface IPasswordHistory {
  hash: string;
  changedAt: Date;
}

interface IBackupCode {
  code: string;
  used: boolean;
  usedAt?: Date;
}

interface ITwoFactorAuth {
  enabled: boolean;
  method?: 'sms' | 'email' | 'authenticator';
  phoneNumber?: string;
  secret?: string;
  backupCodes: IBackupCode[];
  enabledAt?: Date;
  lastUsed?: Date;
}

interface ITrustedDevice {
  deviceId: string;
  deviceName?: string;
  platform?: string;
  browser?: string;
  ipAddress?: string;
  location?: string;
  trustGrantedAt: Date;
  lastUsed?: Date;
  isActive: boolean;
}

interface ISecurityEvent {
  eventType: 'login' | 'password_change' | '2fa_enable' | 'account_lock';
  timestamp: Date;
  ipAddress?: string;
  userAgent?: string;
  location?: string;
  success: boolean;
  details?: any;
  expiresAt: Date;
}

interface IAccountLock {
  reason?: string;
  lockedAt: Date;
  lockDuration?: number;
  unlockAt?: Date;
  isActive: boolean;
}

interface IAccountSecurity {
  passwordLastChanged?: Date;
  passwordHistory: IPasswordHistory[];
  twoFactorAuth: ITwoFactorAuth;
  loginNotifications: boolean;
  sessionTimeout: number;
  allowMultipleSessions: boolean;
  ipWhitelist: string[];
  deviceTrust: boolean;
  trustedDevices: ITrustedDevice[];
  securityEvents: ISecurityEvent[];
  accountLocks: IAccountLock[];
}

interface IPrivacySecurity {
  profileVisibility: IProfileVisibility;
  anonymousBrowsing: IAnonymousBrowsing;
  emailPreferences: IEmailPreferences;
  accountSecurity: IAccountSecurity;
}

export interface IUserInteraction extends Document {
  userId: string;
  isAnonymous: boolean;
  activities: IActivity[];
  searchBehavior: ISearchBehavior;
  jobInteractions: IJobInteractions;
  connections: IConnection[];
  notificationSettings: INotificationSettings;
  privacySecurity: IPrivacySecurity;
  engagementScore: number;
  lastActiveAt: Date;
  createdAtMonth: string;
  isActive: boolean;
  isDeleted: boolean;
  updatedAt?: Date;
}

// ==================== CONSTANTS ====================

const TTL_CONFIG = {
  USER_INTERACTION: 2 * 365 * 24 * 60 * 60, // 2 years in seconds
  ANONYMOUS_SESSION: 7 * 24 * 60 * 60, // 7 days
  SECURITY_EVENT: 90 * 24 * 60 * 60, // 90 days
} as const;

const validUUIDRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const ACTION_TYPES = [
  'search', 'view_job', 'apply_job', 'save_job', 'unsave_job', 'update_profile',
  'login', 'logout', 'register', 'share_job', 'filter_search', 'bookmark_company',
  'view_company', 'other', 'COMPANY_PAGE_VIEW', 'EMPLOYEE_REVIEW_SUBMITTED',
  'CULTURE_INFO_VIEW', 'MATCH_CALCULATION', 'INVITATION_SENT', 'IN_APP_MESSAGE_SENT',
  'INTERVIEW_SCHEDULED', 'RECRUITER_CONTACT_INITIATED', 'INTERVIEW_CONFIRMED',
  'NOTIFICATION_SENT', 'NOTIFICATION_CLICKED', 'PRIVACY_UPDATED', 'SECURITY_EVENT',
] as const;

// ==================== SCHEMA ====================

const userInteractionSchema = new Schema<IUserInteraction>(
  {
    userId: {
      type: String,
      required: true,
      unique: true,
      validate: {
        validator: (v: string) => validUUIDRegex.test(v),
        message: 'Invalid userId UUID',
      },
    },
    isAnonymous: {
      type: Boolean,
      default: false,
    },
    activities: [{
      action: {
        type: String,
        required: true,
        enum: ACTION_TYPES,
        default: 'other',
      },
      entityType: {
        type: String,
        enum: ['job', 'company', 'search', 'review', 'invitation', 'message', 'interview', 'contact', 'confirmation', 'notification', 'privacy', 'security'],
      },
      details: {
        searchQuery: { type: String, maxlength: 500, trim: true },
        searchFilters: {
          location: { type: String, maxlength: 100, trim: true },
          jobType: { type: String, enum: ['full-time', 'part-time', 'contract', 'internship', 'remote'] },
          experience: { type: String, enum: ['entry', 'mid', 'senior', 'executive'] },
          salary: { min: { type: Number, min: 0 }, max: { type: Number, min: 0 } },
        },
        jobTitle: { type: String, maxlength: 200, trim: true },
        companyName: { type: String, maxlength: 100, trim: true },
        applicationStatus: { type: String, enum: ['submitted', 'in_review', 'interviewed', 'rejected', 'accepted'] },
        sessionId: { type: String, maxlength: 36, trim: true },
        ipAddress: { type: String, maxlength: 45 },
        userAgent: { type: String, maxlength: 500, trim: true },
        pageLoadTime: { type: Number, min: 0 },
        timeSpent: { type: Number, min: 0 },
        requestId: { type: String, maxlength: 36, trim: true },
        reviewId: { type: Schema.Types.ObjectId, ref: 'Review', index: { sparse: true } },
        rating: { type: Number, min: 0, max: 5 },
        matchScore: { type: Number, min: 0, max: 100 },
        companySimilarityScore: { type: Number, min: 0, max: 100 },
        invitationId: { type: Schema.Types.ObjectId, ref: 'Invitation', index: { sparse: true } },
        deliveryChannels: { type: [String], default: [] },
        conversationId: { type: Schema.Types.ObjectId, ref: 'Conversation', index: { sparse: true } },
        recruiterId: { type: Schema.Types.ObjectId, ref: 'Recruiter', index: { sparse: true } },
        messageId: { type: Schema.Types.ObjectId, ref: 'Message', index: { sparse: true } },
        scheduleId: { type: Schema.Types.ObjectId, ref: 'Schedule', index: { sparse: true } },
        interviewType: { type: String, enum: ['phone', 'video', 'in-person', 'other'] },
        contactId: { type: Schema.Types.ObjectId, ref: 'Contact', index: { sparse: true } },
        confirmationId: { type: Schema.Types.ObjectId, ref: 'Confirmation', index: { sparse: true } },
        notificationId: { type: String, validate: validUUIDRegex },
        securityEventType: { type: String, enum: ['login', 'password_change', '2fa_enable', 'account_lock'] },
        type: { type: String, maxlength: 50, trim: true },
      },
      jobId: { type: String, validate: validUUIDRegex, ref: 'Job' },
      searchId: { type: String, validate: validUUIDRegex, ref: 'Search' },
      companyId: { type: String, validate: validUUIDRegex, ref: 'Company' },
      location: {
        country: { type: String, maxlength: 2, uppercase: true },
        region: { type: String, maxlength: 100, trim: true },
        city: { type: String, maxlength: 100, trim: true },
        timezone: { type: String, maxlength: 50, trim: true },
      },
      platform: {
        device: { type: String, enum: ['desktop', 'mobile', 'tablet'], default: 'desktop' },
        os: { type: String, maxlength: 50, trim: true },
        browser: { type: String, maxlength: 50, trim: true },
        version: { type: String, maxlength: 20, trim: true },
      },
      createdAt: { type: Date, default: Date.now },
      expiresAt: { type: Date, default: () => new Date(Date.now() + TTL_CONFIG.USER_INTERACTION * 1000) },
    }],
    searchBehavior: {
      preferredFilters: [{ type: String, maxlength: 50 }],
      commonKeywords: [{ type: String, maxlength: 50 }],
      searchPatterns: [{ timeOfDay: { type: Number, min: 0, max: 23 }, frequency: { type: Number, default: 0 }, _id: false }],
    },
    jobInteractions: {
      viewedJobs: [{ jobId: { type: String, validate: validUUIDRegex }, viewedAt: Date, timeSpent: { type: Number, min: 0 }, source: { type: String, enum: ['search', 'trending', 'network', 'alumni'] }, _id: false }],
      savedJobs: [{ jobId: { type: String, validate: validUUIDRegex }, savedAt: Date, tags: [{ type: String, maxlength: 50 }], _id: false }],
      appliedJobs: [{ jobId: { type: String, validate: validUUIDRegex }, appliedAt: Date, applicationMethod: { type: String, enum: ['quick', 'custom', 'external'] }, _id: false }],
    },
    connections: [{
      connectionId: { type: String, default: uuidv4, validate: validUUIDRegex },
      connectionType: { type: String, enum: ['friend', 'colleague', 'referral'], required: true },
      name: { type: String, maxlength: 100, required: true },
      email: { type: String, maxlength: 100 },
      company: { type: String, maxlength: 100 },
      companyId: { type: String, validate: { validator: (v: string) => !v || validUUIDRegex.test(v), message: 'Invalid companyId UUID' } },
      position: { type: String, maxlength: 100 },
      canRefer: { type: Boolean, default: false },
      isActive: { type: Boolean, default: true },
      connectedAt: { type: Date, default: Date.now },
    }],
    notificationSettings: {
      smartTiming: {
        enabled: { type: Boolean, default: true },
        timezone: { type: String, default: 'UTC' },
        preferredTimes: {
          morning: { enabled: { type: Boolean, default: true }, startTime: { type: String, default: '09:00' }, endTime: { type: String, default: '11:00' } },
          afternoon: { enabled: { type: Boolean, default: true }, startTime: { type: String, default: '13:00' }, endTime: { type: String, default: '15:00' } },
          evening: { enabled: { type: Boolean, default: false }, startTime: { type: String, default: '18:00' }, endTime: { type: String, default: '20:00' } },
        },
        weekdayPreferences: [{ type: String, enum: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'] }],
        smartOptimization: { type: Boolean, default: true },
        engagementPattern: {
          bestHour: Number,
          bestDay: String,
          avgResponseTime: Number,
          engagementScore: Number,
          lastAnalyzed: Date,
        },
        maxNotificationsPerHour: { type: Number, default: 3, min: 1, max: 10 },
      },
      doNotDisturb: {
        enabled: { type: Boolean, default: false },
        schedules: [{ name: String, days: [{ type: String, enum: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'] }], startTime: String, endTime: String, enabled: { type: Boolean, default: true } }],
        allowEmergencyNotifications: { type: Boolean, default: false },
        emergencyKeywords: [String],
        vipBypass: { type: Boolean, default: false },
        currentStatus: { isActive: Boolean, activeUntil: Date, reason: String },
      },
      vipCompanies: [{
        companyId: { type: String, validate: validUUIDRegex },
        companyName: String,
        alertTypes: [{ type: String, enum: ['new_jobs', 'company_news', 'hiring_events', 'salary_updates', 'culture_updates'] }],
        priority: { type: String, enum: ['high', 'medium', 'low'], default: 'high' },
        instantNotifications: { type: Boolean, default: true },
        jobRoleFilters: [String],
        locationFilters: [String],
        addedAt: { type: Date, default: Date.now },
        lastAlertSent: Date,
        alertCount: { type: Number, default: 0 },
      }],
      alertFrequency: {
        globalFrequency: { type: String, enum: ['instant', 'hourly', 'daily', 'weekly', 'monthly', 'disabled'], default: 'daily' },
        categoryFrequencies: {
          newJobs: { type: String, enum: ['instant', 'hourly', 'daily', 'weekly', 'disabled'], default: 'daily' },
          jobRecommendations: { type: String, enum: ['daily', 'weekly', 'monthly', 'disabled'], default: 'weekly' },
          applicationUpdates: { type: String, enum: ['instant', 'daily', 'weekly', 'disabled'], default: 'instant' },
          companyUpdates: { type: String, enum: ['daily', 'weekly', 'monthly', 'disabled'], default: 'weekly' },
          networkActivity: { type: String, enum: ['daily', 'weekly', 'disabled'], default: 'weekly' },
          marketInsights: { type: String, enum: ['weekly', 'monthly', 'disabled'], default: 'monthly' },
          learningOpportunities: { type: String, enum: ['weekly', 'monthly', 'disabled'], default: 'monthly' },
        },
        quietHours: {
          enabled: { type: Boolean, default: true },
          startTime: { type: String, default: '22:00' },
          endTime: { type: String, default: '08:00' },
        },
        weekendDelivery: { type: Boolean, default: false },
        maxAlertsPerDay: { type: Number, default: 10, min: 1, max: 50 },
      },
      deadlineReminders: [{
        reminderId: { type: String, default: uuidv4, validate: validUUIDRegex },
        jobId: { type: String, validate: validUUIDRegex },
        jobTitle: String,
        companyName: String,
        applicationDeadline: Date,
        reminderSettings: {
          firstReminder: { type: Number, enum: [1, 2, 3, 7, 14], default: 7 },
          secondReminder: { type: Number, enum: [1, 2, 3], default: 2 },
          finalReminder: { type: Number, enum: [1, 6, 12, 24], default: 24 },
          customMessage: String,
        },
        priority: { type: String, enum: ['high', 'medium', 'low'], default: 'medium' },
        notificationChannels: [{ type: String, enum: ['push', 'email', 'sms'] }],
        status: { type: String, enum: ['active', 'completed', 'expired', 'cancelled'], default: 'active' },
        remindersSent: [{ sentAt: Date, type: String, channel: String, success: Boolean }],
        createdAt: { type: Date, default: Date.now },
      }],
    },
    privacySecurity: {
      profileVisibility: {
        profileVisibility: { type: String, enum: ['public', 'private', 'network_only', 'recruiters_only'], default: 'public' },
        searchableByRecruiters: { type: Boolean, default: true },
        showInCompanySearch: { type: Boolean, default: true },
        allowDirectMessages: { type: Boolean, default: true },
        showActivityStatus: { type: Boolean, default: false },
        hideFromCurrentEmployer: { type: Boolean, default: false },
        currentEmployerDomains: [String],
        blockedCompanies: [String],
        visibleFields: {
          email: { type: Boolean, default: false },
          phone: { type: Boolean, default: false },
          currentSalary: { type: Boolean, default: false },
          workHistory: { type: Boolean, default: true },
          education: { type: Boolean, default: true },
          skills: { type: Boolean, default: true },
          certifications: { type: Boolean, default: true },
          portfolio: { type: Boolean, default: true },
        },
        lastUpdated: Date,
      },
      anonymousBrowsing: {
        enabled: { type: Boolean, default: false },
        currentSession: {
          sessionId: { type: String, validate: validUUIDRegex },
          startTime: Date,
          expiresAt: { type: Date, default: () => new Date(Date.now() + TTL_CONFIG.ANONYMOUS_SESSION * 1000) },
          isActive: Boolean,
        },
        sessionDuration: { type: Number, default: 60, min: 15, max: 480 },
        trackingPreferences: {
          saveSearchHistory: { type: Boolean, default: false },
          saveViewHistory: { type: Boolean, default: false },
          allowAnalytics: { type: Boolean, default: false },
        },
        autoExpire: { type: Boolean, default: true },
        sessionsHistory: [{
          sessionId: { type: String, validate: validUUIDRegex },
          startTime: Date,
          endTime: Date,
          duration: Number,
          activitiesCount: Number,
        }],
      },
      emailPreferences: {
        emailAddress: String,
        globalEmailEnabled: { type: Boolean, default: true },
        subscriptions: {
          jobAlerts: { type: Boolean, default: true },
          applicationUpdates: { type: Boolean, default: true },
          companyNews: { type: Boolean, default: true },
          weeklyDigest: { type: Boolean, default: true },
          monthlyReport: { type: Boolean, default: true },
          marketingEmails: { type: Boolean, default: false },
          partnerOffers: { type: Boolean, default: false },
          surveyInvitations: { type: Boolean, default: false },
          productUpdates: { type: Boolean, default: true },
          securityAlerts: { type: Boolean, default: true },
        },
        emailFormat: { type: String, enum: ['html', 'text', 'both'], default: 'html' },
        frequency: {
          immediate: [String],
          daily: [String],
          weekly: [String],
          monthly: [String],
        },
        unsubscribeTokens: [{ token: String, category: String, createdAt: Date, expiresAt: Date }],
        bounceHistory: [{ timestamp: Date, reason: String, type: String }],
        lastEmailSent: Date,
        emailVerified: { type: Boolean, default: false },
      },
      accountSecurity: {
        passwordLastChanged: Date,



// Continuation of userInteractionSchema...
        passwordHistory: [{ hash: String, changedAt: Date }],
        twoFactorAuth: {
          enabled: { type: Boolean, default: false },
          method: { type: String, enum: ['sms', 'email', 'authenticator'] },
          phoneNumber: String,
          secret: String,
          backupCodes: [{ code: String, used: Boolean, usedAt: Date }],
          enabledAt: Date,
          lastUsed: Date,
        },
        loginNotifications: { type: Boolean, default: true },
        sessionTimeout: { type: Number, default: 480, min: 15, max: 1440 },
        allowMultipleSessions: { type: Boolean, default: true },
        ipWhitelist: [String],
        deviceTrust: { type: Boolean, default: true },
        trustedDevices: [{
          deviceId: { type: String, validate: validUUIDRegex },
          deviceName: String,
          platform: String,
          browser: String,
          ipAddress: String,
          location: String,
          trustGrantedAt: Date,
          lastUsed: Date,
          isActive: Boolean,
        }],
        securityEvents: [{
          eventType: { type: String, enum: ['login', 'password_change', '2fa_enable', 'account_lock'] },
          timestamp: Date,
          ipAddress: String,
          userAgent: String,
          location: String,
          success: Boolean,
          details: Schema.Types.Mixed,
          expiresAt: { type: Date, default: () => new Date(Date.now() + TTL_CONFIG.SECURITY_EVENT * 1000) },
        }],
        accountLocks: [{
          reason: String,
          lockedAt: Date,
          lockDuration: Number,
          unlockAt: Date,
          isActive: Boolean,
        }],
      },
    },
    engagementScore: { type: Number, default: 0 },
    lastActiveAt: { type: Date, default: Date.now },
    createdAtMonth: {
      type: String,
      default: () => {
        const date = new Date();
        return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      },
    },
    isActive: { type: Boolean, default: true },
    isDeleted: { type: Boolean, default: false },
  },
  {
    collection: 'user_interactions',
    timestamps: { updatedAt: 'updatedAt' },
    versionKey: false,
    minimize: false,
    strict: true,
    collation: { locale: 'en', strength: 1 },
  }
);

// ==================== INDEXES ====================
userInteractionSchema.index({ userId: 1, 'activities.createdAt': -1 });
userInteractionSchema.index({ 'activities.jobId': 1, 'activities.action': 1 });
userInteractionSchema.index({ 'activities.companyId': 1, 'activities.action': 1 });
userInteractionSchema.index({ createdAtMonth: 1, 'activities.action': 1 });
userInteractionSchema.index({ 'activities.location.country': 1, 'activities.action': 1 });
userInteractionSchema.index({ 'activities.platform.device': 1, 'activities.action': 1 });
userInteractionSchema.index({ 'connections.companyId': 1 });
userInteractionSchema.index({ 'notificationSettings.vipCompanies.companyId': 1 });
userInteractionSchema.index({ 'notificationSettings.deadlineReminders.applicationDeadline': 1 });
userInteractionSchema.index({ 'notificationSettings.deadlineReminders.status': 1 });
userInteractionSchema.index({ 'privacySecurity.anonymousBrowsing.currentSession.sessionId': 1 });
userInteractionSchema.index({ 'privacySecurity.accountSecurity.securityEvents.timestamp': -1 });
userInteractionSchema.index({ 'privacySecurity.accountSecurity.trustedDevices.deviceId': 1 });
userInteractionSchema.index({ 'activities.details.searchQuery': 'text', 'activities.details.jobTitle': 'text', 'activities.details.companyName': 'text' }, { name: 'interaction_text_index' });
userInteractionSchema.index({ userId: 1, isActive: 1 }, { partialFilterExpression: { isActive: true } });
userInteractionSchema.index({ 'activities.entityType': 1, 'activities.action': 1 });
userInteractionSchema.index({ 'activities.details.reviewId': 1, 'activities.action': 1 }, { sparse: true });
userInteractionSchema.index({ 'activities.details.invitationId': 1, 'activities.action': 1 }, { sparse: true });
userInteractionSchema.index({ 'activities.details.scheduleId': 1, 'activities.action': 1 }, { sparse: true });
userInteractionSchema.index({ 'activities.expiresAt': 1 }, { expireAfterSeconds: 0 });
userInteractionSchema.index({ 'privacySecurity.anonymousBrowsing.currentSession.expiresAt': 1 }, { expireAfterSeconds: 0 });
userInteractionSchema.index({ 'privacySecurity.accountSecurity.securityEvents.expiresAt': 1 }, { expireAfterSeconds: 0 });

// ==================== PRE-SAVE MIDDLEWARE ====================
userInteractionSchema.pre('save', async function (next) {
  try {
    this.updatedAt = new Date();
    
    if (!this.createdAtMonth) {
      const date = new Date();
      this.createdAtMonth = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    }
    
    if (!this.userId) {
      this.isAnonymous = true;
    }
    
    for (const activity of this.activities) {
      if (activity.action === 'search' && !activity.details?.searchQuery) {
        return next(new Error('Search action requires searchQuery in details'));
      }
      if (!activity.createdAt) activity.createdAt = new Date();
    }
    
    // Removed Kafka event emission
    // Analytics can be handled through direct database queries or batch processing
    
    next();
  } catch (error : any) {
    logger.error('UserInteraction pre-save error:', error);
    next(error as Error);
  }
});

// ==================== STATIC METHODS ====================
interface IUserInteractionModel extends Model<IUserInteraction> {
  findUserRecentActivities(userId: string, limit?: number): Promise<any>;
  getUserActionCount(userId: string, action: string, days?: number): Promise<number>;
  getPopularJobs(days?: number, limit?: number): Promise<any[]>;
  checkActivityExists(userId: string, action: string, entityType: string): Promise<boolean>;
  getNetworkCompanies(userId: string): Promise<string[]>;
  getNotificationSettings(userId: string): Promise<any>;
  getActiveDeadlineReminders(userId: string, limit?: number): Promise<any>;
  getPrivacySecuritySettings(userId: string): Promise<any>;
  getSecurityEvents(userId: string, limit?: number): Promise<any>;
}

userInteractionSchema.statics.findUserRecentActivities = async function (
  userId: string,
  limit: number = 50
) {
  return this.findOne({ userId, isActive: true })
    .select('activities searchBehavior jobInteractions connections notificationSettings privacySecurity engagementScore lastActiveAt')
    .slice('activities', limit)
    .lean();
};

userInteractionSchema.statics.getUserActionCount = async function (
  userId: string,
  action: string,
  days: number = 30
) {
  const fromDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const result = await this.aggregate([
    { $match: { userId, isActive: true } },
    { $unwind: '$activities' },
    { $match: { 'activities.action': action, 'activities.createdAt': { $gte: fromDate } } },
    { $count: 'count' },
  ]);
  return result[0]?.count || 0;
};

userInteractionSchema.statics.getPopularJobs = async function (
  days: number = 7,
  limit: number = 20
) {
  const fromDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  return this.aggregate([
    { $match: { isActive: true } },
    { $unwind: '$activities' },
    {
      $match: {
        'activities.action': { $in: ['view_job', 'apply_job', 'save_job'] },
        'activities.jobId': { $exists: true, $ne: null },
        'activities.createdAt': { $gte: fromDate },
      },
    },
    {
      $group: {
        _id: '$activities.jobId',
        viewCount: { $sum: { $cond: [{ $eq: ['$activities.action', 'view_job'] }, 1, 0] } },
        applyCount: { $sum: { $cond: [{ $eq: ['$activities.action', 'apply_job'] }, 1, 0] } },
        saveCount: { $sum: { $cond: [{ $eq: ['$activities.action', 'save_job'] }, 1, 0] } },
        totalInteractions: { $sum: 1 },
        uniqueUsers: { $addToSet: '$userId' },
        lastActivity: { $max: '$activities.createdAt' },
      },
    },
    { $sort: { totalInteractions: -1 } },
    { $limit: limit },
  ]);
};

userInteractionSchema.statics.checkActivityExists = async function (
  userId: string,
  action: string,
  entityType: string
) {
  const result = await this.exists({
    userId,
    'activities.action': action,
    'activities.entityType': entityType,
    isActive: true,
  });
  return !!result;
};

userInteractionSchema.statics.getNetworkCompanies = async function (userId: string) {
  const doc = await this.findOne({ userId, isActive: true }).select('connections').lean();
  return doc
    ? doc.connections
        .filter((c: IConnection) => c.isActive && c.companyId)
        .map((c: IConnection) => c.companyId)
    : [];
};

userInteractionSchema.statics.getNotificationSettings = async function (userId: string) {
  return this.findOne({ userId, isActive: true }).select('notificationSettings').lean();
};

userInteractionSchema.statics.getActiveDeadlineReminders = async function (
  userId: string,
  limit: number = 20
) {
  return this.findOne({ userId, isActive: true })
    .select('notificationSettings.deadlineReminders')
    .slice('notificationSettings.deadlineReminders', limit)
    .where('notificationSettings.deadlineReminders.status')
    .equals('active')
    .lean();
};

userInteractionSchema.statics.getPrivacySecuritySettings = async function (userId: string) {
  return this.findOne({ userId, isActive: true }).select('privacySecurity').lean();
};

userInteractionSchema.statics.getSecurityEvents = async function (
  userId: string,
  limit: number = 20
) {
  return this.findOne({ userId, isActive: true })
    .select('privacySecurity.accountSecurity.securityEvents')
    .slice('privacySecurity.accountSecurity.securityEvents', limit)
    .sort({ 'privacySecurity.accountSecurity.securityEvents.timestamp': -1 })
    .lean();
};

// ==================== CACHE MANAGER ====================
export class CacheManager {
  /**
   * Multi-level cache retrieval (hot -> warm -> cold)
   * Optimized for 1M+ users with tiered caching
   */
  static async getMultiLevel<T>(key: string, userId: string | null = null): Promise<T | null> {
    const userKey = userId ? `${key}:${userId}` : key;
    
    try {
      // Hot cache - 30 seconds
      let result = await CacheUtil.get(`hot:${userKey}`);
      if (result) {
        cacheHits.inc({ cache_type: 'hot' });
        return JSON.parse(result) as T;
      }
      
      // Warm cache - 5 minutes
      result = await CacheUtil.get(`warm:${userKey}`);
      if (result) {
        cacheHits.inc({ cache_type: 'warm' });
        // Promote to hot cache
        await CacheUtil.set(`hot:${userKey}`, result, 30);
        return JSON.parse(result) as T;
      }
      
      // Cold cache - 30 minutes
      result = await CacheUtil.get(`cold:${key}`);
      if (result) {
        cacheHits.inc({ cache_type: 'cold' });
        return JSON.parse(result) as T;
      }
    } catch (error : any) {
      logger.error('Cache get error:', error);
    }
    
    return null;
  }

  /**
   * Multi-level cache storage
   * Optimized for 1M+ users with automatic tier distribution
   */
  static async setMultiLevel(
    key: string,
    data: any,
    userId: string | null = null
  ): Promise<void> {
    const userKey = userId ? `${key}:${userId}` : key;
    const dataStr = JSON.stringify(data);
    
    try {
      await Promise.all([
        CacheUtil.set(`hot:${userKey}`, dataStr, 30), // 30 seconds
        CacheUtil.set(`warm:${userKey}`, dataStr, 300), // 5 minutes
        CacheUtil.set(`cold:${key}`, dataStr, 1800), // 30 minutes
      ]);
    } catch (error : any) {
      logger.error('Cache set error:', error);
    }
  }

  /**
   * Batch cache retrieval for multiple users
   * Optimized for bulk operations
   */
  static async batchGet<T>(key: string, userIds: string[]): Promise<Map<string, T>> {
    const results = new Map<string, T>();
    
    try {
      const pipeline = CacheUtil.pipeline();
      userIds.forEach((userId) => {
        pipeline.get(`hot:${key}:${userId}`);
      });
      
      const responses = await pipeline.exec();
      
      if (responses) {
        responses.forEach((response: any, index: any) => {
          if (response && response[1]) {
            results.set(userIds[index], JSON.parse(response[1] as string));
          }
        });
      }
    } catch (error : any) {
      logger.error('Batch cache get error:', error);
    }
    
    return results;
  }

  /**
   * Invalidate cache for a specific user
   */
  static async invalidate(key: string, userId: string | null = null): Promise<void> {
    const userKey = userId ? `${key}:${userId}` : key;
    
    try {
      await Promise.all([
        CacheUtil.del(`hot:${userKey}`),
        CacheUtil.del(`warm:${userKey}`),
        CacheUtil.del(`cold:${key}`),
      ]);
    } catch (error : any) {
      logger.error('Cache invalidation error:', error);
    }
  }

  /**
   * Batch cache invalidation
   */
  static async batchInvalidate(key: string, userIds: string[]): Promise<void> {
    try {
      const pipeline = CacheUtil.pipeline();
      
      userIds.forEach((userId) => {
        pipeline.del(`hot:${key}:${userId}`);
        pipeline.del(`warm:${key}:${userId}`);
      });
      
      await pipeline.exec();
    } catch (error : any) {
      logger.error('Batch cache invalidation error:', error);
    }
  }
}

// ==================== MODEL EXPORT ====================
const UserInteractionModel = mongoose.model<IUserInteraction, IUserInteractionModel>(
  'UserInteraction',
  userInteractionSchema
);

export default UserInteractionModel;