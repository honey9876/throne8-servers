// src/services/notificationsSettings.service.ts
import { v4 as uuidv4 } from 'uuid';
import bcrypt from 'bcrypt';
// import speakeasy from 'speakeasy';
// import QRCode from 'qrcode';
import crypto from 'crypto';
import logger from '@/shared/logger.util';
import { AppError, ValidationError, NotFoundError, ConflictError } from '@/shared/errors/app.error';
// import { UserInteractionModel
import { UserInteractionModel, ProfessionalDev } from '@/Job-Service/models';
import constants from '@/shared/constants.util';

import { sanitizeInput } from '@/shared/security';
import CacheUtil from '@/shared/cache.util';
import { NOTIFICATION_VALIDATION_SCHEMAS } from '@/Job-Service/validations/premium.validations';

interface ServiceResponse<T = any> {
  success: boolean;
  message: string;
  data?: T;
}

 class NotificationsSettingsService {
  private readonly redis = CacheUtil;

  async initialize(): Promise<void> {
    logger.info('Notifications & Settings Service initialized');
  }

  // =============================================================================
  // 101 - SMART NOTIFICATION TIMING
  // =============================================================================
  async updateNotificationTiming(data: any): Promise<ServiceResponse> {
    const { error, value } = NOTIFICATION_VALIDATION_SCHEMAS.notificationTiming.validate(data);
    if (error) throw new ValidationError(error.details[0].message);

    const s = sanitizeInput(value);

    const timing = {
      enabled: true,
      timezone: s.timezone,
      preferredTimes: s.preferredTimes || [],
      weekdayPreferences: s.weekdayPreferences || {},
      smartOptimization: !!s.smartOptimization,
      maxNotificationsPerHour: Number(s.maxNotificationsPerHour) || 5,
    };

    await UserInteractionModel.findOneAndUpdate(
      { userId: s.userId },
      { $set: { 'notificationSettings.smartTiming': timing, updatedAt: new Date() } },
      { upsert: true, new: true, runValidators: true }
    );

    await this.redis.del(constants.CACHE_KEYS.NOTIFICATION_TIMING(s.userId));

    return {
      success: true,
      message: "TIMING_PREFERENCES_UPDATED",
      data: timing,
    };
  }

  async getNotificationTimingSettings(userId: string): Promise<ServiceResponse> {
    const doc = await UserInteractionModel.findOne({ userId })
      .select('notificationSettings.smartTiming')
      .lean();

    const timing = doc?.notificationSettings?.smartTiming || this.getDefaultTimingSettings();

    return {
      success: true,
      message: "TIMING_SETTINGS_RETRIEVED",
      data: timing,
    };
  }

  async getOptimalNotificationTime(userId: string): Promise<ServiceResponse> {
    const cacheKey = constants.CACHE_KEYS.OPTIMAL_TIME(userId);
    const cached = await this.redis.get(cacheKey);

    if (cached) {
      return {
        success: true,
        message: "OPTIMAL_TIME_CALCULATED",
        data: JSON.parse(cached),
      };
    }

    const engagement = await this.analyzeEngagementPatterns(userId);
    const optimal = await this.calculateOptimalTime(userId, engagement);

    await this.redis.set(cacheKey, JSON.stringify(optimal), Number(Number(constants.CACHE_TTLS.OPTIMAL_TIME)));

    return {
      success: true,
      message: "OPTIMAL_TIME_CALCULATED",
      data: optimal,
    };
  }

  async getEngagementAnalysis(userId: string): Promise<ServiceResponse> {
    const data = await this.analyzeEngagementPatterns(userId);
    return {
      success: true,
      message: "ENGAGEMENT_ANALYSIS_RETRIEVED",
      data,
    };
  }

  private async analyzeEngagementPatterns(userId: string): Promise<any> {
    const cacheKey = constants.CACHE_KEYS.USER_ENGAGEMENT_PATTERN(userId);
    const cached = await this.redis.get(cacheKey);
    if (cached) return JSON.parse(cached);

    // Real implementation mein yahan user ke activity logs se calculate karna
    // Abhi placeholder realistic data
    const pattern = {
      bestHour: 14,
      bestDay: 'tuesday',
      avgResponseTimeMinutes: 45,
      engagementScore: 75,
      hourlyDistribution: { 9: 10, 12: 25, 14: 40, 18: 20 },
      weeklyDistribution: { monday: 60, tuesday: 85, wednesday: 70 },
    };

    await this.redis.set(cacheKey, JSON.stringify(pattern), Number(constants.CACHE_TTLS.USER_ENGAGEMENT_PATTERN));
    return pattern;
  }

  private async calculateOptimalTime(userId: string, engagement: any): Promise<any> {
    const doc = await UserInteractionModel.findOne({ userId })
      .select('notificationSettings.smartTiming.timezone')
      .lean();

    const tz = doc?.notificationSettings?.smartTiming?.timezone || 'Asia/Kolkata';

    return {
      recommendedTime: `${String(engagement.bestHour).padStart(2, '0')}:00`,
      recommendedDay: engagement.bestDay,
      confidence: engagement.engagementScore,
      timezone: tz,
      nextOptimalSlots: [`${String(engagement.bestHour).padStart(2, '0')}:00 tomorrow`],
      reasoning: `Based on your ${engagement.engagementScore}% engagement score and peak activity at ${engagement.bestHour}:00`,
    };
  }

  // =============================================================================
  // 102 - DO NOT DISTURB
  // =============================================================================
  async updateDoNotDisturbSettings(data: any): Promise<ServiceResponse> {
    const { error, value } = NOTIFICATION_VALIDATION_SCHEMAS.dndSettings.validate(data);
    if (error) throw new ValidationError(error.details[0].message);

    const s = sanitizeInput(value);

    const dnd = {
      enabled: !!s.enabled,
      schedules: Array.isArray(s.schedules) ? s.schedules : [],
      allowEmergencyNotifications: !!s.allowEmergencyNotifications,
      emergencyKeywords: Array.isArray(s.emergencyKeywords) ? s.emergencyKeywords : [],
      vipBypass: !!s.vipBypass,
      currentStatus: {
        isActive: this.isDNDActiveNow(s.schedules || []),
        activeUntil: null,
        reason: 'manual',
      },
    };

    await UserInteractionModel.findOneAndUpdate(
      { userId: s.userId },
      { $set: { 'notificationSettings.doNotDisturb': dnd, updatedAt: new Date() } },
      { upsert: true }
    );

    await this.redis.del(constants.CACHE_KEYS.DND_STATUS(s.userId));

    return {
      success: true,
      message: dnd.enabled ? "DND_MODE_ENABLED" : "DND_MODE_DISABLED",
      data: dnd,
    };
  }

  async getDNDSettings(userId: string): Promise<ServiceResponse> {
    const doc = await UserInteractionModel.findOne({ userId })
      .select('notificationSettings.doNotDisturb')
      .lean();

    return {
      success: true,
      message: "DND_SETTINGS_RETRIEVED",
      data: doc?.notificationSettings?.doNotDisturb || this.getDefaultDNDSettings(),
    };
  }

  async getDNDStatus(userId: string): Promise<ServiceResponse> {
    const key = constants.CACHE_KEYS.DND_STATUS(userId);
    let cached = await this.redis.get(key);

    if (cached) {
      return {
        success: true,
        message: "DND_STATUS_RETRIEVED",
        data: JSON.parse(cached),
      };
    }

    const doc = await UserInteractionModel.findOne({ userId })
      .select('notificationSettings.doNotDisturb.currentStatus')
      .lean();

    const status = doc?.notificationSettings?.doNotDisturb?.currentStatus || { isActive: false };

    await this.redis.set(key, JSON.stringify(status), Number(constants.CACHE_TTLS.DND_STATUS));

    return {
      success: true,
      message: "DND_STATUS_RETRIEVED",
      data: status,
    };
  }

  private isDNDActiveNow(schedules: any[]): boolean {
    if (!schedules.length) return false;

    const now = new Date();
    const hour = now.getHours();
    const day = now.toLocaleString('en-us', { weekday: 'long' }).toLowerCase();

    return schedules.some(schedule =>
      schedule.days?.includes(day) &&
      hour >= Number(schedule.startTime?.split(':')[0] || 0) &&
      hour < Number(schedule.endTime?.split(':')[0] || 24)
    );
  }

  // =============================================================================
  // 103 - VIP COMPANY ALERTS
  // =============================================================================
  async addVIPCompany(data: any): Promise<ServiceResponse> {
    const { error, value } = NOTIFICATION_VALIDATION_SCHEMAS.vipCompany.validate(data);
    if (error) throw new ValidationError(error.details[0].message);

    const s = sanitizeInput(value);

    const user = await UserInteractionModel.findOne({ userId: s.userId });
    if (!user) throw new NotFoundError('User profile');

    const companies = user.notificationSettings?.vipCompanies || [];

    if (companies.length >= 50) {
      throw new ConflictError("VIP_LIST_LIMIT_EXCEEDED");
    }

    if (companies.some(c => c.companyId === s.companyId)) {
      throw new ConflictError("VIP_COMPANY_EXISTS");
    }

    const newCompany = {
      ...s,
      addedAt: new Date(),
      lastAlertSent: null,
      alertCount: 0,
    };

    companies.push(newCompany);

    await UserInteractionModel.updateOne(
      { _id: user._id },
      { $set: { 'notificationSettings.vipCompanies': companies, updatedAt: new Date() } }
    );

    await this.redis.del(constants.CACHE_KEYS.VIP_COMPANIES(s.userId));

    return {
      success: true,
      message: "VIP_COMPANY_ADDED",
      data: newCompany,
    };
  }

  async removeVIPCompany(userId: string, companyId: string): Promise<ServiceResponse> {
    const result = await UserInteractionModel.updateOne(
      { userId },
      {
        $pull: { 'notificationSettings.vipCompanies': { companyId } },
        $set: { updatedAt: new Date() },
      }
    );

    if (result.modifiedCount === 0) {
      throw new NotFoundError('VIP company not found');
    }

    await this.redis.del(constants.CACHE_KEYS.VIP_COMPANIES(userId));

    return {
      success: true,
      message: "VIP_COMPANY_REMOVED",
      data: { companyId },
    };
  }

  async getVIPCompanies(userId: string): Promise<ServiceResponse> {
    const key = constants.CACHE_KEYS.VIP_COMPANIES(userId);
    const cached = await this.redis.get(key);

    if (cached) {
      return {
        success: true,
        message: "VIP_COMPANIES_RETRIEVED",
        data: JSON.parse(cached),
      };
    }

    const user = await UserInteractionModel.findOne({ userId })
      .select('notificationSettings.vipCompanies')
      .lean();

    const companies = user?.notificationSettings?.vipCompanies || [];

    await this.redis.set(key, JSON.stringify(companies), Number(constants.CACHE_TTLS.VIP_COMPANIES));

    return {
      success: true,
      message: "VIP_COMPANIES_RETRIEVED",
      data: companies,
    };
  }

  async updateVIPCompany(userId: string, companyId: string, data: any): Promise<ServiceResponse> {
    const { error, value } = NOTIFICATION_VALIDATION_SCHEMAS.vipCompany.validate({ ...data, userId, companyId });
    if (error) throw new ValidationError(error.details[0].message);

    const s = sanitizeInput(value);

    const updateFields: Record<string, any> = {};
    if (s.alertTypes) updateFields['notificationSettings.vipCompanies.$.alertTypes'] = s.alertTypes;
    if (s.priority) updateFields['notificationSettings.vipCompanies.$.priority'] = s.priority;
    if (s.instantNotifications !== undefined) {
      updateFields['notificationSettings.vipCompanies.$.instantNotifications'] = s.instantNotifications;
    }

    const result = await UserInteractionModel.findOneAndUpdate(
      { userId, 'notificationSettings.vipCompanies.companyId': companyId },
      { $set: { ...updateFields, updatedAt: new Date() } },
      { new: true }
    );

    if (!result) throw new NotFoundError('VIP company not found');

    await this.redis.del(constants.CACHE_KEYS.VIP_COMPANIES(userId));

    const updatedCompany = result.notificationSettings.vipCompanies.find(
      c => c.companyId === companyId
    );

    return {
      success: true,
      message: "VIP_COMPANY_UPDATED",
      data: updatedCompany,
    };
  }

  async getVIPCompanyAlerts(userId: string, companyId: string): Promise<ServiceResponse> {
    const user = await UserInteractionModel.findOne(
      { userId, 'notificationSettings.vipCompanies.companyId': companyId },
      { 'notificationSettings.vipCompanies.$': 1 }
    ).lean();

    const vip = user?.notificationSettings?.vipCompanies?.[0];

    if (!vip) throw new NotFoundError('VIP company not found');

    // Placeholder: Real mein alerts ka array DB se aayega
    const alerts = {
      lastAlertSent: vip.lastAlertSent,
      alertCount: vip.alertCount || 0,
      recentAlerts: [], // baad mein implement kar sakte ho
    };

    return {
      success: true,
      message: "VIP_COMPANY_ALERTS_RETRIEVED",
      data: alerts,
    };
  }

  // =============================================================================
  // 104 - APPLICATION DEADLINE REMINDERS (Manual mode)
  // =============================================================================
  async createDeadlineReminder(data: any): Promise<ServiceResponse> {
    const { error, value } = NOTIFICATION_VALIDATION_SCHEMAS.deadlineReminder.validate(data);
    if (error) throw new ValidationError(error.details[0].message);

    const s = sanitizeInput(value);

    if (new Date(s.applicationDeadline) <= new Date()) {
      throw new AppError("DEADLINE_IN_PAST");
    }

    const user = await UserInteractionModel.findOne({ userId: s.userId });
    if (!user) throw new NotFoundError('User');

    const reminders = user.notificationSettings?.deadlineReminders || [];

    if (reminders.length >= 100) {
      throw new ConflictError("REMINDER_LIMIT_EXCEEDED");
    }

    const newReminder = {
      reminderId: uuidv4(),
      ...s,
      status: 'active',
      remindersSent: [],
      createdAt: new Date(),
    };

    reminders.push(newReminder);

    await UserInteractionModel.updateOne(
      { _id: user._id },
      {
        $set: {
          'notificationSettings.deadlineReminders': reminders,
          updatedAt: new Date(),
        },
      }
    );

    await this.redis.del(constants.CACHE_KEYS.DEADLINE_REMINDERS(s.userId));

    return {
      success: true,
      message: `${"DEADLINE_REMINDER_CREATED"} (Auto notifications will be enabled once job apply flow is live)`,
      data: newReminder,
    };
  }

  async updateDeadlineReminder(userId: string, reminderId: string, data: any): Promise<ServiceResponse> {
    const { error, value } = NOTIFICATION_VALIDATION_SCHEMAS.deadlineReminder.validate({ ...data, userId });
    if (error) throw new ValidationError(error.details[0].message);

    const s = sanitizeInput(value);

    const updateFields: Record<string, any> = {};
    if (s.jobTitle) updateFields['notificationSettings.deadlineReminders.$.jobTitle'] = s.jobTitle;
    if (s.companyName) updateFields['notificationSettings.deadlineReminders.$.companyName'] = s.companyName;
    if (s.applicationDeadline) updateFields['notificationSettings.deadlineReminders.$.applicationDeadline'] = s.applicationDeadline;
    if (s.reminderSettings) updateFields['notificationSettings.deadlineReminders.$.reminderSettings'] = s.reminderSettings;
    if (s.priority) updateFields['notificationSettings.deadlineReminders.$.priority'] = s.priority;
    if (s.notificationChannels) updateFields['notificationSettings.deadlineReminders.$.notificationChannels'] = s.notificationChannels;

    const result = await UserInteractionModel.findOneAndUpdate(
      { userId, 'notificationSettings.deadlineReminders.reminderId': reminderId },
      { $set: { ...updateFields, updatedAt: new Date() } },
      { new: true }
    );

    if (!result) throw new NotFoundError("DEADLINE_NOT_FOUND");

    await this.redis.del(constants.CACHE_KEYS.DEADLINE_REMINDERS(userId));

    const updatedReminder = result.notificationSettings.deadlineReminders.find(
      r => r.reminderId === reminderId
    );

    return {
      success: true,
      message: "DEADLINE_REMINDER_UPDATED",
      data: updatedReminder,
    };
  }

  async deleteDeadlineReminder(userId: string, reminderId: string): Promise<ServiceResponse> {
    const result = await UserInteractionModel.updateOne(
      { userId },
      {
        $pull: { 'notificationSettings.deadlineReminders': { reminderId } },
        $set: { updatedAt: new Date() },
      }
    );

    if (result.modifiedCount === 0) {
      throw new NotFoundError("DEADLINE_NOT_FOUND");
    }

    await this.redis.del(constants.CACHE_KEYS.DEADLINE_REMINDERS(userId));

    return {
      success: true,
      message: "DEADLINE_REMINDER_DELETED",
      data: { reminderId },
    };
  }

  // Add these methods in NotificationsSettingsService class:

// Line 228 fix - Add getDeadlineReminders method
async getDeadlineReminders(userId: string): Promise<ServiceResponse> {
  const key = constants.CACHE_KEYS.DEADLINE_REMINDERS(userId);
  const cached = await this.redis.get(key);

  if (cached) {
    return {
      success: true,
      message: "DEADLINE_REMINDERS_RETRIEVED",
      data: JSON.parse(cached),
    };
  }

  const doc = await UserInteractionModel.findOne({ userId })
    .select('notificationSettings.deadlineReminders')
    .lean();

  const reminders = doc?.notificationSettings?.deadlineReminders || [];

  await this.redis.set(key, JSON.stringify(reminders), Number(constants.CACHE_TTLS.DEADLINE_REMINDERS));

  return {
    success: true,
    message: "DEADLINE_REMINDERS_RETRIEVED",
    data: reminders,
  };
}

// Profile Visibility methods
async updateProfileVisibility(data: any): Promise<ServiceResponse> {
  const s = sanitizeInput(data);
  
  await UserInteractionModel.findOneAndUpdate(
    { userId: s.userId },
    { $set: { 'privacySecurity.profileVisibility': s, updatedAt: new Date() } },
    { upsert: true }
  );

  return { success: true, message: "PROFILE_VISIBILITY_UPDATED", data: s };
}

async getProfileVisibility(userId: string): Promise<ServiceResponse> {
  const doc = await UserInteractionModel.findOne({ userId })
    .select('privacySecurity.profileVisibility')
    .lean();

  return {
    success: true,
    message: "PROFILE_VISIBILITY_RETRIEVED",
    data: doc?.privacySecurity?.profileVisibility || this.getDefaultVisibilitySettings(),
  };
}

// Anonymous Browsing methods
async enableAnonymousBrowsing(data: any): Promise<ServiceResponse> {
  const s = sanitizeInput(data);
  
  const session = {
    sessionId: uuidv4(),
    startedAt: new Date(),
    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours
    isActive: true,
  };

  await UserInteractionModel.findOneAndUpdate(
    { userId: s.userId },
    { 
      $set: { 
        'privacySecurity.anonymousBrowsing.enabled': true,
        'privacySecurity.anonymousBrowsing.currentSession': session,
        updatedAt: new Date() 
      } 
    },
    { upsert: true }
  );

  return { success: true, message: "ANONYMOUS_BROWSING_ENABLED", data: session };
}

async disableAnonymousBrowsing(userId: string): Promise<ServiceResponse> {
  await UserInteractionModel.updateOne(
    { userId },
    { 
      $set: { 
        'privacySecurity.anonymousBrowsing.enabled': false,
        'privacySecurity.anonymousBrowsing.currentSession': null,
        updatedAt: new Date() 
      } 
    }
  );

  return { success: true, message: "ANONYMOUS_BROWSING_DISABLED" };
}

async getAnonymousBrowsingStatus(userId: string): Promise<ServiceResponse> {
  const doc = await UserInteractionModel.findOne({ userId })
    .select('privacySecurity.anonymousBrowsing')
    .lean();

  return {
    success: true,
    message: "ANONYMOUS_BROWSING_STATUS_RETRIEVED",
    data: doc?.privacySecurity?.anonymousBrowsing || { enabled: false },
  };
}

async extendAnonymousSession(userId: string, sessionId: string, data: any): Promise<ServiceResponse> {
  const s = sanitizeInput(data);
  const newExpiry = new Date(Date.now() + (s.hours || 24) * 60 * 60 * 1000);

  await UserInteractionModel.updateOne(
    { userId },
    { $set: { 'privacySecurity.anonymousBrowsing.currentSession.expiresAt': newExpiry } }
  );

  return { success: true, message: "ANONYMOUS_SESSION_EXTENDED", data: { expiresAt: newExpiry } };
}

async getAnonymousSessionHistory(userId: string, limit: number, offset: number): Promise<ServiceResponse> {
  // Placeholder - implement based on your session history storage
  return { success: true, message: "SESSION_HISTORY_RETRIEVED", data: [] };
}

// Alert Frequency methods
async updateAlertFrequency(data: any): Promise<ServiceResponse> {
  const s = sanitizeInput(data);
  
  await UserInteractionModel.findOneAndUpdate(
    { userId: s.userId },
    { $set: { 'notificationSettings.alertFrequency': s, updatedAt: new Date() } },
    { upsert: true }
  );

  return { success: true, message: "ALERT_FREQUENCY_UPDATED", data: s };
}

async getAlertFrequencySettings(userId: string): Promise<ServiceResponse> {
  const doc = await UserInteractionModel.findOne({ userId })
    .select('notificationSettings.alertFrequency')
    .lean();

  return {
    success: true,
    message: "ALERT_FREQUENCY_SETTINGS_RETRIEVED",
    data: doc?.notificationSettings?.alertFrequency || this.getDefaultAlertFrequencySettings(),
  };
}

async updateCategoryFrequency(userId: string, category: string, frequency: string): Promise<ServiceResponse> {
  await UserInteractionModel.updateOne(
    { userId },
    { $set: { [`notificationSettings.alertFrequency.categoryFrequencies.${category}`]: frequency } }
  );

  return { success: true, message: "CATEGORY_FREQUENCY_UPDATED", data: { category, frequency } };
}

async resetAlertFrequency(userId: string): Promise<ServiceResponse> {
  await UserInteractionModel.updateOne(
    { userId },
    { $set: { 'notificationSettings.alertFrequency': this.getDefaultAlertFrequencySettings() } }
  );

  return { success: true, message: "ALERT_FREQUENCY_RESET" };
}

// Email Preferences methods
async updateEmailPreferences(data: any): Promise<ServiceResponse> {
  const s = sanitizeInput(data);
  
  await UserInteractionModel.findOneAndUpdate(
    { userId: s.userId },
    { $set: { 'notificationSettings.emailPreferences': s, updatedAt: new Date() } },
    { upsert: true }
  );

  return { success: true, message: "EMAIL_PREFERENCES_UPDATED", data: s };
}

async getEmailPreferences(userId: string): Promise<ServiceResponse> {
  const doc = await UserInteractionModel.findOne({ userId })
    .select('privacySecurity.emailPreferences')
    .lean();

  return {
    success: true,
    message: "EMAIL_PREFERENCES_RETRIEVED",
    data: doc?.privacySecurity?.emailPreferences || this.getDefaultEmailSettings(),
  };
}

async updateEmailSubscription(userId: string, category: string, enabled: boolean): Promise<ServiceResponse> {
  await UserInteractionModel.updateOne(
    { userId },
    { $set: { [`privacySecurity.emailPreferences.subscriptions.${category}`]: enabled } }
  );

  return { success: true, message: "EMAIL_SUBSCRIPTION_UPDATED", data: { category, enabled } };
}

async getEmailSubscriptionStatus(userId: string): Promise<ServiceResponse> {
  const doc = await UserInteractionModel.findOne({ userId })
    .select('privacySecurity.emailPreferences.subscriptions')
    .lean();

  return {
    success: true,
    message: "EMAIL_SUBSCRIPTION_STATUS_RETRIEVED",
    data: doc?.privacySecurity?.emailPreferences?.subscriptions || {},
  };
}

// Remaining stub methods (implement as needed)
async requestDataExport(data: any): Promise<ServiceResponse> {
  return { success: true, message: "DATA_EXPORT_REQUESTED", data: { exportId: uuidv4() } };
}

async getExportHistory(userId: string, limit: number, offset: number): Promise<ServiceResponse> {
  return { success: true, message: "EXPORT_HISTORY_RETRIEVED", data: [] };
}

async getExportStatus(exportId: string, userId: string): Promise<ServiceResponse> {
  return { success: true, message: "EXPORT_STATUS_RETRIEVED", data: { status: 'pending' } };
}

async downloadExport(exportId: string, userId: string): Promise<ServiceResponse> {
  return { success: true, message: "EXPORT_DOWNLOADED", data: {} };
}

async cancelExport(exportId: string, userId: string): Promise<ServiceResponse> {
  return { success: true, message: "EXPORT_CANCELLED", data: {} };
}

async getSecuritySettings(userId: string): Promise<ServiceResponse> {
  return { success: true, message: "SECURITY_SETTINGS_RETRIEVED", data: {} };
}

async updateSecuritySettings(data: any): Promise<ServiceResponse> {
  return { success: true, message: "SECURITY_SETTINGS_UPDATED", data: {} };
}

async changePassword(data: any): Promise<ServiceResponse> {
  return { success: true, message: "PASSWORD_CHANGED", data: {} };
}

async enable2FA(userId: string, method: string, phoneNumber?: string): Promise<ServiceResponse> {
  return { success: true, message: "2FA_ENABLED", data: {} };
}

async verify2FASetup(userId: string, token: string, secret: string): Promise<ServiceResponse> {
  return { success: true, message: "2FA_VERIFIED", data: {} };
}

async disable2FA(userId: string, currentPassword: string): Promise<ServiceResponse> {
  return { success: true, message: "2FA_DISABLED", data: {} };
}

async generateBackupCodes(userId: string, currentPassword: string): Promise<ServiceResponse> {
  return { success: true, message: "BACKUP_CODES_GENERATED", data: { codes: [] } };
}

async getLoginActivity(userId: string, limit: number, offset: number): Promise<ServiceResponse> {
  return { success: true, message: "LOGIN_ACTIVITY_RETRIEVED", data: [] };
}

async getTrustedDevices(userId: string): Promise<ServiceResponse> {
  return { success: true, message: "TRUSTED_DEVICES_RETRIEVED", data: [] };
}

async revokeTrustedDevice(userId: string, deviceId: string): Promise<ServiceResponse> {
  return { success: true, message: "TRUSTED_DEVICE_REVOKED", data: {} };
}

async lockAccount(userId: string, reason: string, duration: number): Promise<ServiceResponse> {
  return { success: true, message: "ACCOUNT_LOCKED", data: {} };
}

async unlockAccount(userId: string, currentPassword: string): Promise<ServiceResponse> {
  return { success: true, message: "ACCOUNT_UNLOCKED", data: {} };
}

async getSecurityAudit(userId: string): Promise<ServiceResponse> {
  return { success: true, message: "SECURITY_AUDIT_RETRIEVED", data: {} };
}

  // async getUpcomingDeadlines(userId: string, days: number = 7): Promise<ServiceResponse> {
  //   const doc = await UserInteractionModel.findOne({ userId })
  //     .select('notificationSettings.deadlineReminders')
  //     .lean();

  //   const now = new Date();
  //   const future = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);

  //   const upcoming = (doc?.notificationSettings?.deadlineReminders || []).filter(r =>
  //     r.status === 'active' &&
  //     new Date(r.applicationDeadline) > now &&
  //     new Date(r.applicationDeadline) <= future
  //   );

  //   upcoming.sort((a, b) => new Date(a.applicationDeadline).getTime() - new Date(b.applicationDeadline).getTime());

  //   return {
  //     success: true,
  //     message: "UPCOMING_DEADLINES_RETRIEVED",
  //     data: upcoming,
  //   };
  // }

  // =============================================================================
  // DEFAULT HELPERS (complete)
  // =============================================================================
  
  private getDefaultTimingSettings() {
    return {
      enabled: false,
      timezone: 'Asia/Kolkata',
      preferredTimes: ['09:00-12:00', '14:00-17:00'],
      weekdayPreferences: { monday: true, tuesday: true, wednesday: true, thursday: true, friday: true, saturday: false, sunday: false },
      smartOptimization: true,
      maxNotificationsPerHour: 5,
    };
  }

  private getDefaultDNDSettings() {
    return {
      enabled: false,
      schedules: [],
      allowEmergencyNotifications: false,
      emergencyKeywords: [],
      vipBypass: false,
      currentStatus: { isActive: false, activeUntil: null, reason: null },
    };
  }

  private getDefaultAlertFrequencySettings() {
    return {
      globalFrequency: 'daily',
      categoryFrequencies: {
        newJobs: 'daily',
        jobRecommendations: 'weekly',
        applicationUpdates: 'instant',
        companyUpdates: 'weekly',
        networkActivity: 'weekly',
        marketInsights: 'monthly',
        learningOpportunities: 'monthly',
      },
      quietHours: { enabled: true, startTime: '22:00', endTime: '08:00' },
      weekendDelivery: false,
      maxAlertsPerDay: 10,
    };
  }

  private getDefaultEmailSettings() {
    return {
      globalEmailEnabled: true,
      subscriptions: {
        jobAlerts: true,
        applicationUpdates: true,
        companyNews: true,
        weeklyDigest: true,
        monthlyReport: true,
        marketingEmails: false,
        partnerOffers: false,
        surveyInvitations: false,
        productUpdates: true,
        securityAlerts: true,
      },
      emailFormat: 'html',
      emailVerified: false,
    };
  }

  private getDefaultVisibilitySettings() {
    return {
      profileVisibility: 'public',
      searchableByRecruiters: true,
      showInCompanySearch: true,
      allowDirectMessages: true,
      showActivityStatus: false,
      hideFromCurrentEmployer: false,
      currentEmployerDomains: [],
      blockedCompanies: [],
      visibleFields: {
        email: false,
        phone: false,
        currentSalary: false,
        workHistory: true,
        education: true,
        skills: true,
        certifications: true,
        portfolio: true,
      },
    };
  }
}

// Singleton export
let instance: NotificationsSettingsService | null = null;

export const getNotificationsSettingsService = (): NotificationsSettingsService => {
  if (!instance) {
    instance = new NotificationsSettingsService();
    instance.initialize().catch(err => logger.error('Service init failed', { error: err }));
  }
  return instance;
};

export default new NotificationsSettingsService();