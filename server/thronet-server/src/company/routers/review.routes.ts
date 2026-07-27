import { Router } from 'express';
import { companyReviewController } from '../controllers';
import AuthMiddleware from '@/shared/middlewares/auth.middleware';
import validationMiddleware from '@/shared/middlewares/validation.middleware';
import { reviewValidators } from '../validations/company.validation';
import { resolveReviewUUID } from '../middlewares/resolveReviewId.middleware';
import { resolveCompanyUUID } from '../middlewares/resolveCompanyId.middleware';

const router = Router();

// ── SPECIFIC ROUTES FIRST ──
router.get('/get-all-reviews',
  AuthMiddleware.authenticate as any,
  validationMiddleware.validateQueryJoi(reviewValidators.query),
  companyReviewController.getAllReviews as any
);

// ✅ /company/:companyId — resolveCompanyUUID
router.get('/get-company-reviews/:companyId',
  AuthMiddleware.authenticate as any,
  validationMiddleware.validateParamsJoi(reviewValidators.companyId),
  resolveCompanyUUID,
  companyReviewController.getCompanyReviews as any
);

// ✅ /get-company-stats/:companyId — resolveCompanyUUID
router.get('/get-company-stats/:companyId',
  AuthMiddleware.authenticate as any,
  validationMiddleware.validateParamsJoi(reviewValidators.companyId),
  resolveCompanyUUID,
  companyReviewController.getCompanyStats as any
);

router.post('/create-review',
  AuthMiddleware.authenticate as any,
  validationMiddleware.validateJoi(reviewValidators.create),
  companyReviewController.createReview as any
);

// ── /:id ROUTES — resolveReviewUUID ──
router.get(
  '/get-reviewby-id/:id',
  validationMiddleware.validateParamsJoi(reviewValidators.id),
  resolveReviewUUID,
  companyReviewController.getReviewById as any
);

router.put(
  '/update-review/:id',
  AuthMiddleware.authenticate as any,
  validationMiddleware.validateParamsJoi(reviewValidators.id),
  resolveReviewUUID,
  validationMiddleware.validateJoi(reviewValidators.update),
  companyReviewController.updateReview as any
);

router.delete('/delete-review/:id',
  AuthMiddleware.authenticate as any,
  validationMiddleware.validateParamsJoi(reviewValidators.id),
  resolveReviewUUID,
  companyReviewController.deleteReview as any
);

router.patch('/:id/vote',
  AuthMiddleware.authenticate as any,
  validationMiddleware.validateParamsJoi(reviewValidators.id),
  validationMiddleware.validateJoi(reviewValidators.vote),
  resolveReviewUUID,
  companyReviewController.voteReview as any
);

router.post('/:id/response',
  AuthMiddleware.authenticate as any,
  AuthMiddleware.authorize('admin', 'company-admin') as any,
  validationMiddleware.validateParamsJoi(reviewValidators.id),
  validationMiddleware.validateJoi(reviewValidators.addResponse),
  resolveReviewUUID,
  companyReviewController.addCompanyResponse as any
);

router.patch('/:id/moderate',
  AuthMiddleware.authenticate as any,
  AuthMiddleware.authorize('admin') as any,
  validationMiddleware.validateParamsJoi(reviewValidators.id),
  validationMiddleware.validateJoi(reviewValidators.moderate),
  resolveReviewUUID,
  companyReviewController.moderateReview as any
);

export default router;