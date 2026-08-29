// controller/premiumExtended.controller.ts
import { Request, Response, NextFunction } from 'express';
import { validate as uuidValidate } from 'uuid';
import { premiumExtendedService } from '@/Job-Service/services';
// import { sanitizeInput, generateSecureId } from '@/shared/security.js';
import { sanitizeInput, generateSecureId } from '@/shared/security';
import logger from '@/shared/logger.util.js';
import ResponseUtil from '@/shared/response.util.js';
import {
  ValidationError,
  NotFoundError,
  BadRequestError,
  } from '@/shared/errors/app.error.js';

// Reusable context helper
const withPremiumExtendedContext = (handler: (req: Request, res: Response) => Promise<void>) =>
  async (req: Request, res: Response, next: NextFunction) => {
    const requestId = generateSecureId();
    const startTime = Date.now();

    try {
      await handler(req, res);
    } catch (err) {
      next(err);
    } finally {
      const duration = Date.now() - startTime;
      if (duration > 1000) {
        logger.warn(`[${requestId}] Slow premium extended operation`, { duration });
      }
    }
  };

// Helper: Validate UUID
const validateUUID = (id: string, fieldName: string) => {
  if (!id || !uuidValidate(id)) {
    throw new ValidationError(`Invalid ${fieldName}: must be a valid UUID`);
  }
};

// POST - Create Follow-up Reminder
export const createFollowUpReminderController = withPremiumExtendedContext(async (req: Request, res: Response) => {
  const { applicationId, reminderDate, message, type } = req.body;

  if (!applicationId || !reminderDate || !message || !type) {
    throw new ValidationError('Missing required fields: applicationId, reminderDate, message, type');
  }

  validateUUID(applicationId, 'Application ID');

  const result = await premiumExtendedService.createFollowUpReminder({
    ...req.body,
    userId: req.user?.userId!,
  });

  if (!result) throw new BadRequestError('Failed to create follow-up reminder');

  ResponseUtil.created(res, result, 'Follow-up reminder created successfully');
});

// GET - Get All Follow-up Reminders
export const getFollowUpRemindersController = withPremiumExtendedContext(async (req: Request, res: Response) => {
  const { status } = req.query;

  if (status && !['pending', 'completed', 'cancelled'].includes(status as string)) {
    throw new ValidationError('Invalid status: must be pending, completed, or cancelled');
  }

  const reminders = await premiumExtendedService.getFollowUpReminders(req.user?.userId!, status as string);

  if (!reminders || reminders.length === 0) {
    throw new NotFoundError('No follow-up reminders found');
  }

  ResponseUtil.success(res, reminders, 'Follow-up reminders retrieved successfully');
});

// POST - Create Interview Record
export const createInterviewController = withPremiumExtendedContext(async (req: Request, res: Response) => {
  const { applicationId, companyName, position, interviewDate, type } = req.body;

  if (!applicationId || !companyName || !position || !interviewDate || !type) {
    throw new ValidationError('Missing required fields: applicationId, companyName, position, interviewDate, type');
  }

  validateUUID(applicationId, 'Application ID');

  const result = await premiumExtendedService.createInterview({
    ...req.body,
    userId: req.user?.userId!,
  });

  if (!result) throw new BadRequestError('Failed to create interview record');

  ResponseUtil.created(res, result, 'Interview created successfully');
});

// PUT - Update Interview Status
export const updateInterviewStatusController = withPremiumExtendedContext(async (req: Request, res: Response) => {
  const { interviewId } = req.params;
  const { status, notes } = req.body;

  if (!interviewId || !status || !notes) {
    throw new ValidationError('Missing required fields: interviewId, status, notes');
  }

  validateUUID(interviewId, 'Interview ID');

  const result = await premiumExtendedService.updateInterviewStatus(interviewId, req.user?.userId!, status, notes);

  if (!result) throw new BadRequestError('Failed to update interview status');

  ResponseUtil.success(res, result, 'Interview status updated successfully');
});

