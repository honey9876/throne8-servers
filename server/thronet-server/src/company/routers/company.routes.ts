import { Router, Request, Response, NextFunction } from 'express';
import { companyController } from '../controllers';
import validationMiddleware from '@/shared/middlewares/validation.middleware';
import { aboutValidators, companyValidators } from '../validations/company.validation';
import { resolveCompanyUUID } from '../middlewares/resolveCompanyId.middleware';
import AuthMiddleware from '@/shared/middlewares/auth.middleware';
import { uploadSingle } from '@/shared/upload/upload';
import CompanyLogoController from '../controllers/companyLogo.controller';
import CompanyCoverController from '../controllers/companyCover.controller';
import CompanyAboutController from '../controllers/companyAbout.controller';
import companyActivityController from '../controllers/companyActivity.controller';

const router = Router();

// Type for controller methods
type ControllerMethod = (req: Request, res: Response, next?: NextFunction) => Promise<void>;

// Wrapper to handle any type safely
const handle = (fn: ControllerMethod) => (req: Request, res: Response, next: NextFunction) =>
  fn(req, res, next).catch(next);


router.use(AuthMiddleware.authenticate as any); // Apply authentication middleware to all routes
// ============================================
// PUBLIC ROUTES (SPECIFIC FIRST)
// No /:id param — resolveCompanyUUID NOT needed
// ============================================

router.get(
  '/search',
  validationMiddleware.validateQueryJoi(companyValidators.search),
  handle(companyController.search.bind(companyController) as ControllerMethod)
);

router.get(
  '/popular',
  handle(companyController.getPopular.bind(companyController) as ControllerMethod)
);

router.get(
  '/nearby',
  validationMiddleware.validateQueryJoi(companyValidators.nearby),
  handle(companyController.getNearby.bind(companyController) as ControllerMethod)
);

// ============================================
// SLUG ROUTE — no UUID resolution needed
// ============================================

router.get(
  '/:slug/slug',
  validationMiddleware.validateParamsJoi(companyValidators.slug),
  handle(companyController.getBySlug.bind(companyController) as ControllerMethod)
);

// ============================================
// ID-BASED ROUTES
// Order: validateParams (UUID check) → resolveCompanyUUID (UUID→ObjectId) → controller
// ============================================

router.get(
  '/:id/stats',
  validationMiddleware.validateParamsJoi(companyValidators.id),
  resolveCompanyUUID,
  handle(companyController.getStats.bind(companyController) as ControllerMethod)
);

router.get(
  '/:id/posts',
  validationMiddleware.validateParamsJoi(companyValidators.id),
  resolveCompanyUUID,
  handle(companyController.getPosts.bind(companyController) as ControllerMethod)
);

router.get(
  '/:id/followers',
  validationMiddleware.validateParamsJoi(companyValidators.id),
  resolveCompanyUUID,
  handle(companyController.getFollowers.bind(companyController) as ControllerMethod)
);

router.get(
  '/:id/activity',
  validationMiddleware.validateParamsJoi(companyValidators.id),
  resolveCompanyUUID,
  handle((req, res) => companyActivityController.getCompanyActivities(req as any, res))
);

router.patch(
  '/:id/activity/:activityId/read',
  resolveCompanyUUID,
  handle((req, res) => companyActivityController.markActivityRead(req as any, res))
);

router.post(
  '/:id/activity/read-all',
  validationMiddleware.validateParamsJoi(companyValidators.id),
  resolveCompanyUUID,
  handle((req, res) => companyActivityController.markAllActivitiesRead(req as any, res))
);

router.patch(
  '/:id/verify',
  validationMiddleware.validateParamsJoi(companyValidators.id),
  resolveCompanyUUID,
  handle(companyController.verify.bind(companyController) as ControllerMethod)
);

router.patch(
  '/:id/social',
  validationMiddleware.validateParamsJoi(companyValidators.id),
  resolveCompanyUUID,
  validationMiddleware.validateJoi(companyValidators.socialLinks),
  handle(companyController.updateSocialLinks.bind(companyController) as ControllerMethod)
);

// ============================================
// PROTECTED ROUTES (CRUD OPERATIONS)
// ============================================

router.post(
  '/create',
  validationMiddleware.validateJoi(companyValidators.create),
  handle(companyController.create.bind(companyController) as ControllerMethod)
);

router.post(
  '/:id/logo',
  uploadSingle('logo'),             // ← multer field name 'logo'
  validationMiddleware.validateParamsJoi(companyValidators.id),
  resolveCompanyUUID,
  handle((req, res) => CompanyLogoController.uploadLogo(req as any, res))
);

// GET    /:id/logos         — get all logos
router.get(
  '/:id/logos',
  validationMiddleware.validateParamsJoi(companyValidators.id),
  resolveCompanyUUID,
  handle((req, res) => CompanyLogoController.getAllLogos(req as any, res))
);

