// routers/notificationsSettings.router.js
import express, { NextFunction } from 'express';
import { body, param, query } from 'express-validator';
import { createRateLimiter } from '@/Mentorship/middlewares/rateLimit.middleware';
import ResponseUtil from '@/shared/response.util';
import AuthMiddleware from '@/shared/middlewares/auth.middleware';
import { rateLimitGeneral, rateLimitNotification } from '@/Mentorship/middlewares/rateLimit.middleware';
import { logger } from '@/shared/logger.util';
import { updateNotificationTimingController, lockAccountController, createDeadlineReminderController, getDNDStatusController, cancelExportController, addVIPCompanyController, unlockAccountController, downloadExportController, getDNDSettingsController, verify2FASetupController, changePasswordController, getExportStatusController, getExportHistoryController, getLoginActivityController, getSecurityAuditController, removeVIPCompanyController, updateVIPCompanyController, getTrustedDevicesController, requestDataExportController, generateBackupCodesController, getEmailPreferencesController, getSecuritySettingsController, getVIPCompanyAlertsController, resetAlertFrequencyController, revokeTrustedDeviceController, getDeadlineRemindersController, getProfileVisibilityController, getUpcomingDeadlinesController, updateAlertFrequencyController, getEngagementAnalysisController, deleteDeadlineReminderController, extendAnonymousSessionController, updateDeadlineReminderController, updateEmailPreferencesController, updateSecuritySettingsController, updateCategoryFrequencyController, enableAnonymousBrowsingController, updateEmailSubscriptionController, updateProfileVisibilityController, disableAnonymousBrowsingController, getAlertFrequencySettingsController, getAnonymousBrowsingStatusController, getAnonymousSessionHistoryController, getEmailSubscriptionStatusController, getOptimalNotificationTimeController, updateDoNotDisturbSettingsController, getNotificationTimingSettingsController } from '@/Job-Service/controllers';
import { disable2FAController, enable2FAController, getVIPCompaniesController } from '@/Job-Service/controllers/premium/notificationSetting.controller';

const router = express.Router();

// const rateLimitGeneral = createRateLimiter(15 * 60 * 1000, 100);
// const rateLimitGeneral = createRateLimiter(60 * 60 * 1000, 10);
// const rateLimitNotification = createRateLimiter(60 * 60 * 1000, 3);
// const vipLimit = createRateLimiter(60 * 60 * 1000, 20);
// const notificationLimit = createRateLimiter(60 * 60 * 1000, 50);
// const validateUUID = param('id').isUUID().withMessage('Invalid ID format');

const validateTimezone = body('timezone').isString().isLength({ min: 3, max: 50 });
const validateEmail = body('emailAddress').isEmail().withMessage('Invalid email address');
const validatePassword = body('newPassword').isStrongPassword({
  minLength: 8,
  minLowercase: 1,
  minUppercase: 1,
  minNumbers: 1,
  minSymbols: 1
}).withMessage('Password must be at least 8 characters with uppercase, lowercase, number and symbol');

const validateTimeFormat = body('*.startTime').matches(/^([01]\d|2[0-3]):([0-5]\d)$/).withMessage('Invalid time format (HH:MM)');
const validate2FAToken = body('token').isLength({ min: 6, max: 6 }).isNumeric().withMessage('Invalid 2FA token');
const validateCompanyId = body('companyId').isString().isLength({ min: 1, max: 100 }).withMessage('Invalid company ID');

router.use(AuthMiddleware.authenticate as any);

// SMART NOTIFICATION TIMING ROUTES (101)
router.put('/notifications/timing', rateLimitNotification, [
  validateTimezone,
  body('preferredTimes').isObject(),
  body('weekdayPreferences').isArray({ min: 1, max: 7 }),
  body('maxNotificationsPerHour').isInt({ min: 1, max: 10 })
], updateNotificationTimingController);

router.get('/notifications/timing', rateLimitGeneral, getNotificationTimingSettingsController);

router.get('/notifications/optimal-time', rateLimitGeneral, getOptimalNotificationTimeController);

router.get('/notifications/engagement-analysis', rateLimitGeneral, getEngagementAnalysisController);

// DO NOT DISTURB MODE ROUTES (102)
// router.put('/notifications/dnd', rateLimitGeneral, [
//   body('enabled').isBoolean(),
//   body('schedules').optional().isArray({ max: 5 }),
//   body('schedules.*.days').isArray({ min: 1, max: 7 }),
//   validateTimeFormat,
//   body('allowEmergencyNotifications').optional().isBoolean(),
//   body('emergencyKeywords').optional().isArray({ max: 10 })
// ], updateDNDSettingsController);

