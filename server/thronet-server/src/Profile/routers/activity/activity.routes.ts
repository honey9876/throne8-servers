/**
 * Activity Routes - API Endpoints for Posts, Comments, Media
 * 
 * @module routes/activity.routes
 * @version 1.1.0
 */

import express, { Request, Response } from 'express';
import AuthMiddleware from '@/shared/middlewares/auth.middleware';
import rateLimitMiddleware from '@/shared//middlewares/rateLimit.middleware';
import { PostController, CommentController, ActivityMediaController } from '@/shared/controllers/index.controllers';
import { uploadMultiple } from '@/shared//upload/upload';
import upload from '@/shared/upload/upload';
import {
    validateCreatePost,
    validateUpdatePost,
    validateCreateComment,
    validateUpdateComment,
    validateCreateReply,
    validateVotePoll,
    validateCreateRepost
} from '@/Profile/middlewares/validation.middleware';
import ResponseUtil from '@/shared/response.util';
import { PostService } from '@/shared/services/index.service';
import RepostController from '@/Profile/controllers/activity/repost.controller';
import ReportMuteController from '@/Profile/controllers/reportMute.controller';

const router = express.Router();

// ==================== POST ROUTES ====================

/**
 * @route   POST /api/v1/activity/posts
 * @desc    Create a new post
 * @access  Private
 */
router.post(
    '/create-posts',
    AuthMiddleware.authenticate as any,
    // uploadMultiple([
    //     { name: 'images', maxCount: 10 },
    //     { name: 'videos', maxCount: 5 },
    //     { name: 'documents', maxCount: 5 },
    // ]),
    upload.uploadFields([  // Or just uploadFields if using named import
        { name: 'images', maxCount: 10 },
        { name: 'videos', maxCount: 5 },
        { name: 'documents', maxCount: 5 },
    ]),
    validateCreatePost,
    // rateLimitMiddleware({ maxRequests: 20, windowMs: 60000 }),
    PostController.createPost as any
);

/**
 * @route   GET /api/v1/activity/posts/user/performance
 * @desc    Get user's recent posts performance
 * @access  Private
 */
router.get(
    '/posts/user/performance',
    AuthMiddleware.authenticate as any,
    // rateLimitMiddleware({ maxRequests: 100, windowMs: 60000 }),
    PostController.getUserPostsPerformance as any
);
router.get(
    '/posts/:postId/reactors',
     AuthMiddleware.authenticate as any, 
     PostController.getPostReactors as any
    );
router.post(
    '/posts/:postId/record-send',
    AuthMiddleware.authenticate as any,
    PostController.recordSend as any
);
/**
 * @route   GET /api/v1/activity/posts/:postId/analytics
 * @desc    Get detailed post analytics
 * @access  Private
 */
router.get(
    '/posts/:postId/analytics',
    AuthMiddleware.authenticate as any,
    // rateLimitMiddleware({ maxRequests: 100, windowMs: 60000 }),
    PostController.getPostAnalytics as any
);


/**
 * @route   POST /api/v1/activity/posts/:postId/track-view
 * @desc    Track post view metrics
 * @access  Private
 */
router.post(
    '/posts/:postId/track-view',
    AuthMiddleware.authenticate as any,
    // rateLimitMiddleware({ maxRequests: 200, windowMs: 60000 }),
    PostController.trackPostView as any
);

/**
 * @route   GET /api/v1/activity/posts
 * @desc    Get all posts of authenticated user
 * @access  Private
 */
router.get(
    '/get-all/posts',
    AuthMiddleware.authenticate as any,
    rateLimitMiddleware({ maxRequests: 100, windowMs: 60000 }),
    PostController.getAllPosts as any
);

/**
 * @route   GET /api/v1/activity/posts/user/:userId
 * @desc    Get all posts belonging to a SPECIFIC user (for viewing someone
 *          else's profile). Requester must be authenticated, but the posts
 *          returned belong to :userId, not the requester. Archived posts
 *          are never returned unless :userId === the requester's own id.
 * @access  Private (any logged-in user can view)
 */
router.get(
    '/posts/user/:userId',
    AuthMiddleware.authenticate as any,
    rateLimitMiddleware({ maxRequests: 100, windowMs: 60000 }),
    PostController.getUserPostsById as any
);

