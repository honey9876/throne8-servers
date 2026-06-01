// controller/notificationsSettings.controller.ts
import { Request, Response, NextFunction } from 'express';

import { notificationsSettingsService } from '@/Job-Service/services';
import { sanitizeInput, generateSecureId, validId } from '@/shared/security';
import logger from '@/shared/logger.util';
import ResponseUtil from '@/shared/response.util';
import {
  ValidationError,
  NotFoundError,
  BadRequestError,
} from '@/shared/errors/app.error';

// Request context helper (consistent across controllers)
const withNotificationContext = (handler: (req: Request, res: Response) => Promise<void>) =>
  async (req: Request, res: Response, next: NextFunction) => {
    const requestId = generateSecureId();
    const startTime = Date.now();

    try {
      await handler(req, res);
    } catch (err) {
      next(err);
    } finally {
      const duration = Date.now() - startTime;
      if (duration > 800) {
        logger.warn(`[${requestId}] Slow notification operation`, { duration });
      }
    }
  };

// PUT - Update Notification Timing
export const updateNotificationTimingController = withNotificationContext(async (req: Request, res: Response) => {
  if (!req.body || Object.keys(req.body).length === 0) {
    throw new BadRequestError('INVALID_REQUEST_BODY');
  }

  const result = await notificationsSettingsService.updateNotificationTiming({
    ...sanitizeInput(req.body),
    userId: req.user?.userId!,
  });

  if (!result) throw new NotFoundError('Notification timing settings');

  ResponseUtil.success(res, result, 'NOTIFICATION_TIMING_UPDATED');
});

// GET - Get Notification Timing Settings
export const getNotificationTimingSettingsController = withNotificationContext(async (req: Request, res: Response) => {
  const result = await notificationsSettingsService.getNotificationTimingSettings(req.user?.userId!);
  if (!result) throw new NotFoundError('NOTIFICATION_TIMING_SETTINGS_NOT_FOUND');

  ResponseUtil.success(res, result, 'NOTIFICATION_TIMING_SETTINGS_RETRIEVED');
});

// GET - Get Optimal Notification Time
export const getOptimalNotificationTimeController = withNotificationContext(async (req: Request, res: Response) => {
  const result = await notificationsSettingsService.getOptimalNotificationTime(req.user?.userId!);
  if (!result) throw new NotFoundError('OPTIMAL_NOTIFICATION_TIME_NOT_FOUND');

  ResponseUtil.success(res, result, 'OPTIMAL_NOTIFICATION_TIME_RETRIEVED');
});

// GET - Get Engagement Analysis
export const getEngagementAnalysisController = withNotificationContext(async (req: Request, res: Response) => {
  const result = await notificationsSettingsService.getEngagementAnalysis(req.user?.userId!);
  if (!result) throw new NotFoundError('ENGAGEMENT_ANALYSIS_NOT_FOUND');

  ResponseUtil.success(res, result, 'ENGAGEMENT_ANALYSIS_RETRIEVED');
});

// PUT - Update Do Not Disturb Settings
export const updateDoNotDisturbSettingsController = withNotificationContext(async (req: Request, res: Response) => {
  if (!req.body || Object.keys(req.body).length === 0) {
    throw new BadRequestError('INVALID_REQUEST_BODY');
  }

  const result = await notificationsSettingsService.updateDoNotDisturbSettings({
    ...sanitizeInput(req.body),
    userId: req.user?.userId!,
  });

  if (!result) throw new NotFoundError('DND_SETTINGS_NOT_FOUND');

  ResponseUtil.success(res, result, 'DND_SETTINGS_UPDATED');
});

// GET - Get DND Settings
export const getDNDSettingsController = withNotificationContext(async (req: Request, res: Response) => {
  const result = await notificationsSettingsService.getDNDSettings(req.user?.userId!);
  if (!result) throw new NotFoundError('DND_SETTINGS_NOT_FOUND');

  ResponseUtil.success(res, result, 'DND_SETTINGS_RETRIEVED');
});

// GET - Get DND Status
export const getDNDStatusController = withNotificationContext(async (req: Request, res: Response) => {
  const result = await notificationsSettingsService.getDNDStatus(req.user?.userId!);
  if (!result) throw new NotFoundError('DND_STATUS_NOT_FOUND');

  ResponseUtil.success(res, result, 'DND_STATUS_RETRIEVED');
});