router.get('/notifications/dnd', rateLimitGeneral, getDNDSettingsController);

router.get('/notifications/dnd/status', rateLimitGeneral, getDNDStatusController);
// VIP COMPANY ALERTS ROUTES (103)
router.post('/notifications/vip-companies', rateLimitNotification, [
  validateCompanyId,
  body('companyName').isString().isLength({ min: 1, max: 200 }),
  body('alertTypes').isArray({ min: 1 }),
  body('priority').optional().isIn(['high', 'medium', 'low']),
  body('jobRoleFilters').optional().isArray({ max: 20 }),
  body('locationFilters').optional().isArray({ max: 10 })
], addVIPCompanyController);

router.get('/notifications/vip-companies', rateLimitGeneral, getVIPCompaniesController);

router.put('/notifications/vip-companies/:companyId', rateLimitGeneral, [
  param('companyId').isString().isLength({ min: 1, max: 100 }),
  body('alertTypes').optional().isArray({ min: 1 }),
  body('priority').optional().isIn(['high', 'medium', 'low'])
], updateVIPCompanyController);

router.delete('/notifications/vip-companies/:companyId', rateLimitGeneral, [
  param('companyId').isString().isLength({ min: 1, max: 100 })
], removeVIPCompanyController);
router.get('/notifications/vip-companies/:companyId/alerts', rateLimitGeneral, [
  param('companyId').isString()
], getVIPCompanyAlertsController);

// APPLICATION DEADLINE REMINDERS ROUTES (104)
router.post('/notifications/deadline-reminders', rateLimitGeneral, [
  body('jobId').isString().notEmpty(),
  body('jobTitle').isString().isLength({ min: 1, max: 200 }),
  body('companyName').isString().isLength({ min: 1, max: 200 }),
  body('applicationDeadline').isISO8601().toDate(),
  body('reminderSettings.firstReminder').isIn([1, 2, 3, 7, 14]),
  body('reminderSettings.secondReminder').isIn([1, 2, 3]),
  body('reminderSettings.finalReminder').isIn([1, 6, 12, 24]),
  body('notificationChannels').isArray({ min: 1 }),
  body('priority').optional().isIn(['high', 'medium', 'low'])
], createDeadlineReminderController);

router.get('/notifications/deadline-reminders', rateLimitGeneral, getDeadlineRemindersController);

router.get('/notifications/deadline-reminders/upcoming', rateLimitGeneral, [
  query('days').optional().isInt({ min: 1, max: 30 })
], getUpcomingDeadlinesController);

router.put('/notifications/deadline-reminders/:reminderId', rateLimitGeneral, [
  param('reminderId').isUUID(),
  body('reminderSettings').optional().isObject(),
  body('priority').optional().isIn(['high', 'medium', 'low']),
  body('notificationChannels').optional().isArray({ min: 1 })
], updateDeadlineReminderController);

router.delete('/notifications/deadline-reminders/:reminderId', rateLimitGeneral, [
  param('reminderId').isUUID()
], deleteDeadlineReminderController);

// PROFILE VISIBILITY CONTROLS ROUTES (105)
router.put('/profile/visibility', rateLimitGeneral, [
  body('profileVisibility').isIn(['public', 'private', 'network_only', 'recruiters_only']),
  body('searchableByRecruiters').optional().isBoolean(),
  body('showInCompanySearch').optional().isBoolean(),
  body('allowDirectMessages').optional().isBoolean(),
  body('hideFromCurrentEmployer').optional().isBoolean(),
  body('currentEmployerDomains').optional().isArray({ max: 10 }),
  body('blockedCompanies').optional().isArray({ max: 50 }),
  body('visibleFields').optional().isObject()
], updateProfileVisibilityController);

router.get('/profile/visibility', rateLimitGeneral, getProfileVisibilityController);

// ANONYMOUS BROWSING ROUTES (106)
router.post('/profile/anonymous/enable', rateLimitGeneral, [
  body('enabled').isBoolean(),
  body('sessionDuration').isInt({ min: 15, max: 480 }),
  body('trackingPreferences').optional().isObject(),
  body('autoExpire').optional().isBoolean()
], enableAnonymousBrowsingController);