// POST - Create Job Offer
export const createOfferController = withPremiumExtendedContext(async (req: Request, res: Response) => {
  const { applicationId, companyName, position } = req.body;

  if (!applicationId || !companyName || !position) {
    throw new ValidationError('Missing required fields: applicationId, companyName, position');
  }

  validateUUID(applicationId, 'Application ID');

  const result = await premiumExtendedService.createOffer({
    ...req.body,
    userId: req.user?.userId!,
  });

  if (!result) throw new BadRequestError('Failed to create offer');

  ResponseUtil.created(res, result, 'Offer created successfully');
});

// POST - Compare Multiple Offers
export const compareOffersController = withPremiumExtendedContext(async (req: Request, res: Response) => {
  const { offerIds } = req.body;

  if (!Array.isArray(offerIds) || offerIds.length === 0) {
    throw new ValidationError('offerIds must be a non-empty array');
  }

  offerIds.forEach(id => validateUUID(id, 'Offer ID'));

  const result = await premiumExtendedService.compareOffers(req.user?.userId!, offerIds);

  if (!result) throw new BadRequestError('Failed to compare offers');

  ResponseUtil.success(res, result, 'Offers compared successfully');
});

// POST - Create Application Note
export const createApplicationNoteController = withPremiumExtendedContext(async (req: Request, res: Response) => {
  const { applicationId, content } = req.body;

  if (!applicationId || !content) {
    throw new ValidationError('Missing required fields: applicationId, content');
  }

  validateUUID(applicationId, 'Application ID');

  const result = await premiumExtendedService.createApplicationNote({
    ...req.body,
    userId: req.user?.userId!,
  });

  if (!result) throw new BadRequestError('Failed to create application note');

  ResponseUtil.created(res, result, 'Application note created successfully');
});

// GET - Get Application Notes
export const getApplicationNotesController = withPremiumExtendedContext(async (req: Request, res: Response) => {
  const { applicationId } = req.params;

  validateUUID(applicationId, 'Application ID');

  const notes = await premiumExtendedService.getApplicationNotes(applicationId, req.user?.userId!);

  if (!notes || notes.length === 0) {
    throw new NotFoundError('No application notes found');
  }

  ResponseUtil.success(res, notes, 'Application notes retrieved successfully');
});

// POST - Create Batch Applications
export const createBatchApplicationController = withPremiumExtendedContext(async (req: Request, res: Response) => {
  const { jobIds, templateId } = req.body;

  if (!Array.isArray(jobIds) || jobIds.length === 0 || !templateId) {
    throw new ValidationError('jobIds must be a non-empty array and templateId is required');
  }

  jobIds.forEach(id => validateUUID(id, 'Job ID'));
  validateUUID(templateId, 'Template ID');

  const result = await premiumExtendedService.createBatchApplication({
    ...req.body,
    userId: req.user?.userId!,
  });

  if (!result) throw new BadRequestError('Failed to create batch applications');

  ResponseUtil.created(res, result, 'Batch applications queued successfully');
});

// POST - Create Application Template
export const createApplicationTemplateController = withPremiumExtendedContext(async (req: Request, res: Response) => {
  const { name, coverLetter } = req.body;

  if (!name || !coverLetter) {
    throw new ValidationError('Missing required fields: name, coverLetter');
  }

  const result = await premiumExtendedService.createApplicationTemplate({
    ...req.body,
    userId: req.user?.userId,
  });

  if (!result) throw new BadRequestError('Failed to create application template');

  ResponseUtil.created(res, result, 'Application template created successfully');
});

// GET - Calculate Application Score
export const calculateApplicationScoreController = withPremiumExtendedContext(async (req: Request, res: Response) => {
  const { applicationId } = req.params;

  if (!applicationId) throw new ValidationError('applicationId is required');

  validateUUID(applicationId, 'Application ID');

  const score = await premiumExtendedService.calculateApplicationScore(applicationId, req.user?.userId!);

  if (!score) throw new BadRequestError('Failed to calculate application score');

  ResponseUtil.success(res, score, 'Application score calculated successfully');
});

