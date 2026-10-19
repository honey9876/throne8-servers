import { Request, Response, NextFunction } from 'express';
import mongoose from 'mongoose';
import { v4 as uuidv4 } from 'uuid';
import { postService } from '@/services';
import { CreatePostDTO, UpdatePostDTO, PostFilterQuery, PostStatus, PostType } from '../interfaces';
import logger from '@/shared/logger.util';
import ResponseUtil from '@/shared/response.util';
import CompanyPostLike from '../models/CompanyPostLike.model';
import CompanyPostComment from '../models/CompanyPostComment.model';
import CompanyActivity from '../models/CompanyActivity.model';
import CompanyPost from '../models/companyPost.model';

function extractIdString(val: any): string {
  if (!val) return '';
  if (typeof val === 'string') return val;
  if (typeof val === 'object' && val !== null) {
    if (val._id) return val._id.toString();
    if (val.companyId) return String(val.companyId);
    if (val.id) return String(val.id);
  }
  return String(val);
}

function getInitials(name?: string): string {
  if (!name || !name.trim()) return 'US';
  const parts = name.trim().split(' ');
  if (parts.length >= 2) {
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }
  return name.slice(0, 2).toUpperCase();
}

function timeAgo(dateInput: Date | string | undefined): string {
  if (!dateInput) return 'Recently';
  const date = new Date(dateInput);
  const now = new Date();
  const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);

  if (seconds < 60) return 'Just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  const years = Math.floor(months / 12);
  return `${years}y ago`;
}

class PostController {
  private async enrichPostsWithLiked(posts: any[], userOrId?: any): Promise<any[]> {
    if (!userOrId || !Array.isArray(posts) || posts.length === 0) return posts;

    const userIds = (typeof userOrId === 'object'
      ? [userOrId.id, userOrId.userId, userOrId._id]
      : [userOrId]
    ).filter(Boolean).map(String);

    if (userIds.length === 0) return posts;

    const allPostIds: string[] = [];
    for (const p of posts) {
      if (p.postId) allPostIds.push(String(p.postId));
      if (p._id) allPostIds.push(String(p._id));
      if (p.id) allPostIds.push(String(p.id));
    }

    const userLikes = await CompanyPostLike.find({
      userId: { $in: userIds },
      postId: { $in: allPostIds },
    }).lean();

    const likedPostIdSet = new Set(userLikes.map(l => String(l.postId)));

    return posts.map(p => {
      const isLiked = (p.postId && likedPostIdSet.has(String(p.postId))) ||
                      (p._id && likedPostIdSet.has(String(p._id))) ||
                      (p.id && likedPostIdSet.has(String(p.id))) ||
                      false;
      return {
        ...p,
        liked: isLiked,
      };
    });
  }