// POST - Add VIP Company
export const addVIPCompanyController = withNotificationContext(async (req: Request, res: Response) => {
  if (!req.body || Object.keys(req.body).length === 0) {
    throw new BadRequestError('INVALID_REQUEST_BODY');
  }

  const result = await notificationsSettingsService.addVIPCompany({
    ...sanitizeInput(req.body),
    userId: req.user?.userId!,
  });

  if (!result) throw new BadRequestError('VIP_COMPANY_NOT_ADDED');

  ResponseUtil.created(res, result, 'VIP_COMPANY_ADDED');
});

// PUT - Update VIP Company
export const updateVIPCompanyController = withNotificationContext(async (req: Request, res: Response) => {
  if (!validId(req.params.companyId)) throw new ValidationError('INVALID_COMPANY_ID');

  if (!req.body || Object.keys(req.body).length === 0) {
    throw new BadRequestError('INVALID_REQUEST_BODY');
  }

  const result = await notificationsSettingsService.updateVIPCompany(
    req.user?.userId!,
    req.params.companyId,
    sanitizeInput(req.body)
  );

  if (!result) throw new NotFoundError('VIP_COMPANY_NOT_FOUND');

  ResponseUtil.success(res, result, 'VIP_COMPANY_UPDATED');
});

// DELETE - Remove VIP Company
export const removeVIPCompanyController = withNotificationContext(async (req: Request, res: Response) => {
  if (!validId(req.params.companyId)) throw new ValidationError('INVALID_COMPANY_ID');

  const result = await notificationsSettingsService.removeVIPCompany(
    req.user?.userId!,
    req.params.companyId
  );

  if (!result) throw new NotFoundError('VIP_COMPANY_NOT_FOUND');

  ResponseUtil.success(res, {}, 'VIP_COMPANY_REMOVED');
});

// GET - Get All VIP Companies
export const getVIPCompaniesController = withNotificationContext(async (req: Request, res: Response) => {
  const result = await notificationsSettingsService.getVIPCompanies(req.user?.userId!);
  if (!result /*|| result.length === 0*/) {
    throw new NotFoundError('NO_VIP_COMPANIES_FOUND');
  }

  ResponseUtil.success(res, result, 'VIP_COMPANIES_FETCHED');
});

// GET - Get VIP Company Alerts
export const getVIPCompanyAlertsController = withNotificationContext(async (req: Request, res: Response) => {
  if (!validId(req.params.companyId)) throw new ValidationError('INVALID_COMPANY_ID');

  const result = await notificationsSettingsService.getVIPCompanyAlerts(
    req.user?.userId!,
    req.params.companyId
  );

  if (!result) throw new NotFoundError('VIP_COMPANY_ALERTS_NOT_FOUND');

  ResponseUtil.success(res, result, 'VIP_COMPANY_ALERTS_FETCHED');
});

// POST - Create Deadline Reminder
export const createDeadlineReminderController = withNotificationContext(async (req: Request, res: Response) => {
  if (!req.body || Object.keys(req.body).length === 0) {
    throw new BadRequestError('INVALID_REQUEST_BODY');
  }

  const result = await notificationsSettingsService.createDeadlineReminder({
    ...sanitizeInput(req.body),
    userId: req.user?.userId!,
  });

  if (!result) throw new BadRequestError('Failed to create deadline reminder');

  ResponseUtil.created(res, result, 'DEADLINE_REMINDER_CREATED');
});

// PUT - Update Deadline Reminder
export const updateDeadlineReminderController = withNotificationContext(async (req: Request, res: Response) => {
  if (!validId(req.params.reminderId)) throw new ValidationError('INVALID_REMINDER_ID');

  if (!req.body || Object.keys(req.body).length === 0) {
    throw new BadRequestError('INVALID_REQUEST_BODY');
  }

  const result = await notificationsSettingsService.updateDeadlineReminder(
    req.user?.userId!,
    req.params.reminderId,
    sanitizeInput(req.body)
  );

  if (!result) throw new BadRequestError('Failed to update deadline reminder');

  ResponseUtil.success(res, result, 'DEADLINE_REMINDER_UPDATED');
});