router.post('/profile/anonymous/disable', rateLimitGeneral, disableAnonymousBrowsingController);

router.get('/profile/anonymous/status', rateLimitGeneral, getAnonymousBrowsingStatusController);
router.put('/profile/anonymous/session/:sessionId/extend', rateLimitGeneral, [
  param('sessionId').isUUID(),
  body('duration').isInt({ min: 15, max: 480 })
], extendAnonymousSessionController);

router.get('/profile/anonymous/history', rateLimitGeneral, [
  query('limit').optional().isInt({ min: 1, max: 50 }),
  query('offset').optional().isInt({ min: 0 })
], getAnonymousSessionHistoryController);

// JOB ALERT FREQUENCY ROUTES (107)
router.put('/notifications/alert-frequency', rateLimitGeneral, [
  body('globalFrequency').isIn(['instant', 'hourly', 'daily', 'weekly', 'monthly', 'disabled']),
  body('categoryFrequencies').optional().isObject(),
  body('quietHours').optional().isObject(),
  body('weekendDelivery').optional().isBoolean(),
  body('maxAlertsPerDay').optional().isInt({ min: 1, max: 50 })
], updateAlertFrequencyController);

router.get('/notifications/alert-frequency', rateLimitGeneral, getAlertFrequencySettingsController);

router.put('/notifications/alert-frequency/category/:category', rateLimitGeneral, [
  param('category').isIn(['newJobs', 'jobRecommendations', 'applicationUpdates', 'companyUpdates', 'networkActivity', 'marketInsights', 'learningOpportunities']),
  body('frequency').isIn(['instant', 'hourly', 'daily', 'weekly', 'monthly', 'disabled'])
], updateCategoryFrequencyController);

router.post('/notifications/alert-frequency/reset', rateLimitGeneral, resetAlertFrequencyController);

// EMAIL PREFERENCES ROUTES (108)
router.put('/notifications/email-preferences', rateLimitGeneral, [
  body('emailAddress').isEmail(),
  body('globalEmailEnabled').optional().isBoolean(),
  body('subscriptions').optional().isObject(),
  body('emailFormat').optional().isIn(['html', 'text', 'both']),
  body('frequency').optional().isObject()
], updateEmailPreferencesController);

router.get('/notifications/email-preferences', rateLimitGeneral, getEmailPreferencesController);

router.put('/notifications/email-preferences/subscription/:category', rateLimitGeneral, [
  param('category').isIn(['jobAlerts', 'applicationUpdates', 'companyNews', 'weeklyDigest', 'monthlyReport', 'marketingEmails', 'partnerOffers', 'surveyInvitations', 'productUpdates', 'securityAlerts']),
  body('enabled').isBoolean()
], updateEmailSubscriptionController);

router.get('/notifications/email-preferences/status', rateLimitGeneral, getEmailSubscriptionStatusController);

// router.get('/unsubscribe/:token', unsubscribeEmail);

// router.get('/verify-email/:token', verifyEmail);

// DATA EXPORT ROUTES (109)
router.post('/data/export', rateLimitNotification, [
  body('exportType').isIn(['full', 'profile', 'applications', 'search_history', 'preferences', 'analytics']),
  body('format').isIn(['json', 'csv', 'xml', 'pdf']),
  body('dateRange').optional().isObject(),
  body('dateRange.startDate').optional().isISO8601().toDate(),
  body('dateRange.endDate').optional().isISO8601().toDate(),
  body('includeDeleted').optional().isBoolean(),
  body('anonymize').optional().isBoolean(),
  body('deliveryMethod').optional().isIn(['download', 'email', 'secure_link'])
], requestDataExportController);

router.get('/data/export', rateLimitGeneral, [
  query('limit').optional().isInt({ min: 1, max: 50 }),
  query('offset').optional().isInt({ min: 0 })
], getExportHistoryController);

router.get('/data/export/:exportId/status', rateLimitGeneral, [
  param('exportId').isUUID()
], getExportStatusController);

router.get('/data/export/:exportId/download', rateLimitGeneral, [
  param('exportId').isUUID()
], downloadExportController);
router.delete('/data/export/:exportId', rateLimitGeneral, [
  param('exportId').isUUID()
], cancelExportController);

// ACCOUNT SECURITY ROUTES (110)
router.get('/account/security', rateLimitGeneral, getSecuritySettingsController);

