import { Router } from 'express';
import { mentorController } from '@/shared/controllers/index.controllers';
import AuthMiddleware from '@/shared/middlewares/auth.middleware';
import { validate } from '@/shared/middlewares/validation.middleware';
import MentorValidator from '../validations/mentor.validator';
import { uploadSingle } from '@/shared/upload/upload';
import type { NextFunction, Request, Response } from 'express';

const router = Router();

const authenticate = AuthMiddleware.authenticate as unknown as (req: Request, res: Response, next: NextFunction) => void;

const parseFormDataFields = (req: Request, res: Response, next: NextFunction): void => {
  const fieldsToParse = ['domains', 'skills', 'languages', 'experience', 'pricing', 'availability', 'socialProof', 'preferences'];
  const body = req.body as Record<string, any>;
  for (const field of fieldsToParse) {
    if (body[field] && typeof body[field] === 'string') {
      try { body[field] = JSON.parse(body[field]); } catch (e) { /* ignore */ }
    }
  }
  next();
};

router.post(
  '/create',
  authenticate,
  uploadSingle('profilePic'),
  parseFormDataFields,
  validate(MentorValidator.createMentor()),
  mentorController.createProfile as unknown as (req: Request, res: Response, next: NextFunction) => void
);

router.get('/me', authenticate, mentorController.getMyProfile as any);
router.get('/all', validate(MentorValidator.getPagination()), mentorController.getAllMentors as any);
router.get('/:id', validate(MentorValidator.getMentorById()), mentorController.getProfile as any);
router.get('/user/:userId', mentorController.getProfileByUserId as any);
router.get('/:id/stats', validate(MentorValidator.getMentorStats()), mentorController.getMentorStats as any);
router.put('/:id', authenticate, validate(MentorValidator.updateMentor()), mentorController.updateProfile as any);
router.delete('/:id', authenticate, validate(MentorValidator.deleteMentor()), mentorController.deleteProfile as any);
router.patch(
  '/:mentorId/approve',
  authenticate,
  AuthMiddleware.authorize('admin') as any,
  mentorController.approveMentor as any
);

export default router;