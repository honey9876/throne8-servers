import { Router } from 'express';
import MentorController from '../controllers/mentor.controller';
import AuthMiddleware from '@/shared/middlewares/auth.middleware';
import { uploadSingle, uploadFields } from '@/shared/upload/upload';

const router = Router();

// Create new mentor profile
router.post('/create', AuthMiddleware.authenticate, uploadSingle('profilePic'), MentorController.createProfile);

// Get current user's mentor profile
router.get('/me', AuthMiddleware.authenticate, MentorController.getMyProfile);

// Get all mentors (with pagination & filters)
router.get('/all', AuthMiddleware.authenticateOptional, MentorController.getAllMentors);

// Get specific mentor by ID
router.get('/:id', AuthMiddleware.authenticateOptional, MentorController.getProfile);

// Get mentor by user ID
router.get('/user/:userId', AuthMiddleware.authenticateOptional, MentorController.getProfileByUserId);

// Update mentor profile
router.put('/:id', AuthMiddleware.authenticate, uploadFields([{ name: 'profilePic', maxCount: 1 }, { name: 'bannerImage', maxCount: 1 }]), MentorController.updateProfile);

// Delete mentor profile
router.delete('/:id', AuthMiddleware.authenticate, MentorController.deleteProfile);

// Approve mentor (Admin)
router.patch('/:mentorId/approve', AuthMiddleware.authenticate, MentorController.approveMentor);

// Get mentor stats
router.get('/:id/stats', MentorController.getMentorStats);

export default router;
