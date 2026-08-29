/**
 * ====================================
 * DOUBT ROUTES (FIXED)
 * ====================================
 */

import express from 'express';
import  doubtController  from '../controllers/doubt.controller';
import AuthMiddleware from '@/shared/middlewares/auth.middleware';
import { isMember } from '../middleware/groupAccess.middleware';
import { validation } from '@/shared/middlewares/validation.middleware';
import {
  createDoubtSchema,
  updateDoubtSchema,
  answerDoubtSchema,
  updateAnswerSchema,
  tagMembersSchema,
  searchDoubtsSchema,
} from '../validators/doubt.validator';
import { uploadMultiple } from '@/shared/upload/upload';

const router = express.Router();

// doubtController
// .Doubt
//  routes
router.post(
  '/:groupId/post', 
  AuthMiddleware.authenticate as any,
   isMember, 
   uploadMultiple('images', 5), 
   validation(createDoubtSchema), 
  doubtController.postDoubt
);
router.get(
  '/:doubtId', 
  AuthMiddleware.authenticate as any,
  doubtController.getDoubt
);
router.get(
  '/:groupId/all', 
  AuthMiddleware.authenticate as any,
   isMember, 
  doubtController.getAllDoubts
);
router.get(
  '/user/my-doubts', 
  AuthMiddleware.authenticate as any,

  doubtController.getMyDoubts
);
router.get(
  '/:groupId/solved', 
  AuthMiddleware.authenticate as any,
   isMember, 
  doubtController.getSolvedDoubts
);
router.get(
  '/:groupId/unsolved', 
  AuthMiddleware.authenticate as any,
   isMember, 
  doubtController.getUnsolvedDoubts
);
router.get(
  '/:groupId/urgent', 
  AuthMiddleware.authenticate as any,
   isMember, 
  doubtController.getUrgentDoubts
);
router.put(
  '/:doubtId', 
  AuthMiddleware.authenticate as any,
   validation(updateDoubtSchema), 
  doubtController.updateDoubt
);
router.delete(
  '/:doubtId', 
  AuthMiddleware.authenticate as any,

  doubtController.deleteDoubt
);
router.patch(
  '/:doubtId/mark-solved', 
  AuthMiddleware.authenticate as any,

  doubtController.markAsSolved
);
router.get(
  '/search/query', 
  AuthMiddleware.authenticate as any,
   validation(searchDoubtsSchema, 'query'), 
  doubtController.searchDoubts
);
router.get(
  '/category/:category', 
  AuthMiddleware.authenticate as any,

  doubtController.getDoubtsByCategory
);
router.post(
  '/:doubtId/tag-member', 
  AuthMiddleware.authenticate as any,
   validation(tagMembersSchema), 
  doubtController.tagMember
);
router.get(
  '/:groupId/stats', 
  AuthMiddleware.authenticate as any,
   isMember, 
  doubtController.getGroupDoubtStats
);
router.get(
  '/user/:userId/stats', 
  AuthMiddleware.authenticate as any,
   doubtController.getUserDoubtStats
  );

router.post(
  '/:doubtId/answer', 
  AuthMiddleware.authenticate as any,
   uploadMultiple('images', 3),
    validation(answerDoubtSchema), 
  doubtController.answerDoubt
);
router.get(
  '/:doubtId/answers', 
  AuthMiddleware.authenticate as any,
  doubtController.getDoubtAnswers
);
router.put(
  '/answer/:answerId', 
  AuthMiddleware.authenticate as any,
   validation(updateAnswerSchema), 
  doubtController.updateAnswer
);
router.delete(
  '/answer/:answerId', 
  AuthMiddleware.authenticate as any,

  doubtController.deleteAnswer
);
router.post(
  '/answer/:answerId/upvote', 
  AuthMiddleware.authenticate as any,

  doubtController.upvoteAnswer
);
router.post(
  '/answer/:answerId/downvote', 
  AuthMiddleware.authenticate as any,

  doubtController.downvoteAnswer
);
router.post(
  '/answer/:answerId/remove-vote', 
  AuthMiddleware.authenticate as any,

  doubtController.removeVote
);
router.get(
  '/answers/top-answerers', 
  doubtController.getTopAnswerers
);
router.get(
  '/answers/best-answers', 
  doubtController.getBestAnswers
);
router.get(
  '/answers/user/:userId/stats', 
  AuthMiddleware.authenticate as any,
   doubtController.getUserAnswerStats
  );

export default router;