// DELETE - Delete Deadline Reminder
export const deleteDeadlineReminderController = withNotificationContext(async (req: Request, res: Response) => {
  if (!validId(req.params.reminderId)) throw new ValidationError('INVALID_REMINDER_ID');

  const result = await notificationsSettingsService.deleteDeadlineReminder(
    req.user?.userId!,
    req.params.reminderId
  );

  if (!result) throw new BadRequestError('Failed to delete deadline reminder');

  ResponseUtil.success(res, {}, 'DEADLINE_REMINDER_DELETED');
});

// GET - Get All Deadline Reminders
export const getDeadlineRemindersController = withNotificationContext(async (req: Request, res: Response) => {
  const result = await notificationsSettingsService.getDeadlineReminders(req.user?.userId!);
  if (!result /*|| result.length === 0*/) {
    throw new NotFoundError('NO_DEADLINE_REMINDERS_FOUND');
  }

  ResponseUtil.success(res, result, 'DEADLINE_REMINDERS_FETCHED');
});

// GET - Get Upcoming Deadlines
export const getUpcomingDeadlinesController = withNotificationContext(async (req: Request, res: Response) => {
  const days = parseInt(req.query.days as string) || 7;
  const result = 'data is comming'
  // const result = await notificationsSettingsService.getUpcomingDeadlines(req.user?.userId!, days);

  if (!result || result.length === 0) {
    throw new NotFoundError('NO_UPCOMING_DEADLINES_FOUND');
  }

  ResponseUtil.success(res, result, 'UPCOMING_DEADLINES_FETCHED');
});

// PUT - Update Profile Visibility
export const updateProfileVisibilityController = withNotificationContext(async (req: Request, res: Response) => {
  if (!req.body || Object.keys(req.body).length === 0) {
    throw new BadRequestError('INVALID_REQUEST_BODY');
  }

  const result = await notificationsSettingsService.updateProfileVisibility({
    ...sanitizeInput(req.body),
    userId: req.user?.userId!,
  });

  if (!result) throw new BadRequestError('Failed to update profile visibility');

  ResponseUtil.success(res, result, 'PROFILE_VISIBILITY_UPDATED');
});

// GET - Get Profile Visibility
export const getProfileVisibilityController = withNotificationContext(async (req: Request, res: Response) => {
  const result = await notificationsSettingsService.getProfileVisibility(req.user?.userId!);
  if (!result) throw new NotFoundError('NO_PROFILE_VISIBILITY_FOUND');

  ResponseUtil.success(res, result, 'PROFILE_VISIBILITY_FETCHED');
});

// POST - Enable Anonymous Browsing
export const enableAnonymousBrowsingController = withNotificationContext(async (req: Request, res: Response) => {
  if (!req.body || Object.keys(req.body).length === 0) {
    throw new BadRequestError('INVALID_REQUEST_BODY');
  }

  const result = await notificationsSettingsService.enableAnonymousBrowsing({
    ...sanitizeInput(req.body),
    userId: req.user?.userId!,
  });

  ResponseUtil.success(res, result, 'Anonymous browsing enabled');
});

// POST - Disable Anonymous Browsing
export const disableAnonymousBrowsingController = withNotificationContext(async (req: Request, res: Response) => {
  const result = await notificationsSettingsService.disableAnonymousBrowsing(req.user?.userId!);
  if (!result) throw new BadRequestError('Failed to disable anonymous browsing');

  ResponseUtil.success(res, result, 'Anonymous browsing disabled');
});

// GET - Get Anonymous Browsing Status
export const getAnonymousBrowsingStatusController = withNotificationContext(async (req: Request, res: Response) => {
  const result = await notificationsSettingsService.getAnonymousBrowsingStatus(req.user?.userId!);
  if (!result) throw new NotFoundError('Anonymous browsing status not found');

  ResponseUtil.success(res, result, 'Anonymous browsing status fetched');
});

// POST - Extend Anonymous Session
export const extendAnonymousSessionController = withNotificationContext(async (req: Request, res: Response) => {
  if (!validId(req.params.sessionId)) throw new ValidationError('INVALID_SESSION_ID');

  if (!req.body || Object.keys(req.body).length === 0) {
    throw new BadRequestError('INVALID_REQUEST_BODY');
  }

  const result = await notificationsSettingsService.extendAnonymousSession(
    req.user?.userId!,
    req.params.sessionId,
    sanitizeInput(req.body)
  );

  if (!result) throw new BadRequestError('Failed to extend anonymous session');

  ResponseUtil.success(res, result, 'Anonymous session extended');
});

