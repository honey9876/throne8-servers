import { Router } from 'express';
import { followerController } from '../controllers';
import AuthMiddleware from '@/shared/middlewares/auth.middleware';
import validationMiddleware from '@/shared/middlewares/validation.middleware';
import { followerValidators } from '../validations/company.validation';
import { resolveCompanyUUID } from '../middlewares/resolveCompanyId.middleware';
import { resolveEmployeeUUID } from '../middlewares/resolveEmployeeId.middleware';

const router = Router();

// ── NO /:id routes — specific paths only ──

router.post('/follow',
  AuthMiddleware.authenticate as any,
  validationMiddleware.validateJoi(followerValidators.follow),
  followerController.followCompany
);

router.get('/suggestions',
  AuthMiddleware.authenticate as any,
  validationMiddleware.validateQueryJoi(followerValidators.suggestionsQuery),
  followerController.getFollowSuggestions
);

router.patch('/preferences',
  AuthMiddleware.authenticate as any,
  validationMiddleware.validateJoi(followerValidators.updatePreferences),
  followerController.updateNotificationPreferences
);

// ✅ /unfollow/:companyId — resolveCompanyUUID
router.delete('/unfollow/:companyId',
  AuthMiddleware.authenticate as any,
  validationMiddleware.validateParamsJoi(followerValidators.companyId),
  resolveCompanyUUID,
  followerController.unfollowCompany
);

// ✅ /company/:companyId routes — resolveCompanyUUID
router.get('/company/:companyId',
  validationMiddleware.validateParamsJoi(followerValidators.companyId),
  resolveCompanyUUID,
  validationMiddleware.validateQueryJoi(followerValidators.paginationQuery),
  followerController.getCompanyFollowers
);

router.get('/check/:companyId',
  AuthMiddleware.authenticate as any,
  validationMiddleware.validateParamsJoi(followerValidators.companyId),
  resolveCompanyUUID,
  followerController.checkFollowingStatus
);

router.get('/stats/:companyId',
  validationMiddleware.validateParamsJoi(followerValidators.companyId),
  resolveCompanyUUID,
  followerController.getFollowerStats
);

router.get('/:companyId/followers/count',
  validationMiddleware.validateParamsJoi(followerValidators.companyId),
  resolveCompanyUUID,
  followerController.getFollowerStats
);

router.get('/mutual/:companyId',
  AuthMiddleware.authenticate as any,
  validationMiddleware.validateParamsJoi(followerValidators.companyId),
  resolveCompanyUUID,
  followerController.getMutualFollowers
);

router.get('/recent/:companyId',
  validationMiddleware.validateParamsJoi(followerValidators.companyId),
  resolveCompanyUUID,
  validationMiddleware.validateQueryJoi(followerValidators.recentQuery),
  followerController.getRecentFollowers
);

// ✅ /user/:userId — resolveEmployeeUUID
router.get('/user/:userId',
  validationMiddleware.validateParamsJoi(followerValidators.userId),
  resolveEmployeeUUID,
  validationMiddleware.validateQueryJoi(followerValidators.paginationQuery),
  followerController.getUserFollowing
);

export default router;