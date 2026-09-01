import { Request, Response, NextFunction } from 'express';
import { postService } from '@/services';
import { CreatePostDTO, UpdatePostDTO, PostFilterQuery, PostStatus, PostType } from '../interfaces';
import logger from '@/shared/logger.util';
import ResponseUtil from '@/shared/response.util';

class PostController {
  // =====================================================
  // CREATE POST
  // =====================================================
  async createPost(req: Request, res: Response): Promise<void> {
    try {
      const { title, content, company, author, type, tags, scheduledFor } = req.body;

      // ✅ Files extract karo
      const files = req.files as {
        [fieldname: string]: Express.Multer.File[]
      } | undefined;

      const images = files?.images || [];
      const videos = files?.videos || [];
      const documents = files?.documents || [];

      // ✅ pollData parse karo (form-data mein string aata hai)
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

      const post = await postService.createPost({
        title,
        content,
        company,
        author,
        type,
        tags: tags ? (typeof tags === 'string' ? JSON.parse(tags) : tags) : [],
        scheduledFor,
        pollData,
        images,
        videos,
        documents,
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
      const objectId = (req as any).resolvedObjectId; // ✅ resolvePostUUID middleware se

      const post = await postService.getPostById(objectId);
      if (!post) {
        ResponseUtil.notFound(res, 'Post not found');
        return;
      }

      postService.incrementViews(objectId).catch((err) =>
        logger.error('Error incrementing views:', err)
      );

      ResponseUtil.success(res, post, 'Post retrieved successfully');
    } catch (error: any) {
      logger.error('Error in getPostById controller:', error);
      next(error);
    }
  }

  // =====================================================
  // GET POST BY SLUG — NO CHANGE (slug se ObjectId nahi chahiye)
  // =====================================================
  async getPostBySlug(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { slug } = req.params;

      const post = await postService.getPostBySlug(slug);
      if (!post) {
        ResponseUtil.notFound(res, 'Post not found');
        return;
      }

      postService.incrementViews(post._id.toString()).catch((err) =>
        logger.error('Error incrementing views:', err)
      );

      ResponseUtil.success(res, post, 'Post retrieved successfully');
    } catch (error: any) {
      logger.error('Error in getPostBySlug controller:', error);
      next(error);
    }
  }

  // =====================================================
  // LIST POSTS — NO CHANGE
  // =====================================================
  async listPosts(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
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
      ResponseUtil.success(res, { items: result.items, pagination: result.pagination }, 'Posts retrieved successfully');
    } catch (error: any) {
      logger.error('Error in listPosts controller:', error);
      next(error);
    }
  }

  // =====================================================
  // GET POSTS BY COMPANY — NO CHANGE (already resolvedObjectId use kar raha hai)
  // =====================================================
  async getPostsByCompany(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const companyObjectId = (req as any).resolvedObjectId;
      if (!companyObjectId) {
        ResponseUtil.badRequest(res, 'Company not found');
        return;
      }
      const page = parseInt(req.query.page as string) || 1;
      const pageSize = parseInt(req.query.pageSize as string) || 20;

      const result = await postService.getPostsByCompany(companyObjectId, page, pageSize);
      ResponseUtil.success(res, result, 'Company posts retrieved successfully');
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

      // ✅ Sirf allowed fields extract karo
      const { title, content, tags, status } = req.body;
      const updateData: UpdatePostDTO = {};

      if (title !== undefined) updateData.title = title;
      if (content !== undefined) updateData.content = content;
      if (tags !== undefined) updateData.tags = typeof tags === 'string'
        ? JSON.parse(tags) : tags;
      if (status !== undefined) updateData.status = status;

      if (Object.keys(updateData).length === 0) {
        ResponseUtil.badRequest(res, 'At least one field (title or content) is required');
        return;
      }

      const post = await postService.updatePost(objectId, updateData);
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
      const objectId = (req as any).resolvedObjectId; // ✅ CHANGED

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
      const objectId = (req as any).resolvedObjectId; // ✅ CHANGED

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
      const objectId = (req as any).resolvedObjectId; // ✅ CHANGED
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
  // INCREMENT LIKES
  // =====================================================
  async incrementLikes(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const objectId = (req as any).resolvedObjectId; // ✅ CHANGED
      await postService.incrementLikes(objectId);
      ResponseUtil.success(res, { success: true }, 'Like recorded');
    } catch (error: any) {
      logger.error('Error in incrementLikes controller:', error);
      next(error);
    }
  }

  // =====================================================
  // INCREMENT SHARES
  // =====================================================
  async incrementShares(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const objectId = (req as any).resolvedObjectId; // ✅ CHANGED
      await postService.incrementShares(objectId);
      ResponseUtil.success(res, { success: true }, 'Share recorded');
    } catch (error: any) {
      logger.error('Error in incrementShares controller:', error);
      next(error);
    }
  }

  // =====================================================
  // SEARCH POSTS — NO CHANGE
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

  // =====================================================
  // GET TRENDING POSTS — NO CHANGE
  // =====================================================
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

  // =====================================================
  // GET POPULAR POSTS — NO CHANGE
  // =====================================================
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

  // =====================================================
  // ADD: GET POSTS BY AUTHOR (employee UUID se)
  // =====================================================
  async getPostsByAuthor(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      // ✅ resolveEmployeeUUID middleware se aayega
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

  // =====================================================
  // GET POST STATS
  // =====================================================
  async getPostStats(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const objectId = (req as any).resolvedObjectId; // ✅ CHANGED

      const post = await postService.getPostById(objectId);
      if (!post) {
        ResponseUtil.notFound(res, 'Post not found');
        return;
      }

      const stats = {
        postId: post.postId,  // ✅ UUID expose karo, ObjectId nahi
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