// GET - Get Anonymous Session History
export const getAnonymousSessionHistoryController = withNotificationContext(async (req: Request, res: Response) => {
  const limit = parseInt(req.query.limit as string) || 10;
  const offset = parseInt(req.query.offset as string) || 0;

  const result = await notificationsSettingsService.getAnonymousSessionHistory(req.user?.userId!, limit, offset);
  if (!result) throw new NotFoundError('Anonymous session history not found');

  ResponseUtil.success(res, result, 'Anonymous session history fetched');
});

// PUT - Update Alert Frequency
export const updateAlertFrequencyController = withNotificationContext(async (req: Request, res: Response) => {
  if (!req.body || Object.keys(req.body).length === 0) {
    throw new BadRequestError('INVALID_REQUEST_BODY');
  }

  const result = await notificationsSettingsService.updateAlertFrequency({
    ...sanitizeInput(req.body),
    userId: req.user?.userId!,
  });

  if (!result) throw new BadRequestError('Failed to update alert frequency');

  ResponseUtil.success(res, result, 'Alert frequency updated');
});

// GET - Get Alert Frequency Settings
export const getAlertFrequencySettingsController = withNotificationContext(async (req: Request, res: Response) => {
  const result = await notificationsSettingsService.getAlertFrequencySettings(req.user?.userId!);
  if (!result) throw new NotFoundError('Alert frequency settings not found');

  ResponseUtil.success(res, result, 'Alert frequency settings fetched');
});

// PUT - Update Category Frequency
export const updateCategoryFrequencyController = withNotificationContext(async (req: Request, res: Response) => {
  if (!req.params.category) throw new ValidationError('Category is required');

  const result = await notificationsSettingsService.updateCategoryFrequency(
    req.user?.userId!,
    req.params.category,
    sanitizeInput(req.body).frequency
  );

  if (!result) throw new BadRequestError('Failed to update category frequency');

  ResponseUtil.success(res, result, 'Category frequency updated');
});

// POST - Reset Alert Frequency
export const resetAlertFrequencyController = withNotificationContext(async (req: Request, res: Response) => {
  const result = await notificationsSettingsService.resetAlertFrequency(req.user?.userId!);
  if (!result) throw new BadRequestError('Failed to reset alert frequency');

  ResponseUtil.success(res, result, 'Alert frequency reset');
});

// PUT - Update Email Preferences
export const updateEmailPreferencesController = withNotificationContext(async (req: Request, res: Response) => {
  if (!req.body || Object.keys(req.body).length === 0) {
    throw new BadRequestError('INVALID_REQUEST_BODY');
  }

  const result = await notificationsSettingsService.updateEmailPreferences({
    ...sanitizeInput(req.body),
    userId: req.user?.userId!,
  });

  if (!result) throw new BadRequestError('Failed to update email preferences');

  ResponseUtil.success(res, result, 'Email preferences updated');
});

// GET - Get Email Preferences
export const getEmailPreferencesController = withNotificationContext(async (req: Request, res: Response) => {
  const result = await notificationsSettingsService.getEmailPreferences(req.user?.userId!);
  if (!result) throw new NotFoundError('Email preferences not found');

  ResponseUtil.success(res, result, 'Email preferences fetched');
});

// PUT - Update Email Subscription
export const updateEmailSubscriptionController = withNotificationContext(async (req: Request, res: Response) => {
  if (!req.params.category) throw new ValidationError('Category is required');

  const result = await notificationsSettingsService.updateEmailSubscription(
    req.user?.userId!,
    req.params.category,
    sanitizeInput(req.body).enabled
  );

  if (!result) throw new BadRequestError('Failed to update email subscription');

  ResponseUtil.success(res, result, 'Email subscription updated');
});

// GET - Get Email Subscription Status
export const getEmailSubscriptionStatusController = withNotificationContext(async (req: Request, res: Response) => {
  const result = await notificationsSettingsService.getEmailSubscriptionStatus(req.user?.userId!);
  if (!result) throw new NotFoundError('Email subscription status not found');

  ResponseUtil.success(res, result, 'Email subscription status fetched');
});