// PUT - Update Quick Apply Settings
export const updateQuickApplySettingsController = withPremiumExtendedContext(async (req: Request, res: Response) => {
  if (!req.body || Object.keys(req.body).length === 0) {
    throw new ValidationError('Request body cannot be empty');
  }

  const result = await premiumExtendedService.updateQuickApplySettings(req.user?.userId!, req.body);

  if (!result) throw new BadRequestError('Failed to update quick apply settings');

  ResponseUtil.success(res, result, 'Quick apply settings updated successfully');
});

// POST - Export Application Data
export const exportApplicationDataController = withPremiumExtendedContext(async (req: Request, res: Response) => {
  const { format, filters = {} } = req.body;

  if (!['json', 'csv', 'excel'].includes(format)) {
    throw new ValidationError('Invalid format: must be json, csv, or excel');
  }

  const result = await premiumExtendedService.exportApplicationData(req.user?.userId!, format, filters);

  if (!result) throw new BadRequestError('Failed to export application data');

  ResponseUtil.created(res, result, 'Application data export requested');
});

// POST - Create Thank You Note
export const createThankYouNoteController = withPremiumExtendedContext(async (req: Request, res: Response) => {
  const { interviewId, message } = req.body;

  if (!interviewId || !message) {
    throw new ValidationError('Missing required fields: interviewId, message');
  }

  validateUUID(interviewId, 'Interview ID');

  const result = await premiumExtendedService.createThankYouNote(interviewId, req.user?.userId!, message);

  if (!result) throw new BadRequestError('Failed to create thank you note');

  ResponseUtil.created(res, result, 'Thank you note created successfully');
});

// POST - Save Video Introduction
export const saveVideoIntroductionController = withPremiumExtendedContext(async (req: Request, res: Response) => {
  if (!req.file?.buffer) throw new ValidationError('Video file is required');

  if (!['video/mp4', 'video/webm'].includes(req.file.mimetype)) {
    throw new ValidationError('Invalid file type: must be mp4 or webm');
  }

  if (req.file.size > 100 * 1024 * 1024) {
    throw new ValidationError('File size exceeds 100MB limit');
  }

  if (!req.body.title) throw new ValidationError('Title is required');

  const result = await premiumExtendedService.saveVideoIntroduction(req.body, req.file.buffer);

  if (!result) throw new BadRequestError('Failed to save video introduction');

  ResponseUtil.created(res, result, 'Video introduction saved successfully');
});

// POST - Save Portfolio Attachment
export const savePortfolioAttachmentController = withPremiumExtendedContext(async (req: Request, res: Response) => {
  if (!req.file?.buffer) throw new ValidationError('Portfolio file is required');

  if (!['application/pdf', 'image/jpeg', 'image/png'].includes(req.file.mimetype)) {
    throw new ValidationError('Invalid file type: must be pdf, jpeg, or png');
  }

  if (req.file.size > 50 * 1024 * 1024) {
    throw new ValidationError('File size exceeds 50MB limit');
  }

  if (!req.body.title) throw new ValidationError('Title is required');

  const result = await premiumExtendedService.savePortfolioAttachment(req.body, req.file.buffer);

  if (!result) throw new BadRequestError('Failed to save portfolio attachment');

  ResponseUtil.created(res, result, 'Portfolio attachment saved successfully');
});

// POST - Create Reference
export const createReferenceController = withPremiumExtendedContext(async (req: Request, res: Response) => {
  const { name, email } = req.body;

  if (!name || !email) {
    throw new ValidationError('Missing required fields: name, email');
  }

  const result = await premiumExtendedService.createReference({
    ...req.body,
    userId: req.user?.userId!,
  });

  if (!result) throw new BadRequestError('Failed to create reference');

  ResponseUtil.created(res, result, 'Reference created successfully');
});