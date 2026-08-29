import { NextFunction, Request, Response, Router } from 'express';
import { mentorController } from '@/shared/controllers/index.controllers';
import AuthMiddleware from '@/shared/middlewares/auth.middleware';
import { validate } from '@/shared/middlewares/validation.middleware';
import MentorValidator from '../validations/mentor.validator';
import upload, { uploadSingle, uploadFields } from '@/shared/upload/upload';

const router = Router();

// ye middleware multer ke baad lagao
const parseFormDataFields = (req: Request, res: Response, next: NextFunction): void => {
  const fieldsToParse = ['domains', 'skills', 'languages', 'experience', 'pricing', 'availability', 'socialProof', 'preferences'];

  for (const field of fieldsToParse) {
    const body = req.body as Record<string, any>; // ✅ yeh line add karo
    if (body[field] && typeof body[field] === 'string') {
      try {
        body[field] = JSON.parse(body[field]);
      } catch (e) {
        // ignore
      }
    }
  }
  next();
};


/**
 * @route   POST /api/mentors
 * @desc    Create a new mentor profile
 * @access  Private
 */
router.post(
  '/create',
  AuthMiddleware.authenticate as any,
  uploadSingle('profilePic'),
  parseFormDataFields as any,
  validate(MentorValidator.createMentor()),
  mentorController.createProfile as any
);

// /**
//  * @route   GET /api/mentors/me
//  * @desc    Get current user's mentor profile
//  * @access  Private
//  */
router.get(
  '/me',
  AuthMiddleware.authenticate as any,
  mentorController.getMyProfile as any
);

/**
 * @route   GET /api/mentors/me/trust-score
 * @desc    Get current user's mentor trust score
 * @access  Private
 */
router.get(
  '/me/trust-score',
  AuthMiddleware.authenticate as any,
  mentorController.getTrustScore as any 
);

// /**
//  * @route   GET /api/mentors
//  * @desc    Get all mentors with filters and pagination
//  * @access  Public
//  */
router.get(
  '/all',
  validate(MentorValidator.getPagination()),
  mentorController.getAllMentors
);

/**
 * @route   GET /api/mentors/:id
 * @desc    Get mentor profile by ID
 * @access  Public
 */
router.get(
  '/:id',
  validate(MentorValidator.getMentorById()),
  mentorController.getProfile
);

// /**
//  * @route   GET /api/mentors/user/:userId
//  * @desc    Get mentor profile by user ID
//  * @access  Public
//  */
router.get(
  '/user/:userId',
  mentorController.getProfileByUserId
);

/**
 * @route   GET /api/mentors/:id/stats
 * @desc    Get mentor statistics
 * @access  Public
 */
router.get(
  '/:id/stats',
  validate(MentorValidator.getMentorStats()),
  mentorController.getMentorStats
);

/**
 * @route   PUT /api/mentors/:id
 * @desc    Update mentor profile
 * @access  Private (mentor owner only)
 */
router.put(
  '/:id',
  AuthMiddleware.authenticate as any,
  uploadFields([{ name: 'profilePic', maxCount: 1 }, { name: 'bannerImage', maxCount: 1 }]),
  parseFormDataFields as any,
  validate(MentorValidator.updateMentor()),
  mentorController.updateProfile as any
);

/**
 * @route   DELETE /api/mentors/:id
 * @desc    Delete mentor profile (soft delete)
 * @access  Private (mentor owner only)
 */
router.delete(
  '/:id',
  AuthMiddleware.authenticate as any,
  validate(MentorValidator.deleteMentor()),
  mentorController.deleteProfile as any
);

/**
 * @route   PATCH /api/mentors/:mentorId/approve
 * @desc    Admin: Approve mentor account (pending → active)
 * @access  Private (Admin only)
 */
router.patch(
  '/:mentorId/approve',
  AuthMiddleware.authenticate as any,
  AuthMiddleware.authorize('admin') as any,
  mentorController.approveMentor as any
);

export default router;