/**
 * @route   GET /api/v1/activity/posts/feed/all
 * @desc    Get ALL posts from database (for home feed)
 * @access  Private
 */
router.get(
    '/posts/feed/all',
    AuthMiddleware.authenticate as any,
    rateLimitMiddleware({ maxRequests: 100, windowMs: 60000 }),
    PostController.getAllPostsForHome as any
);

/**
 * @route   GET /api/v1/activity/posts/:postId
 * @desc    Get post by ID
 * @access  Private
 */
router.get(
    '/get-post/:postId',
    AuthMiddleware.authenticate as any,
    rateLimitMiddleware({ maxRequests: 100, windowMs: 60000 }),
    PostController.getPostById as any
);

/**
 * @route   PUT /api/v1/activity/posts/:postId
 * @desc    Update post
 * @access  Private
 */
router.put(
    '/update-post/:postId',
    AuthMiddleware.authenticate as any,
    validateUpdatePost,
    rateLimitMiddleware({ maxRequests: 50, windowMs: 60000 }),
    PostController.updatePost as any
);

/**
 * @route   DELETE /api/v1/activity/posts/:postId
 * @desc    Delete post (soft or permanent)
 * @access  Private
 * @query   permanent=true for permanent deletion
 */
router.delete(
    '/delete-post/:postId',
    AuthMiddleware.authenticate as any,
    rateLimitMiddleware({ maxRequests: 20, windowMs: 60000 }),
    PostController.deletePost as any
);

/**
 * @route   POST /api/v1/activity/posts/:postId/archive
 * @desc    Archive post
 * @access  Private
 */
router.post(
    '/posts/:postId/archive',
    AuthMiddleware.authenticate as any,
    rateLimitMiddleware({ maxRequests: 50, windowMs: 60000 }),
    PostController.archivePost as any
);

/**
 * @route   POST /api/v1/activity/posts/:postId/restore
 * @desc    Restore archived/deleted post
 * @access  Private
 */
router.post(
    '/posts/:postId/restore',
    AuthMiddleware.authenticate as any,
    rateLimitMiddleware({ maxRequests: 50, windowMs: 60000 }),
    PostController.restorePost as any
);

/**
 * @route   PUT /api/v1/activity/posts/:postId/pin
 * @desc    Pin/Unpin post
 * @access  Private
 * @body    { isPinned: boolean }
 */
router.put(
    '/posts/:postId/pin',
    AuthMiddleware.authenticate as any,
    rateLimitMiddleware({ maxRequests: 50, windowMs: 60000 }),
    PostController.pinPost as any
);

/**
 * @route   PUT /api/v1/activity/posts/:postId/save
 * @desc    Save/Unsave post
 * @access  Private
 * @body    { isSaved: boolean }
 */
router.put(
    '/posts/:postId/save',
    AuthMiddleware.authenticate as any,
    rateLimitMiddleware({ maxRequests: 50, windowMs: 60000 }),
    PostController.savePost as any
);

/**
 * @route   GET /api/v1/activity/posts/saved
 * @desc    Get all posts saved by the authenticated user
 * @access  Private
 */
router.get(
    '/posts/saved',
    AuthMiddleware.authenticate as any,
    rateLimitMiddleware({ maxRequests: 100, windowMs: 60000 }),
    PostController.getSavedPosts as any
);


// ==================== POST LIKES ROUTES ====================

/**
 * @route   POST /api/v1/activity/posts/:postId/like
 * @desc    Like a post
 * @access  Private
 */
router.post(
    '/posts/:postId/like',
    AuthMiddleware.authenticate as any,
    rateLimitMiddleware({ maxRequests: 100, windowMs: 60000 }),
    PostController.likePost as any
);

/**
 * @route   DELETE /api/v1/activity/posts/:postId/like
 * @desc    Unlike a post
 * @access  Private
 */
router.delete(
    '/posts/:postId/like',
    AuthMiddleware.authenticate as any,
    rateLimitMiddleware({ maxRequests: 100, windowMs: 60000 }),
    PostController.unlikePost as any
);

// ==================== POST REACTIONS ROUTES ====================

