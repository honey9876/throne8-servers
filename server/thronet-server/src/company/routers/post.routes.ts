import { Router } from 'express';
import { postController } from '../controllers';
import validationMiddleware from '@/shared/middlewares/validation.middleware';
import { postValidators } from '../validations/company.validation';
import AuthMiddleware from '@/shared/middlewares/auth.middleware';
import { resolveCompanyUUID } from '../middlewares/resolveCompanyId.middleware';
import { resolvePostUUID } from '../middlewares/resolvePostId.middleware';
import upload from '@/shared/upload/upload';
import { resolveEmployeeUUID } from '../middlewares/resolveEmployeeId.middleware';

const router = Router({ mergeParams: true });

router.use(AuthMiddleware.authenticate as any);

// =====================================================
// PUBLIC / PROTECTED POST ROUTES
// =====================================================

/**
 * @route   GET /api/v1/company/posts
 * @desc    List all published posts with filters
 * @access  Private (Auth)
 */
router.get(
  ['/', ''],
  validationMiddleware.validateQueryJoi(postValidators.query),
  postController.listPosts.bind(postController)
);

/**
 * @route   POST /api/v1/company/posts (also supports '', /create, /create-post)
 * @desc    Create a new post
 * @access  Private (Auth)
 */
router.post(
  ['/', '', '/create', '/create-post'],
  upload.uploadFields([
    { name: 'images', maxCount: 10 },
    { name: 'videos', maxCount: 5 },
    { name: 'documents', maxCount: 5 },
  ]),
  validationMiddleware.validateJoi(postValidators.create),
  postController.createPost.bind(postController)
);

/**
 * @route   GET /api/v1/company/posts/search
 * @desc    Search posts by text
 */
router.get(
  '/search',
  validationMiddleware.validateQueryJoi(postValidators.search),
  postController.searchPosts.bind(postController)
);

/**
 * @route   GET /api/v1/company/posts/trending
 * @desc    Get trending posts
 */
router.get('/trending', postController.getTrendingPosts.bind(postController));

/**
 * @route   GET /api/v1/company/posts/popular
 * @desc    Get popular posts
 */
router.get('/popular', postController.getPopularPosts.bind(postController));

/**
 * @route   GET /api/v1/company/posts/:companyId
 * @desc    Get all posts by company (supports /company/:id, /company/:companyId, /:id, /:companyId)
 */
router.get(
  ['/company/:id', '/company/:companyId', '/:companyId', '/:id'],
  resolveCompanyUUID,
  postController.getPostsByCompany.bind(postController)
);

/**
 * @route   GET /api/v1/company/posts/author/:id
 * @desc    Get all posts by author
 */
router.get(
  '/author/:id',
  validationMiddleware.validateParamsJoi(postValidators.authorId),
  resolveEmployeeUUID,
  postController.getPostsByAuthor.bind(postController)
);

/**
 * @route   GET /api/v1/company/posts/slug/:slug
 * @desc    Get post by slug
 */
router.get(
  '/slug/:slug',
  validationMiddleware.validateParamsJoi(postValidators.slug),
  postController.getPostBySlug.bind(postController)
);

/**
 * @route   GET /api/v1/company/posts/:id/stats
 * @desc    Get post engagement stats
 */
router.get(
  '/:id/stats',
  validationMiddleware.validateParamsJoi(postValidators.id),
  resolvePostUUID,
  postController.getPostStats.bind(postController)
);

/**
 * @route   GET /api/v1/company/posts/single/:id or /post/:id
 * @desc    Get post by ID
 */
router.get(
  ['/single/:id', '/post/:id'],
  validationMiddleware.validateParamsJoi(postValidators.id),
  resolvePostUUID,
  postController.getPostById.bind(postController)
);

/**
 * @route   PUT /api/v1/company/posts/:id
 * @desc    Update post (full update)
 */
router.put(
  '/:id',
  upload.uploadFields([
    { name: 'images', maxCount: 10 },
    { name: 'videos', maxCount: 5 },
    { name: 'documents', maxCount: 5 },
  ]),
  validationMiddleware.validateParamsJoi(postValidators.id),
  validationMiddleware.validateJoi(postValidators.update),
  resolvePostUUID,
  postController.updatePost.bind(postController)
);

/**
 * @route   PATCH /api/v1/company/posts/:id
 * @desc    Partial update post
 */
router.patch(
  '/:id',
  upload.uploadFields([
    { name: 'images', maxCount: 10 },
    { name: 'videos', maxCount: 5 },
    { name: 'documents', maxCount: 5 },
  ]),
  validationMiddleware.validateParamsJoi(postValidators.id),
  validationMiddleware.validateJoi(postValidators.partialUpdate),
  resolvePostUUID,
  postController.updatePost.bind(postController)
);

/**
 * @route   DELETE /api/v1/company/posts/:id
 * @desc    Delete post (soft delete/archive)
 */
router.delete(
  '/:id',
  validationMiddleware.validateParamsJoi(postValidators.id),
  resolvePostUUID,
  postController.deletePost.bind(postController)
);

/**
 * @route   PATCH /api/v1/company/posts/:id/publish
 * @desc    Publish a draft post
 */
router.patch(
  '/:id/publish',
  validationMiddleware.validateParamsJoi(postValidators.id),
  resolvePostUUID,
  postController.publishPost.bind(postController)
);

/**
 * @route   PATCH /api/v1/company/posts/:id/schedule
 * @desc    Schedule a post for later
 */
router.patch(
  '/:id/schedule',
  validationMiddleware.validateParamsJoi(postValidators.id),
  validationMiddleware.validateJoi(postValidators.schedule),
  resolvePostUUID,
  postController.schedulePost.bind(postController)
);

/**
 * @route   PATCH /api/v1/company/posts/:id/likes
 * @desc    Increment post likes
 */
router.patch(
  '/:id/likes',
  validationMiddleware.validateParamsJoi(postValidators.id),
  resolvePostUUID,
  postController.incrementLikes.bind(postController)
);

router.post(
  ['/:id/like', '/:id/likes'],
  validationMiddleware.validateParamsJoi(postValidators.id),
  resolvePostUUID,
  postController.toggleLike.bind(postController)
);

router.get(
  '/:id/comments',
  validationMiddleware.validateParamsJoi(postValidators.id),
  resolvePostUUID,
  postController.getPostComments.bind(postController)
);

router.post(
  '/:id/comments',
  validationMiddleware.validateParamsJoi(postValidators.id),
  resolvePostUUID,
  postController.addPostComment.bind(postController)
);

router.delete(
  '/:id/comments/:commentId',
  resolvePostUUID,
  postController.deletePostComment.bind(postController)
);

/**
 * @route   PATCH /api/v1/company/posts/:id/shares
 * @desc    Increment post shares
 */
router.patch(
  '/:id/shares',
  validationMiddleware.validateParamsJoi(postValidators.id),
  resolvePostUUID,
  postController.incrementShares.bind(postController)
);

export default router;