  // =====================================================
  // CREATE POST
  // =====================================================
  async createPost(req: Request, res: Response): Promise<void> {
    try {
      const title = req.body.title;
      const content = req.body.content || '';
      const company = req.body.company || req.body.companyId;
      const author = req.body.author || req.body.authorId;
      const type = req.body.type || req.body.postType || 'Blog';
      const status = req.body.status;
      const scheduledFor = req.body.scheduledFor || req.body.scheduledAt;
      const tags = req.body.tags;

      const files = req.files as {
        [fieldname: string]: Express.Multer.File[]
      } | undefined;

      const images = files?.images || [];
      const videos = files?.videos || [];
      const documents = files?.documents || [];

      let pollData;
      if (req.body.pollData) {
        try {
          pollData = typeof req.body.pollData === 'string'
            ? JSON.parse(req.body.pollData)
            : req.body.pollData;
        } catch (e) {
          res.status(400).json({ success: false, message: 'Invalid pollData format' });
          return;
        }
      }

      let parsedTags: string[] = [];
      if (tags) {
        if (Array.isArray(tags)) {
          parsedTags = tags;
        } else if (typeof tags === 'string') {
          if (tags.startsWith('[')) {
            try { parsedTags = JSON.parse(tags); } catch { parsedTags = tags.split(',').map((t: string) => t.trim()); }
          } else {
            parsedTags = tags.split(',').map((t: string) => t.trim()).filter(Boolean);
          }
        }
      }

      const post = await postService.createPost({
        title,
        content,
        company,
        author,
        type,
        status,
        tags: parsedTags,
        scheduledFor,
        pollData,
        images,
        videos,
        documents: documents as any,
      });

      res.status(201).json({
        success: true,
        message: 'Post created successfully',
        data: post,
      });

    } catch (error: any) {
      logger.error('createPost controller error:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Internal server error',
      });
    }
  }

  // =====================================================
  // GET POST BY ID
  // =====================================================
  async getPostById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const objectId = (req as any).resolvedObjectId;
      const user = (req as any).user;

      const post = await postService.getPostById(objectId);
      if (!post) {
        ResponseUtil.notFound(res, 'Post not found');
        return;
      }

      postService.incrementViews(objectId).catch((err) =>
        logger.error('Failed to increment post views:', err)
      );

      const postObj = post.toObject ? post.toObject() : post;
      const [enriched] = await this.enrichPostsWithLiked([postObj], user);

      ResponseUtil.success(res, enriched, 'Post retrieved successfully');
    } catch (error: any) {
      logger.error('Error in getPostById controller:', error);
      next(error);
    }
  }

  // =====================================================
  // GET POST BY SLUG
  // =====================================================
  async getPostBySlug(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { slug } = req.params;
      const user = (req as any).user;

      const post = await postService.getPostBySlug(slug);
      if (!post) {
        ResponseUtil.notFound(res, 'Post not found');
        return;
      }

      const postObj = post.toObject ? post.toObject() : post;
      const [enriched] = await this.enrichPostsWithLiked([postObj], user);

      ResponseUtil.success(res, enriched, 'Post retrieved successfully');
    } catch (error: any) {
      logger.error('Error in getPostBySlug controller:', error);
      next(error);
    }
  }

  // =====================================================
  // LIST POSTS
  // =====================================================
  async listPosts(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const user = (req as any).user;
      const filters: PostFilterQuery = {
        page: parseInt(req.query.page as string) || 1,
        pageSize: parseInt(req.query.pageSize as string) || 20,
        company: req.query.company as string,
        author: req.query.author as string,
        type: req.query.type as PostType,
        status: req.query.status as PostStatus,
        search: req.query.search as string,
        tags: req.query.tags ? (req.query.tags as string).split(',') : undefined,
        sort: (req.query.sort as 'recent' | 'trending' | 'engagement') || 'recent',
      };

      const result = await postService.listPosts(filters);
      const enrichedItems = await this.enrichPostsWithLiked(result.items, user);

      ResponseUtil.success(res, { items: enrichedItems, pagination: result.pagination }, 'Posts retrieved successfully');
    } catch (error: any) {
      logger.error('Error in listPosts controller:', error);
      next(error);
    }
  }

  // =====================================================
  // GET POSTS BY COMPANY
  // =====================================================
  async getPostsByCompany(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const companyObjectId = (req as any).resolvedObjectId;
      const user = (req as any).user;

      if (!companyObjectId) {
        ResponseUtil.badRequest(res, 'Company not found');
        return;
      }
      const page = parseInt(req.query.page as string) || 1;
      const pageSize = parseInt(req.query.pageSize as string) || 20;
      const sort = (req.query.sort as string) || 'recent';

      const result: any = await postService.getPostsByCompany(companyObjectId, page, pageSize, sort);
      const rawPosts = result.posts || result.items || (Array.isArray(result) ? result : []);
      const enriched = await this.enrichPostsWithLiked(rawPosts, user);

      if (result.posts) {
        result.posts = enriched;
      } else if (result.items) {
        result.items = enriched;
      }

      ResponseUtil.success(res, Array.isArray(result) ? enriched : result, 'Company posts retrieved successfully');
    } catch (error: any) {
      next(error);
    }
  }

  // =====================================================
  // UPDATE POST
  // =====================================================
  async updatePost(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const objectId = (req as any).resolvedObjectId;
      const title = req.body.title;
      const content = req.body.content;
      const type = req.body.type;
      const status = req.body.status;
      const tags = req.body.tags;

      const files = req.files as {
        [fieldname: string]: Express.Multer.File[]
      } | undefined;

      const images = files?.images || [];
      const videos = files?.videos || [];
      const documents = files?.documents || [];

      let parsedExistingMedia = req.body.existingMedia;
      if (typeof parsedExistingMedia === 'string') {
        try {
          parsedExistingMedia = JSON.parse(parsedExistingMedia);
        } catch {
          parsedExistingMedia = undefined;
        }
      }

      let parsedTags = tags;
      if (typeof parsedTags === 'string') {
        try {
          parsedTags = JSON.parse(parsedTags);
        } catch {
          parsedTags = tags ? [tags] : undefined;
        }
      }

      const hasFiles = images.length > 0 || videos.length > 0 || documents.length > 0;
      const hasFields = title !== undefined || content !== undefined || tags !== undefined ||
        status !== undefined || type !== undefined || parsedExistingMedia !== undefined;

      if (!hasFiles && !hasFields) {
        ResponseUtil.badRequest(res, 'At least one field to update is required');
        return;
      }

      const post = await postService.updatePost(objectId, {
        title,
        content,
        type,
        tags: parsedTags,
        status,
        existingMedia: parsedExistingMedia,
        images,
        videos,
        documents,
      });

      if (!post) {
        ResponseUtil.notFound(res, 'Post not found');
        return;
      }

      ResponseUtil.success(res, post, 'Post updated successfully');
    } catch (error: any) {
      logger.error('Error in updatePost controller:', error);
      next(error);
    }
  }

  // =====================================================
  // DELETE POST
  // =====================================================
  async deletePost(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const objectId = (req as any).resolvedObjectId;

      const deleted = await postService.deletePost(objectId);
      if (!deleted) {
        ResponseUtil.notFound(res, 'Post not found');
        return;
      }

      ResponseUtil.success(res, { deleted: true }, 'Post deleted successfully');
    } catch (error: any) {
      logger.error('Error in deletePost controller:', error);
      next(error);
    }
  }

  // =====================================================
  // PUBLISH POST
  // =====================================================
  async publishPost(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const objectId = (req as any).resolvedObjectId;

      const post = await postService.publishPost(objectId);
      if (!post) {
        ResponseUtil.notFound(res, 'Post not found');
        return;
      }

      ResponseUtil.success(res, post, 'Post published successfully');
    } catch (error: any) {
      logger.error('Error in publishPost controller:', error);
      next(error);
    }
  }

  // =====================================================
  // SCHEDULE POST
  // =====================================================
  async schedulePost(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const objectId = (req as any).resolvedObjectId;
      const { scheduledFor } = req.body;

      if (!scheduledFor) {
        ResponseUtil.badRequest(res, 'scheduledFor date is required');
        return;
      }

      const scheduledDate = new Date(scheduledFor);
      if (isNaN(scheduledDate.getTime())) {
        ResponseUtil.badRequest(res, 'Invalid date format');
        return;
      }

      const post = await postService.schedulePost(objectId, scheduledDate);
      if (!post) {
        ResponseUtil.notFound(res, 'Post not found');
        return;
      }

      ResponseUtil.success(res, post, 'Post scheduled successfully');
    } catch (error: any) {
      logger.error('Error in schedulePost controller:', error);
      next(error);
    }
  }

  // =====================================================
  // TOGGLE LIKE (Database Persisted Like / Unlike)
  // =====================================================
  async toggleLike(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const postId = req.params.id;
      const user = (req as any).user;
      const userId = user?.id || user?.userId || user?._id;
      const userIds = [user?.id, user?.userId, user?._id].filter(Boolean).map(String);

      if (!userId || userIds.length === 0) {
        ResponseUtil.unauthorized(res, 'Authentication required');
        return;
      }

      let post = (req as any).resolvedObjectId
        ? await CompanyPost.findById((req as any).resolvedObjectId)
        : null;

      if (!post) {
        post = await CompanyPost.findOne({
          $or: [
            { postId },
            { _id: mongoose.Types.ObjectId.isValid(postId) ? postId : null },
          ],
        });
      }

      if (!post) {
        ResponseUtil.notFound(res, 'Post not found');
        return;
      }

      const postUUID = post.postId || String(post._id);
      const postIdsToCheck = Array.from(new Set([post.postId, String(post._id), postId].filter(Boolean).map(String)));
      const companyIdStr = extractIdString(post.company);

      const existingLike = await CompanyPostLike.findOne({
        postId: { $in: postIdsToCheck },
        userId: { $in: userIds },
      });

      let isLiked = false;

      if (existingLike) {
        // UNLIKE: Remove like document & decrement count in DB
        await CompanyPostLike.deleteMany({
          postId: { $in: postIdsToCheck },
          userId: { $in: userIds },
        });

        const updatedPost = await CompanyPost.findByIdAndUpdate(
          post._id,
          { $inc: { 'engagementMetrics.likesCount': -1 } },
          { new: true }
        );

        if (updatedPost?.engagementMetrics?.likesCount && updatedPost.engagementMetrics.likesCount < 0) {
          await CompanyPost.updateOne({ _id: post._id }, { $set: { 'engagementMetrics.likesCount': 0 } });
        }

        const currentLikes = Math.max(0, updatedPost?.engagementMetrics?.likesCount ?? 0);

        await CompanyActivity.deleteMany({
          $or: [
            { targetId: `like-${postUUID}-${userId}` },
            { targetId: { $in: postIdsToCheck.flatMap(id => userIds.map(u => `like-${id}-${u}`)) } },
          ],
        });

        isLiked = false;

        // Invalidate cache for company
        if (companyIdStr) {
          await postService.invalidatePostCache(post._id.toString(), companyIdStr, post.slug);
        }

        ResponseUtil.success(res, { liked: false, likesCount: currentLikes }, 'Post unliked successfully');
      } else {
        // LIKE: Create like document & increment count & write Activity record to DB
        await CompanyPostLike.create({ postId: postUUID, userId: String(userId) });

        const updatedPost = await CompanyPost.findByIdAndUpdate(
          post._id,
          { $inc: { 'engagementMetrics.likesCount': 1 } },
          { new: true }
        );

        const currentLikes = Math.max(0, updatedPost?.engagementMetrics?.likesCount ?? 1);
        isLiked = true;

        const userName = `${user?.firstName || ''} ${user?.lastName || ''}`.trim() || user?.email || 'User';

        if (companyIdStr) {
          await CompanyActivity.create({
            activityId: `act-like-${postUUID}-${userId}-${Date.now()}`,
            companyId: companyIdStr,
            type: 'like',
            user: userName,
            avatar: getInitials(userName),
            color: 'bg-blue-500',
            action: `liked your post "${(post.title || '').slice(0, 30)}"`,
            read: false,
            targetId: `like-${postUUID}-${userId}`,
          });

          // Invalidate cache for company
          await postService.invalidatePostCache(post._id.toString(), companyIdStr, post.slug);
        }

        ResponseUtil.success(res, { liked: true, likesCount: currentLikes }, 'Post liked successfully');
      }
    } catch (error: any) {
      logger.error('Error in toggleLike controller:', error);
      next(error);
    }
  }

  // =====================================================
  // GET COMMENTS (Database Persisted Comments)
  // =====================================================
  async getPostComments(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const postId = req.params.id;
      const post = await CompanyPost.findOne({
        $or: [
          { postId },
          { _id: mongoose.Types.ObjectId.isValid(postId) ? postId : null },
        ],
      });

      const postUUIDs = post
        ? Array.from(new Set([post.postId, String(post._id), postId].filter(Boolean)))
        : [postId];

      const comments = await CompanyPostComment.find({ postId: { $in: postUUIDs } })
        .sort({ createdAt: -1 })
        .lean();

      const formatted = comments.map(c => ({
        id: c.commentId || String(c._id),
        commentId: c.commentId,
        postId: c.postId,
        userId: c.userId,
        userName: c.userName,
        userAvatar: c.userAvatar,
        text: c.text,
        createdAt: c.createdAt,
        time: timeAgo(c.createdAt),
      }));

      ResponseUtil.success(res, formatted, 'Comments retrieved successfully');
    } catch (error: any) {
      logger.error('Error in getPostComments controller:', error);
      next(error);
    }
  }

  // =====================================================
  // ADD COMMENT (Database Persisted Comment)
  // =====================================================
  async addPostComment(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const postId = req.params.id;
      const text = req.body.text || req.body.content;
      const userId = (req as any).user?.id || (req as any).user?.userId;

      if (!userId) {
        ResponseUtil.unauthorized(res, 'Authentication required');
        return;
      }
      if (!text || !text.trim()) {
        ResponseUtil.badRequest(res, 'Comment text is required');
        return;
      }

      const post = await CompanyPost.findOne({
        $or: [
          { postId },
          { _id: mongoose.Types.ObjectId.isValid(postId) ? postId : null },
        ],
      });

      if (!post) {
        ResponseUtil.notFound(res, 'Post not found');
        return;
      }

      const postUUID = post.postId || String(post._id);
      const companyIdStr = extractIdString(post.company);
      const userName = `${(req as any).user?.firstName || ''} ${(req as any).user?.lastName || ''}`.trim() || (req as any).user?.email || 'User';
      const userAvatar = (req as any).user?.profilePhotoId || (req as any).user?.avatar || null;

      // 1. Save Comment document in MongoDB
      const commentDoc = await CompanyPostComment.create({
        commentId: `c-${uuidv4()}`,
        postId: postUUID,
        companyId: companyIdStr,
        userId,
        userName,
        userAvatar,
        text: text.trim(),
      });

      // 2. Increment commentsCount on Post in MongoDB
      await CompanyPost.updateOne({ _id: post._id }, { $inc: { 'engagementMetrics.commentsCount': 1 } });

      // 3. Create Activity record in MongoDB
      if (companyIdStr) {
        await CompanyActivity.create({
          activityId: `act-comment-${commentDoc.commentId}`,
          companyId: companyIdStr,
          type: 'comment',
          user: userName,
          avatar: getInitials(userName),
          color: 'bg-orange-500',
          action: `commented: "${text.trim().slice(0, 35)}${text.length > 35 ? '...' : ''}" on "${(post.title || '').slice(0, 25)}"`,
          read: false,
          targetId: `comment-${commentDoc.commentId}`,
        });
      }

      const responseData = {
        id: commentDoc.commentId,
        commentId: commentDoc.commentId,
        postId: postUUID,
        userId,
        userName,
        userAvatar,
        text: commentDoc.text,
        createdAt: commentDoc.createdAt,
        time: 'Just now',
      };

      ResponseUtil.created(res, responseData, 'Comment added successfully');
    } catch (error: any) {
      logger.error('Error in addPostComment controller:', error);
      next(error);
    }
  }

  // =====================================================
  // DELETE COMMENT (Database Persisted Comment Deletion)
  // =====================================================
  async deletePostComment(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { commentId } = req.params;
      const userId = (req as any).user?.id || (req as any).user?.userId;

      if (!userId) {
        ResponseUtil.unauthorized(res, 'Authentication required');
        return;
      }

      const comment = await CompanyPostComment.findOne({
        $or: [
          { commentId },
          { _id: mongoose.Types.ObjectId.isValid(commentId) ? commentId : null },
        ],
      });

      if (!comment) {
        ResponseUtil.notFound(res, 'Comment not found');
        return;
      }

      if (comment.userId !== userId && !(req as any).user?.isAdmin) {
        ResponseUtil.forbidden(res, 'You can only delete your own comments');
        return;
      }

      await CompanyPostComment.deleteOne({ _id: comment._id });
      await CompanyPost.updateOne({ postId: comment.postId }, { $inc: { 'engagementMetrics.commentsCount': -1 } });
      await CompanyActivity.deleteOne({ targetId: `comment-${comment.commentId}` });

      ResponseUtil.success(res, { deleted: true }, 'Comment deleted successfully');
    } catch (error: any) {
      logger.error('Error in deletePostComment controller:', error);
      next(error);
    }
  }

  // =====================================================
  // INCREMENT LIKES / INCREMENT SHARES
  // =====================================================
  async incrementLikes(req: Request, res: Response, next: NextFunction): Promise<void> {
    return this.toggleLike(req, res, next);
  }

  async incrementShares(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const objectId = (req as any).resolvedObjectId;
      await postService.incrementShares(objectId);
      ResponseUtil.success(res, { success: true }, 'Share recorded');
    } catch (error: any) {
      logger.error('Error in incrementShares controller:', error);
      next(error);
    }
  }

  // =====================================================
  // SEARCH / TRENDING / POPULAR POSTS
  // =====================================================
  async searchPosts(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { q } = req.query;
      const page = parseInt(req.query.page as string) || 1;
      const pageSize = parseInt(req.query.pageSize as string) || 20;

      if (!q || typeof q !== 'string') {
        ResponseUtil.badRequest(res, 'Search query is required');
        return;
      }

      const result = await postService.searchPosts(q, page, pageSize);
      ResponseUtil.success(res, result, 'Search results retrieved successfully');
    } catch (error: any) {
      logger.error('Error in searchPosts controller:', error);
      next(error);
    }
  }

  async getTrendingPosts(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const limit = parseInt(req.query.limit as string) || 10;
      const posts = await postService.getTrendingPosts(limit);
      ResponseUtil.success(res, posts, 'Trending posts retrieved successfully');
    } catch (error: any) {
      logger.error('Error in getTrendingPosts controller:', error);
      next(error);
    }
  }

  async getPopularPosts(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const limit = parseInt(req.query.limit as string) || 10;
      const posts = await postService.getPopularPosts(limit);
      ResponseUtil.success(res, posts, 'Popular posts retrieved successfully');
    } catch (error: any) {
      logger.error('Error in getPopularPosts controller:', error);
      next(error);
    }
  }

  async getPostsByAuthor(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const authorObjectId = (req as any).resolvedObjectId;
      if (!authorObjectId) {
        ResponseUtil.badRequest(res, 'Author not found');
        return;
      }
      const page = parseInt(req.query.page as string) || 1;
      const pageSize = parseInt(req.query.pageSize as string) || 20;

      const result = await postService.getPostsByAuthor(authorObjectId, page, pageSize);
      ResponseUtil.success(res, result, 'Author posts retrieved successfully');
    } catch (error: any) {
      next(error);
    }
  }

  async getPostStats(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const objectId = (req as any).resolvedObjectId;

      const post = await postService.getPostById(objectId);
      if (!post) {
        ResponseUtil.notFound(res, 'Post not found');
        return;
      }

      const stats = {
        postId: post.postId,
        title: post.title,
        engagementMetrics: post.engagementMetrics,
        totalEngagement:
          post.engagementMetrics.likesCount +
          post.engagementMetrics.sharesCount +
          post.engagementMetrics.commentsCount,
        engagementRate:
          post.engagementMetrics.viewsCount > 0
            ? (
              ((post.engagementMetrics.likesCount +
                post.engagementMetrics.sharesCount +
                post.engagementMetrics.commentsCount) /
                post.engagementMetrics.viewsCount) * 100
            ).toFixed(2)
            : 0,
        publishedAt: post.publishedAt,
        daysSincePublished: post.publishedAt
          ? Math.floor(
            (Date.now() - new Date(post.publishedAt).getTime()) / (1000 * 60 * 60 * 24)
          )
          : null,
      };

      ResponseUtil.success(res, stats, 'Post stats retrieved successfully');
    } catch (error: any) {
      logger.error('Error in getPostStats controller:', error);
      next(error);
    }
  }
}

export const postController = new PostController();