/**
 * @route   POST /api/v1/activity/posts/:postId/react
 * @desc    Add/switch a reaction (like/celebrate/support/love/insightful/funny)
 * @access  Private
 * @body    { type: string }
 */
router.post(
    '/posts/:postId/react',
    AuthMiddleware.authenticate as any,
    rateLimitMiddleware({ maxRequests: 100, windowMs: 60000 }),
    PostController.reactToPost as any
);

/**
 * @route   DELETE /api/v1/activity/posts/:postId/react
 * @desc    Remove reaction from a post
 * @access  Private
 */
router.delete(
    '/posts/:postId/react',
    AuthMiddleware.authenticate as any,
    rateLimitMiddleware({ maxRequests: 100, windowMs: 60000 }),
    PostController.removeReaction as any
);

/**
 * @route   GET /api/v1/activity/reactions/user/:userId
 * @desc    Get all posts a specific user has reacted to (Reactions tab)
 * @access  Private
 */
router.get(
    '/reactions/user/:userId',
    AuthMiddleware.authenticate as any,
    rateLimitMiddleware({ maxRequests: 100, windowMs: 60000 }),
    PostController.getUserReactions as any
);

// ==================== COMMENT ROUTES ====================

/**
 * @route   POST /api/v1/activity/comments
 * @desc    Create a comment on a post
 * @access  Private
 * @body    { postId: string, content: string }
 */
router.post(
    '/create-comment/comments',
    AuthMiddleware.authenticate as any,
    validateCreateComment,
    // rateLimitMiddleware({ maxRequests: 50, windowMs: 60000 }),
    CommentController.createComment as any
);

/**
 * @route   POST /api/v1/activity/comments/:commentId/reply
 * @desc    Create a reply to a comment
 * @access  Private
 * @body    { content: string }
 */
router.post(
    '/comments/:commentId/reply',
    AuthMiddleware.authenticate as any,
    validateCreateReply,
    // rateLimitMiddleware({ maxRequests: 50, windowMs: 60000 }),
    CommentController.createReply as any
);

/**
 * @route   GET /api/v1/activity/posts/:postId/comments
 * @desc    Get all comments for a post
 * @access  Public
 */
router.get(
    '/posts/:postId/comments',
    // rateLimitMiddleware({ maxRequests: 100, windowMs: 60000 }),
    CommentController.getCommentsByPostId as any
);

/**
 * @route   GET /api/v1/activity/comments/my-comments
 * @desc    Get all comments made by authenticated user
 * @access  Private
 */
router.get(
    '/comments/my-comments',
    AuthMiddleware.authenticate as any,
    // rateLimitMiddleware({ maxRequests: 100, windowMs: 60000 }),
    CommentController.getMyComments as any
);


/**
 * @route   GET /api/v1/activity/comments/:commentId
 * @desc    Get comment by ID
 * @access  Private
 */
router.get(
    '/comments/:commentId',
    AuthMiddleware.authenticate as any,
    rateLimitMiddleware({ maxRequests: 100, windowMs: 60000 }),
    CommentController.getCommentById as any
);

/**
 * @route   GET /api/v1/activity/posts/performance
 * @desc    Get recent posts performance metrics
 * @access  Private
 * @query   limit=10 (optional)
 */
router.get(
    '/posts/performance',
    AuthMiddleware.authenticate as any,
    rateLimitMiddleware({ maxRequests: 50, windowMs: 60000 }),
    (async (req: Request & { user?: any }, res: Response) => {
        try {
            if (!req.user?.userId) {
                ResponseUtil.unauthorized(res, 'Authentication required');
                return;
            }

            const limit = parseInt(req.query.limit as string) || 10;
            const result = await PostService.getRecentPostsPerformance(req.user.userId, limit);

            ResponseUtil.success(res, result, 'Performance data fetched successfully');
            return;
        } catch (error: any) {
            ResponseUtil.internalError(res, error.message, error);
            return;
        }
    }) as any
);


/**
 * @route   PUT /api/v1/activity/comments/:commentId
 * @desc    Update comment
 * @access  Private
 * @body    { content: string }
 */
router.put(
    '/update-comments/:commentId',
    AuthMiddleware.authenticate as any,
    validateUpdateComment,
    rateLimitMiddleware({ maxRequests: 50, windowMs: 60000 }),
    CommentController.updateComment as any
);