// GET    /:id/logo/:logoId  — get logo by id
router.get('/:id/logo/:logoId',
  validationMiddleware.validateParamsJoi(companyValidators.idWithLogoId),
  resolveCompanyUUID,
  handle((req, res) => CompanyLogoController.getLogoById(req as any, res))
);

router.put('/:id/logo/:logoId',
  uploadSingle('logo'),
  validationMiddleware.validateParamsJoi(companyValidators.idWithLogoId),
  resolveCompanyUUID,
  handle((req, res) => CompanyLogoController.updateLogo(req as any, res))
);

router.delete('/:id/logo/:logoId',
  validationMiddleware.validateParamsJoi(companyValidators.idWithLogoId),
  resolveCompanyUUID,
  handle((req, res) => CompanyLogoController.deleteLogo(req as any, res))
);

// ============================================
// COVER ROUTES
// ============================================

// POST   /:id/cover         — upload cover
router.post(
  '/:id/cover',
  uploadSingle('cover'),
  validationMiddleware.validateParamsJoi(companyValidators.id),
  resolveCompanyUUID,
  handle((req, res) => CompanyCoverController.uploadCover(req as any, res))
);

// GET    /:id/covers        — get all covers
router.get(
  '/:id/covers',
  validationMiddleware.validateParamsJoi(companyValidators.id),
  resolveCompanyUUID,
  handle((req, res) => CompanyCoverController.getAllCovers(req as any, res))
);

// GET    /:id/cover/:coverId — get cover by id
router.get('/:id/cover/:coverId',
  validationMiddleware.validateParamsJoi(companyValidators.idWithCoverId),
  resolveCompanyUUID,
  handle((req, res) => CompanyCoverController.getCoverById(req as any, res))
);

router.put('/:id/cover/:coverId',
  uploadSingle('cover'),
  validationMiddleware.validateParamsJoi(companyValidators.idWithCoverId),
  resolveCompanyUUID,
  handle((req, res) => CompanyCoverController.updateCover(req as any, res))
);

router.delete('/:id/cover/:coverId',
  validationMiddleware.validateParamsJoi(companyValidators.idWithCoverId),
  resolveCompanyUUID,
  handle((req, res) => CompanyCoverController.deleteCover(req as any, res))
);

router.put(
  '/:id',
  validationMiddleware.validateParamsJoi(companyValidators.id),
  resolveCompanyUUID,
  validationMiddleware.validateJoi(companyValidators.update),
  handle(companyController.update.bind(companyController) as ControllerMethod)
);

router.patch(
  '/:id',
  validationMiddleware.validateParamsJoi(companyValidators.id),
  resolveCompanyUUID,
  validationMiddleware.validateJoi(companyValidators.partialUpdate),
  handle(companyController.partialUpdate.bind(companyController) as ControllerMethod)
);

router.delete(
  '/:id',
  validationMiddleware.validateParamsJoi(companyValidators.id),
  resolveCompanyUUID,
  handle(companyController.delete.bind(companyController) as ControllerMethod)
);

// ============================================
// GENERIC ROUTES (MUST BE LAST!)
// ============================================

router.get(
  '/get-all',
  validationMiddleware.validateQueryJoi(companyValidators.query),
  handle(companyController.getAll.bind(companyController) as ControllerMethod)
);

router.get(
  '/:id',
  validationMiddleware.validateParamsJoi(companyValidators.id),
  resolveCompanyUUID,
  handle(companyController.getById.bind(companyController) as ControllerMethod)
);

// ============================================
// ABOUT ROUTES — COMPANY ABOUT PAGE
// ============================================

// ── Feature 1: Identity (Story / Mission / Vision / Promises / Impacts) ──
router.put(
  '/:id/about/identity',
  validationMiddleware.validateParamsJoi(companyValidators.id),
  resolveCompanyUUID,
  validationMiddleware.validateJoi(aboutValidators.identity),
  handle((req, res) => CompanyAboutController.upsertIdentity(req as any, res))
);

router.get(
  '/:id/about/identity',
  validationMiddleware.validateParamsJoi(companyValidators.id),
  resolveCompanyUUID,
  handle((req, res) => CompanyAboutController.getIdentity(req as any, res))
);

router.delete(
  '/:id/about/identity',
  validationMiddleware.validateParamsJoi(companyValidators.id),
  resolveCompanyUUID,
  handle((req, res) => CompanyAboutController.deleteIdentity(req as any, res))
);

// ── Feature 2: Timeline ──
router.post(
  '/:id/about/timeline',
  validationMiddleware.validateParamsJoi(companyValidators.id),
  resolveCompanyUUID,
  validationMiddleware.validateJoi(aboutValidators.timeline),
  handle((req, res) => CompanyAboutController.createTimeline(req as any, res))
);

router.get(
  '/:id/about/timeline',
  validationMiddleware.validateParamsJoi(companyValidators.id),
  resolveCompanyUUID,
  validationMiddleware.validateQueryJoi(aboutValidators.queryPagination),
  handle((req, res) => CompanyAboutController.getTimelines(req as any, res))
);

