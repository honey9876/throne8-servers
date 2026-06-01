import { Router } from 'express';
import { postController } from '../controllers';
import validationMiddleware from '@/shared/middlewares/validation.middleware';
import { postValidators } from '../validations/company.validation';
import validation from '@/Mentorship/utils/validation';
import AuthMiddleware from '@/shared/middlewares/auth.middleware';
import { resolveCompanyUUID } from '../middlewares/resolveCompanyId.middleware';
import { resolvePostUUID } from '../middlewares/resolvePostId.middleware';
import upload from '@/shared/upload/upload';
import { resolveEmployeeUUID } from '../middlewares/resolveEmployeeId.middleware';
// import { authenticate } from '@/middlewares/auth.middleware'; // Uncomment when auth is ready

const router = Router();

router.use(AuthMiddleware.authenticate as any);

// =====================================================
// PUBLIC ROUTES (No authentication required)
// =====================================================

/**
 * @route   GET /api/posts
 * @desc    List all published posts with filters
 * @access  Public
 */
router.get('/', validationMiddleware.validateQueryJoi(postValidators.query), postController.listPosts);

/**
 * @route   GET /api/posts/search
 * @desc    Search posts by text
 * @access  Public
 */
router.get('/search', validationMiddleware.validateQueryJoi(postValidators.search), postController.searchPosts);

/**
 * @route   GET /api/posts/trending
 * @desc    Get trending posts (last 7 days, high engagement)
 * @access  Public
 */
router.get('/trending', postController.getTrendingPosts);

/**
 * @route   GET /api/posts/popular
 * @desc    Get popular posts (all time, high engagement)
 * @access  Public
 */
router.get('/popular', postController.getPopularPosts);

/**
 * @route   GET /api/posts/:id
 * @desc    Get post by ID
 * @access  Public
 */
router.get('/:id', validationMiddleware.validateParamsJoi(postValidators.id), resolvePostUUID, postController.getPostById);

router.get(
  '/author/:id',
  validationMiddleware.validateParamsJoi(postValidators.authorId), 
  resolveEmployeeUUID,                                               
  postController.getPostsByAuthor
);

/**
 * @route   GET /api/posts/slug/:slug
 * @desc    Get post by slug
 * @access  Public
 */
router.get('/slug/:slug', validationMiddleware.validateParamsJoi(postValidators.slug), postController.getPostBySlug);

/**
 * @route   GET /api/posts/:id/stats
 * @desc    Get post engagement stats
 * @access  Public
 */
router.get('/:id/stats', validationMiddleware.validateParamsJoi(postValidators.id), resolvePostUUID, postController.getPostStats);

/**
 * @route   GET /api/posts/company/:companyId
 * @desc    Get all posts by company
 * @access  Public
 */
router.get(
  '/company/:id',
  validationMiddleware.validateParamsJoi(postValidators.companyId),
  resolveCompanyUUID,
  postController.getPostsByCompany
);

// =====================================================
// PROTECTED ROUTES (Authentication required)
// =====================================================
// Uncomment these when auth middleware is ready

/**
 * @route   POST /api/posts
 * @desc    Create a new post
 * @access  Private (Company/Employee)
 */
router.post(
  '/create-post',
  upload.uploadFields([
    { name: 'images', maxCount: 10 },
    { name: 'videos', maxCount: 5 },
    { name: 'documents', maxCount: 5 },
  ]),
  validationMiddleware.validateJoi(postValidators.create),
  postController.createPost
);

/**
 * @route   PUT /api/posts/:id
 * @desc    Update post (full update)
 * @access  Private (Company/Employee)
 */
router.put(
  '/:id',
  // authenticate, // Uncomment when auth is ready
  validationMiddleware.validateParamsJoi(postValidators.id),
  validationMiddleware.validateJoi(postValidators.update),
  resolvePostUUID,
  postController.updatePost
);

/**
 * @route   PATCH /api/posts/:id
 * @desc    Partial update post
 * @access  Private (Company/Employee)
 */
router.patch(
  '/:id',
  // authenticate, // Uncomment when auth is ready
  validationMiddleware.validateParamsJoi(postValidators.id),
  validationMiddleware.validateJoi(postValidators.partialUpdate),
  resolvePostUUID,
  postController.updatePost
);

/**
 * @route   DELETE /api/posts/:id
 * @desc    Delete post (soft delete/archive)
 * @access  Private (Company/Employee)
 */
router.delete(
  '/:id',
  // authenticate, // Uncomment when auth is ready
  validationMiddleware.validateParamsJoi(postValidators.id),
  resolvePostUUID,
  postController.deletePost
);

/**
 * @route   PATCH /api/posts/:id/publish
 * @desc    Publish a draft post
 * @access  Private (Company/Employee)
 */
router.patch(
  '/:id/publish',
  // authenticate, // Uncomment when auth is ready
  validationMiddleware.validateParamsJoi(postValidators.id),
  resolvePostUUID,
  postController.publishPost
);

/**
 * @route   PATCH /api/posts/:id/schedule
 * @desc    Schedule a post for later
 * @access  Private (Company/Employee)
 */
router.patch(
  '/:id/schedule',
  // authenticate, // Uncomment when auth is ready
  validationMiddleware.validateParamsJoi(postValidators.id),
  validationMiddleware.validateJoi(postValidators.schedule),
  resolvePostUUID,
  postController.schedulePost
);

/**
 * @route   PATCH /api/posts/:id/likes
 * @desc    Increment post likes
 * @access  Public (Can be rate-limited)
 */
router.patch(
  '/:id/likes',
  validationMiddleware.validateParamsJoi(postValidators.id),
  resolvePostUUID,
  postController.incrementLikes
);

/**
 * @route   PATCH /api/posts/:id/shares
 * @desc    Increment post shares
 * @access  Public (Can be rate-limited)
 */
router.patch(
  '/:id/shares',
  validationMiddleware.validateParamsJoi(postValidators.id),
  resolvePostUUID,
  postController.incrementShares
);

export default router;