/**
 * @route   DELETE /api/v1/activity/comments/:commentId
 * @desc    Delete comment (soft or permanent)
 * @access  Private
 * @query   permanent=true for permanent deletion
 */
router.delete(
    '/delete-comments/:commentId',
    AuthMiddleware.authenticate as any,
    rateLimitMiddleware({ maxRequests: 20, windowMs: 60000 }),
    CommentController.deleteComment as any
);

/**
 * @route   POST /api/v1/activity/comments/:commentId/restore
 * @desc    Restore deleted comment
 * @access  Private
 */
router.post(
    '/restore-comments/:commentId/restore',
    AuthMiddleware.authenticate as any,
    rateLimitMiddleware({ maxRequests: 50, windowMs: 60000 }),
    CommentController.restoreComment as any
);

/**
 * @route   POST /api/v1/activity/comments/:commentId/like
 * @desc    Like a comment
 * @access  Private
 */
router.post(
    '/comments/:commentId/like',
    AuthMiddleware.authenticate as any,
    rateLimitMiddleware({ maxRequests: 100, windowMs: 60000 }),
    CommentController.likeComment as any
);

/**
 * @route   DELETE /api/v1/activity/comments/:commentId/like
 * @desc    Unlike a comment
 * @access  Private
 */
router.delete(
    '/comments/:commentId/like',
    AuthMiddleware.authenticate as any,
    rateLimitMiddleware({ maxRequests: 100, windowMs: 60000 }),
    CommentController.unlikeComment as any
);

/**
 * @route   GET /api/v1/activity/comments/user/:userId
 * @desc    Get all comments made by a SPECIFIC user (viewing someone
 *          else's profile). Requester must be authenticated.
 * @access  Private (any logged-in user can view)
 */
router.get(
    '/comments/user/:userId',
    AuthMiddleware.authenticate as any,
    rateLimitMiddleware({ maxRequests: 100, windowMs: 60000 }),
    CommentController.getCommentsByUserId as any
);

// ==================== MEDIA ROUTES ====================

/**
 * @route   GET /api/v1/activity/media/images
 * @desc    Get all images used in posts by user
 * @access  Private
 */
router.get(
    '/media/images',
    AuthMiddleware.authenticate as any,
    rateLimitMiddleware({ maxRequests: 100, windowMs: 60000 }),
    ActivityMediaController.getUserImages as any
);

/**
 * @route   GET /api/v1/activity/media/videos
 * @desc    Get all videos used in posts by user
 * @access  Private
 */
router.get(
    '/media/videos',
    AuthMiddleware.authenticate as any,
    rateLimitMiddleware({ maxRequests: 100, windowMs: 60000 }),
    ActivityMediaController.getUserVideos as any
);

/**
 * @route   GET /api/v1/activity/media/documents
 * @desc    Get all documents used in posts by user
 * @access  Private
 */
router.get(
    '/media/documents',
    AuthMiddleware.authenticate as any,
    rateLimitMiddleware({ maxRequests: 100, windowMs: 60000 }),
    ActivityMediaController.getUserDocuments as any
);

/**
 * @route   GET /api/v1/activity/media/all
 * @desc    Get all media (images, videos, documents) with stats
 * @access  Private
 */
router.get(
    '/media/all',
    AuthMiddleware.authenticate as any,
    rateLimitMiddleware({ maxRequests: 100, windowMs: 60000 }),
    ActivityMediaController.getUserAllMedia as any
);

/**
 * @route   GET /api/v1/activity/posts/:postId/media
 * @desc    Get all media for a specific post
 * @access  Public
 */
router.get(
    '/posts/:postId/media',
    rateLimitMiddleware({ maxRequests: 100, windowMs: 60000 }),
    ActivityMediaController.getMediaByPostId as any
);

/**
 * @route   GET /api/v1/activity/media/:mediaId
 * @desc    Get media by ID
 * @access  Private
 */
router.get(
    '/media/:mediaId',
    AuthMiddleware.authenticate as any,
    rateLimitMiddleware({ maxRequests: 100, windowMs: 60000 }),
    ActivityMediaController.getMediaById as any
);