router.patch(
  '/:id/about/timeline/:timelineId',
  validationMiddleware.validateParamsJoi(aboutValidators.timelineId),
  resolveCompanyUUID,
  validationMiddleware.validateJoi(aboutValidators.timelineUpdate),
  handle((req, res) => CompanyAboutController.updateTimeline(req as any, res))
);

router.delete(
  '/:id/about/timeline/:timelineId',
  validationMiddleware.validateParamsJoi(aboutValidators.timelineId),
  resolveCompanyUUID,
  handle((req, res) => CompanyAboutController.deleteTimeline(req as any, res))
);

// ── Feature 3: Updates / News ──
router.post(
  '/:id/about/updates',
  validationMiddleware.validateParamsJoi(companyValidators.id),
  resolveCompanyUUID,
  validationMiddleware.validateJoi(aboutValidators.update),
  handle((req, res) => CompanyAboutController.createUpdate(req as any, res))
);

router.get(
  '/:id/about/updates',
  validationMiddleware.validateParamsJoi(companyValidators.id),
  resolveCompanyUUID,
  validationMiddleware.validateQueryJoi(aboutValidators.queryPagination),
  handle((req, res) => CompanyAboutController.getUpdates(req as any, res))
);

router.get(
  '/:id/about/updates/:updateId',
  validationMiddleware.validateParamsJoi(aboutValidators.updateId),
  resolveCompanyUUID,
  handle((req, res) => CompanyAboutController.getUpdateById(req as any, res))
);

router.patch(
  '/:id/about/updates/:updateId',
  validationMiddleware.validateParamsJoi(aboutValidators.updateId),
  resolveCompanyUUID,
  validationMiddleware.validateJoi(aboutValidators.updatePartial),
  handle((req, res) => CompanyAboutController.updateUpdate(req as any, res))
);

router.delete(
  '/:id/about/updates/:updateId',
  validationMiddleware.validateParamsJoi(aboutValidators.updateId),
  resolveCompanyUUID,
  handle((req, res) => CompanyAboutController.deleteUpdate(req as any, res))
);

// ── Feature 4: Testimonials (What our users say) ──
router.post(
  '/:id/about/testimonials',
  validationMiddleware.validateParamsJoi(companyValidators.id),
  resolveCompanyUUID,
  validationMiddleware.validateJoi(aboutValidators.testimonial),
  handle((req, res) => CompanyAboutController.createTestimonial(req as any, res))
);

router.get(
  '/:id/about/testimonials',
  validationMiddleware.validateParamsJoi(companyValidators.id),
  resolveCompanyUUID,
  validationMiddleware.validateQueryJoi(aboutValidators.queryPagination),
  handle((req, res) => CompanyAboutController.getTestimonials(req as any, res))
);

router.patch(
  '/:id/about/testimonials/:testimonialId',
  validationMiddleware.validateParamsJoi(aboutValidators.testimonialId),
  resolveCompanyUUID,
  validationMiddleware.validateJoi(aboutValidators.testimonialUpdate),
  handle((req, res) => CompanyAboutController.updateTestimonial(req as any, res))
);

router.delete(
  '/:id/about/testimonials/:testimonialId',
  validationMiddleware.validateParamsJoi(aboutValidators.testimonialId),
  resolveCompanyUUID,
  handle((req, res) => CompanyAboutController.deleteTestimonial(req as any, res))
);

// ── Feature 5: Product Info ──
router.put(
  '/:id/about/product',
  validationMiddleware.validateParamsJoi(companyValidators.id),
  resolveCompanyUUID,
  validationMiddleware.validateJoi(aboutValidators.product),
  handle((req, res) => CompanyAboutController.upsertProduct(req as any, res))
);

router.get(
  '/:id/about/product',
  validationMiddleware.validateParamsJoi(companyValidators.id),
  resolveCompanyUUID,
  handle((req, res) => CompanyAboutController.getProduct(req as any, res))
);

router.delete(
  '/:id/about/product',
  validationMiddleware.validateParamsJoi(companyValidators.id),
  resolveCompanyUUID,
  handle((req, res) => CompanyAboutController.deleteProduct(req as any, res))
);

// ── Feature 6: Company Life (Values, Perks, Team, Gallery) ──
router.put(
  '/:id/about/life',
  validationMiddleware.validateParamsJoi(companyValidators.id),
  resolveCompanyUUID,
  validationMiddleware.validateJoi(aboutValidators.life),
  handle((req, res) => CompanyAboutController.upsertLife(req as any, res))
);

router.get(
  '/:id/about/life',
  validationMiddleware.validateParamsJoi(companyValidators.id),
  resolveCompanyUUID,
  handle((req, res) => CompanyAboutController.getLife(req as any, res))
);

// ── Full About Page (single aggregated endpoint for frontend) ──
router.get(
  '/:id/about',
  validationMiddleware.validateParamsJoi(companyValidators.id),
  resolveCompanyUUID,
  handle((req, res) => CompanyAboutController.getFullAbout(req as any, res))
);

export default router;