router.put('/account/security', rateLimitGeneral, [
  body('currentPassword').optional().isString().notEmpty(),
  body('newPassword').optional().isStrongPassword({
    minLength: 8,
    minLowercase: 1,
    minUppercase: 1,
    minNumbers: 1,
    minSymbols: 1
  }),
  body('twoFactorAuth').optional().isObject(),
  body('loginNotifications').optional().isBoolean(),
  body('sessionTimeout').optional().isInt({ min: 15, max: 1440 }),
  body('allowMultipleSessions').optional().isBoolean(),
  body('ipWhitelist').optional().isArray({ max: 10 }),
  body('deviceTrust').optional().isBoolean()
], updateSecuritySettingsController);

router.post('/account/password/change', rateLimitGeneral, [
  body('currentPassword').isString().notEmpty(),
  body('newPassword').isStrongPassword({
    minLength: 8,
    minLowercase: 1,
    minUppercase: 1,
    minNumbers: 1,
    minSymbols: 1
  })
], changePasswordController);

router.post('/account/2fa/enable', rateLimitGeneral, [
  body('method').isIn(['sms', 'email', 'authenticator']),
  body('phoneNumber').optional()
  // .isMobilePhone().withMessage('Invalid phone number')
], enable2FAController);

router.post('/account/2fa/verify', rateLimitGeneral, [
  body('token').isLength({ min: 6, max: 6 }).isNumeric(),
  body('secret').optional().isString().isLength({ min: 16, max: 32 })
], verify2FASetupController);

router.post('/account/2fa/disable', rateLimitGeneral, [
  body('currentPassword').isString().notEmpty()
], disable2FAController);

router.post('/account/2fa/backup-codes/generate', rateLimitGeneral, [
  body('currentPassword').isString().notEmpty()
], generateBackupCodesController);

router.get('/account/security/activity', rateLimitGeneral, [
  query('limit').optional().isInt({ min: 1, max: 100 }),
  query('offset').optional().isInt({ min: 0 })
], getLoginActivityController);

router.get('/account/security/devices', rateLimitGeneral, getTrustedDevicesController);

router.delete('/account/security/devices/:deviceId', rateLimitGeneral, [
  param('deviceId').isString().notEmpty()
], revokeTrustedDeviceController);

router.post('/account/security/lock', rateLimitGeneral, [
  body('reason').isString().isLength({ min: 1, max: 200 }),
  body('duration').optional().isInt({ min: 300, max: 86400 })
], lockAccountController);

router.post('/account/security/unlock', rateLimitGeneral, [
  body('currentPassword').isString().notEmpty()
], unlockAccountController);

router.get('/account/security/audit', rateLimitGeneral, getSecurityAuditController);

// Health Check
// router.get('/health', (req, res) => {
//   res.status(HTTP_STATUS.OK).json({
//     success: true,
//     message: 'Notifications & Settings service is healthy',
//     timestamp: new Date().toISOString(),
//     version: '1.0.0'
//   });
// });

// router.get('/ready', async (req, res) => {
//   try {
//     const redisStatus = await redisClient.ping() === 'PONG';
//     const mongoStatus = mongoose.connection.readyState === 1;
    
//     if (redisStatus && mongoStatus) {
//       res.status(HTTP_STATUS.OK).json({
//         success: true,
//         message: 'Service is ready',
//         dependencies: {
//           redis: redisStatus,
//           mongodb: mongoStatus
//         }
//       });
//     } else {
//       res.status(HTTP_STATUS.SERVICE_UNAVAILABLE).json({
//         success: false,
//         message: 'Service dependencies not ready',
//         dependencies: {
//           redis: redisStatus,
//           mongodb: mongoStatus
//         }
//       });
//     }
//   } catch (error : any) {
//     res.status(HTTP_STATUS.SERVICE_UNAVAILABLE).json({
//       success: false,
//       message: 'Service not ready',
//       error: error.message
//     });
//   }
// });

// Error handling middleware
// router.use((error: any, req: Request, res: Response, next: NextFunction) => {
//   logger.error('Unhandled route error:', error);
  
//   if (error.type === 'validation') {
//     return ResponseUtil.validationError(res, 'VALIDATION_FAILED');
//   }

//   ResponseUtil.internalError(res, 'INTERNAL_SERVER_ERROR');
// });

// 404 handler


router.use('*', (req, res) => {
  ResponseUtil.notFound(res, 'Route not found');
});

export default router;