/**
 * @route   POST /api/v1/activity/posts/:postId/view
 * @desc    Track post view analytics
 * @access  Private
 * @body    { dwellTime: number, expanded: boolean }
 */
router.post(
    '/posts/:postId/view',
    AuthMiddleware.authenticate as any,
    rateLimitMiddleware({ maxRequests: 200, windowMs: 60000 }),
    PostController.trackPostView as any
);

/**
 * @route   POST /api/v1/activity/posts/:postId/vote
 * @desc    Vote on a poll
 * @access  Private
 * @body    { optionId: string }
 */
router.post(
    '/posts/:postId/vote',
    AuthMiddleware.authenticate as any,
    validateVotePoll,  // ✅ Add validation
    rateLimitMiddleware({ maxRequests: 50, windowMs: 60000 }),
    PostController.votePoll as any
);

// ==================== REPOST ROUTES ====================
// Existing routes ke baad add karo

// Create repost / quote repost
router.post(
    '/posts/:entryId/repost',
    AuthMiddleware.authenticate as any,
    validateCreateRepost,
    RepostController.createRepost as any
);

// Delete repost
router.delete(
    '/posts/reposts/:repostId',
    AuthMiddleware.authenticate as any,
    RepostController.deleteRepost as any
);

// Get all reposts of a post
router.get(
    '/posts/:entryId/reposts',
    AuthMiddleware.authenticate as any,
    RepostController.getRepostsByPost as any
);

// Get my reposts
router.get(
    '/posts/reposts/my-reposts',
    AuthMiddleware.authenticate as any,
    RepostController.getMyReposts as any
);

// Check repost status
router.get(
    '/posts/:entryId/repost-status',
    AuthMiddleware.authenticate as any,
    RepostController.getRepostStatus as any
);


/**
 * @route   POST /api/v1/activity/comments/:commentId/report
 * @desc    Report a comment
 * @access  Private
 * @body    { reason?: string }
 */
router.post(
    '/comments/:commentId/report',
    AuthMiddleware.authenticate as any,
    rateLimitMiddleware({ maxRequests: 20, windowMs: 60000 }),
    ReportMuteController.reportComment as any
);

/**
 * @route   POST /api/v1/activity/comments/:commentId/mute-thread
 * @desc    Mute notifications for the whole post/thread this comment belongs to
 * @access  Private
 */
router.post(
    '/comments/:commentId/mute-thread',
    AuthMiddleware.authenticate as any,
    rateLimitMiddleware({ maxRequests: 50, windowMs: 60000 }),
    ReportMuteController.muteThread as any
);

/**
 * @route   DELETE /api/v1/activity/posts/:postId/mute-thread
 * @desc    Unmute a previously muted thread
 * @access  Private
 */
router.delete(
    '/posts/:postId/mute-thread',
    AuthMiddleware.authenticate as any,
    ReportMuteController.unmuteThread as any
);

/**
 * @route   GET /api/v1/activity/muted-threads
 * @desc    Get list of postIds the user has muted
 * @access  Private
 */
router.get(
    '/muted-threads',
    AuthMiddleware.authenticate as any,
    ReportMuteController.getMutedThreads as any
);





// ==================== REPOST ROUTES ====================

router.post(
    '/posts/:entryId/repost',
    AuthMiddleware.authenticate as any,
    validateCreateRepost,
    RepostController.createRepost as any
);

router.delete(
    '/posts/reposts/:repostId',
    AuthMiddleware.authenticate as any,
    RepostController.deleteRepost as any
);

router.get(
    '/posts/:entryId/reposts',
    AuthMiddleware.authenticate as any,
    RepostController.getRepostsByPost as any
);

router.get(
    '/posts/reposts/my-reposts',
    AuthMiddleware.authenticate as any,
    RepostController.getMyReposts as any
);

router.get(
    '/posts/:entryId/repost-status',
    AuthMiddleware.authenticate as any,
    RepostController.getRepostStatus as any
);

router.post(
    '/posts/reposts/:repostId/react',
    AuthMiddleware.authenticate as any,
    RepostController.likeRepost as any
);
router.delete(
    '/posts/reposts/:repostId/react',
    AuthMiddleware.authenticate as any,
    RepostController.unlikeRepost as any
);
export default router;// Force Railway rebuild 07/30/2026 17:41:23