// POST - Request Data Export
export const requestDataExportController = withNotificationContext(async (req: Request, res: Response) => {
  if (!req.body || Object.keys(req.body).length === 0) {
    throw new BadRequestError('INVALID_REQUEST_BODY');
  }

  const result = await notificationsSettingsService.requestDataExport({
    ...sanitizeInput(req.body),
    userId: req.user?.userId!,
  });

  if (!result) throw new BadRequestError('Failed to request data export');

  ResponseUtil.created(res, result, 'Data export requested');
});

// GET - Get Export History
export const getExportHistoryController = withNotificationContext(async (req: Request, res: Response) => {
  const limit = parseInt(req.query.limit as string) || 10;
  const offset = parseInt(req.query.offset as string) || 0;

  const result = await notificationsSettingsService.getExportHistory(req.user?.userId!, limit, offset);
  if (!result) throw new NotFoundError('Export history not found');

  ResponseUtil.success(res, result, 'Export history fetched');
});

// GET - Get Export Status
export const getExportStatusController = withNotificationContext(async (req: Request, res: Response) => {
  if (!validId(req.params.exportId)) throw new ValidationError('INVALID_EXPORT_ID');

  const result = await notificationsSettingsService.getExportStatus(req.params.exportId, req.user?.userId!);
  if (!result) throw new NotFoundError('Export not found');

  ResponseUtil.success(res, result, 'Export status fetched');
});

// GET - Download Export
export const downloadExportController = withNotificationContext(async (req: Request, res: Response) => {
  if (!validId(req.params.exportId)) throw new ValidationError('INVALID_EXPORT_ID');

  const result = await notificationsSettingsService.downloadExport(req.params.exportId, req.user?.userId!);
  if (!result) throw new NotFoundError('Export not found');

  ResponseUtil.success(res, result, 'Export downloaded');
});

// POST - Cancel Export
export const cancelExportController = withNotificationContext(async (req: Request, res: Response) => {
  if (!validId(req.params.exportId)) throw new ValidationError('INVALID_EXPORT_ID');

  const result = await notificationsSettingsService.cancelExport(req.params.exportId, req.user?.userId!);
  if (!result) throw new NotFoundError('Export not found');

  ResponseUtil.success(res, result, 'Export cancelled');
});

// GET - Get Security Settings
export const getSecuritySettingsController = withNotificationContext(async (req: Request, res: Response) => {
  const result = await notificationsSettingsService.getSecuritySettings(req.user?.userId!);
  if (!result) throw new NotFoundError('Security settings not found');

  ResponseUtil.success(res, result, 'Security settings fetched');
});

// PUT - Update Security Settings
export const updateSecuritySettingsController = withNotificationContext(async (req: Request, res: Response) => {
  if (!req.body || Object.keys(req.body).length === 0) {
    throw new BadRequestError('INVALID_REQUEST_BODY');
  }

  const result = await notificationsSettingsService.updateSecuritySettings({
    ...sanitizeInput(req.body),
    userId: req.user?.userId!,
  });

  if (!result) throw new BadRequestError('Failed to update security settings');

  ResponseUtil.success(res, result, 'Security settings updated');
});

// POST - Change Password
export const changePasswordController = withNotificationContext(async (req: Request, res: Response) => {
  if (!req.body || Object.keys(req.body).length === 0) {
    throw new BadRequestError('INVALID_REQUEST_BODY');
  }

  const result = await notificationsSettingsService.changePassword({
    ...sanitizeInput(req.body),
    userId: req.user?.userId!,
  });

  if (!result) throw new BadRequestError('Failed to change password');

  ResponseUtil.success(res, result, 'Password changed successfully');
});

// POST - Enable 2FA
export const enable2FAController = withNotificationContext(async (req: Request, res: Response) => {
  if (!req.body || Object.keys(req.body).length === 0) {
    throw new BadRequestError('INVALID_REQUEST_BODY');
  }

  const result = await notificationsSettingsService.enable2FA(
    req.user?.userId!,
    sanitizeInput(req.body.method),
    sanitizeInput(req.body.phoneNumber)
  );

  if (!result) throw new BadRequestError('Failed to enable 2FA');

  ResponseUtil.success(res, result, '2FA enabled');
});

