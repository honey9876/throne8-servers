// routers/seniorMentorApplication.routes.ts
import { NextFunction, Request, Response, Router } from 'express';
import seniorMentorApplicationController from '../controllers/seniorMentorApplication.controller';
import AuthMiddleware from '@/shared/middlewares/auth.middleware';
import { validate } from '@/shared/middlewares/validation.middleware';
import SeniorMentorApplicationValidator from '../validations/seniorMentorApplication.validator';
import { uploadFields } from '@/shared/upload/upload';

const router = Router();

// Multipart form fields (otherSkills, technologies, achievements, certifications,
// helpAreas) arrive as JSON strings from the client — parse them back to arrays
// before validation runs. Same pattern used in mentor.routes.ts.
const parseFormDataFields = (req: Request, _res: Response, next: NextFunction): void => {
  const fieldsToParse = ['otherSkills', 'technologies', 'achievements', 'certifications', 'helpAreas'];

  for (const field of fieldsToParse) {
    const body = req.body as Record<string, any>;
    if (body[field] && typeof body[field] === 'string') {
      try {
        body[field] = JSON.parse(body[field]);
      } catch (e) {
        // leave as-is — validator will reject it
      }
    }
  }
  next();
};

const applicationFileUpload = uploadFields([
  { name: 'profilePhoto', maxCount: 1 },
  { name: 'resume', maxCount: 1 },
  { name: 'proofDocument', maxCount: 1 },
]);

/**
 * @route   POST /api/v1/mentorship/senior-mentor-applications/apply
 * @desc    Submit a "Become Senior Mentor" application
 * @access  Private
 */
router.post(
  '/apply',
  AuthMiddleware.authenticate as any,
  applicationFileUpload,
  parseFormDataFields as any,
  validate(SeniorMentorApplicationValidator.apply()),
  seniorMentorApplicationController.apply as any
);

/**
 * @route   GET /api/v1/mentorship/senior-mentor-applications/me
 * @desc    Get the current user's own application
 * @access  Private
 */
router.get(
  '/me',
  AuthMiddleware.authenticate as any,
  seniorMentorApplicationController.getMyApplication as any
);

/**
 * @route   PUT /api/v1/mentorship/senior-mentor-applications/me
 * @desc    Update the current user's own application (blocked once verified)
 * @access  Private
 */
router.put(
  '/me',
  AuthMiddleware.authenticate as any,
  validate(SeniorMentorApplicationValidator.update()),
  seniorMentorApplicationController.updateMyApplication as any
);

/**
 * @route   DELETE /api/v1/mentorship/senior-mentor-applications/me
 * @desc    Withdraw the current user's own application
 * @access  Private
 */
router.delete(
  '/me',
  AuthMiddleware.authenticate as any,
  seniorMentorApplicationController.withdrawMyApplication as any
);

/**
 * @route   GET /api/v1/mentorship/senior-mentor-applications
 * @desc    List all applications with filters (admin review queue)
 * @access  Private (Admin)
 */
router.get(
  '/',
  AuthMiddleware.authenticate as any,
  AuthMiddleware.authorize('admin') as any,
  validate(SeniorMentorApplicationValidator.list()),
  seniorMentorApplicationController.list as any
);

/**
 * @route   GET /api/v1/mentorship/senior-mentor-applications/:id
 * @desc    Get a single application by ID
 * @access  Private (Admin)
 */
router.get(
  '/:id',
  AuthMiddleware.authenticate as any,
  AuthMiddleware.authorize('admin') as any,
  validate(SeniorMentorApplicationValidator.getById()),
  seniorMentorApplicationController.getById as any
);

/**
 * @route   POST /api/v1/mentorship/senior-mentor-applications/:id/under-review
 * @desc    Mark a pending application as under review
 * @access  Private (Admin)
 */
router.post(
  '/:id/under-review',
  AuthMiddleware.authenticate as any,
  AuthMiddleware.authorize('admin') as any,
  validate(SeniorMentorApplicationValidator.getById()),
  seniorMentorApplicationController.markUnderReview as any
);

/**
 * @route   POST /api/v1/mentorship/senior-mentor-applications/:id/approve
 * @desc    Approve an application
 * @access  Private (Admin)
 */
router.post(
  '/:id/approve',
  AuthMiddleware.authenticate as any,
  AuthMiddleware.authorize('admin') as any,
  validate(SeniorMentorApplicationValidator.getById()),
  seniorMentorApplicationController.approve as any
);

/**
 * @route   POST /api/v1/mentorship/senior-mentor-applications/:id/reject
 * @desc    Reject an application with a reason
 * @access  Private (Admin)
 */
router.post(
  '/:id/reject',
  AuthMiddleware.authenticate as any,
  AuthMiddleware.authorize('admin') as any,
  validate([...SeniorMentorApplicationValidator.getById(), ...SeniorMentorApplicationValidator.reject()]),
  seniorMentorApplicationController.reject as any
);

export default router;