// POST - Verify 2FA Setup
export const verify2FASetupController = withNotificationContext(async (req: Request, res: Response) => {
  if (!req.body || Object.keys(req.body).length === 0) {
    throw new BadRequestError('INVALID_REQUEST_BODY');
  }

  const result = await notificationsSettingsService.verify2FASetup(
    req.user?.userId!,
    sanitizeInput(req.body.token),
    sanitizeInput(req.body.secret)
  );

  if (!result) throw new BadRequestError('Failed to verify 2FA setup');

  ResponseUtil.success(res, result, '2FA setup verified');
});

// POST - Disable 2FA
export const disable2FAController = withNotificationContext(async (req: Request, res: Response) => {
  if (!req.body || Object.keys(req.body).length === 0) {
    throw new BadRequestError('INVALID_REQUEST_BODY');
  }

  const result = await notificationsSettingsService.disable2FA(
    req.user?.userId!,
    sanitizeInput(req.body.currentPassword)
  );

  if (!result) throw new BadRequestError('Failed to disable 2FA');

  ResponseUtil.success(res, result, '2FA disabled');
});

// POST - Generate Backup Codes
export const generateBackupCodesController = withNotificationContext(async (req: Request, res: Response) => {
  if (!req.body || Object.keys(req.body).length === 0) {
    throw new BadRequestError('INVALID_REQUEST_BODY');
  }

  const result = await notificationsSettingsService.generateBackupCodes(
    req.user?.userId!,
    sanitizeInput(req.body.currentPassword)
  );

  if (!result) throw new BadRequestError('Failed to generate backup codes');

  ResponseUtil.success(res, result, 'Backup codes generated');
});

// GET - Get Login Activity
export const getLoginActivityController = withNotificationContext(async (req: Request, res: Response) => {
  const limit = parseInt(req.query.limit as string) || 50;
  const offset = parseInt(req.query.offset as string) || 0;

  const result = await notificationsSettingsService.getLoginActivity(req.user?.userId!, limit, offset);
  if (!result) throw new NotFoundError('Login activity not found');

  ResponseUtil.success(res, result, 'Login activity fetched');
});

// GET - Get Trusted Devices
export const getTrustedDevicesController = withNotificationContext(async (req: Request, res: Response) => {
  const result = await notificationsSettingsService.getTrustedDevices(req.user?.userId!);
  if (!result) throw new NotFoundError('Trusted devices not found');

  ResponseUtil.success(res, result, 'Trusted devices fetched');
});

// DELETE - Revoke Trusted Device
export const revokeTrustedDeviceController = withNotificationContext(async (req: Request, res: Response) => {
  if (!validId(req.params.deviceId)) throw new ValidationError('INVALID_DEVICE_ID');

  const result = await notificationsSettingsService.revokeTrustedDevice(req.user?.userId!, req.params.deviceId);
  if (!result) throw new NotFoundError('Trusted device not found');

  ResponseUtil.success(res, result, 'Trusted device revoked');
});

// POST - Lock Account
export const lockAccountController = withNotificationContext(async (req: Request, res: Response) => {
  if (!req.body || Object.keys(req.body).length === 0) {
    throw new BadRequestError('INVALID_REQUEST_BODY');
  }

  const result = await notificationsSettingsService.lockAccount(
    req.user?.userId!,
    sanitizeInput(req.body.reason),
    sanitizeInput(req.body.duration)
  );

  if (!result) throw new BadRequestError('Failed to lock account');

  ResponseUtil.success(res, result, 'Account locked');
});

// POST - Unlock Account
export const unlockAccountController = withNotificationContext(async (req: Request, res: Response) => {
  if (!req.body || Object.keys(req.body).length === 0) {
    throw new BadRequestError('INVALID_REQUEST_BODY');
  }

  const result = await notificationsSettingsService.unlockAccount(
    req.user?.userId!,
    sanitizeInput(req.body.currentPassword)
  );

  if (!result) throw new BadRequestError('Failed to unlock account');

  ResponseUtil.success(res, result, 'Account unlocked');
});

// GET - Get Security Audit
export const getSecurityAuditController = withNotificationContext(async (req: Request, res: Response) => {
  const result = await notificationsSettingsService.getSecurityAudit(req.user?.userId!);
  if (!result) throw new NotFoundError('Security audit not found');

  ResponseUtil.success(res, result, 'Security audit fetched');
});