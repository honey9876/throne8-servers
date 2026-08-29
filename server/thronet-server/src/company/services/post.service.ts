import mongoose from 'mongoose';
import { IPostDocument } from '../models/companyPost.model';
import { Company, CompanyPost } from '../models';
import { CreatePostDTO, UpdatePostDTO, PostFilterQuery, PostListResponse, PostResponseDTO, PostStatus } from '../interfaces';
import logger from '@/shared/logger.util';
import { v4 as uuidv4 } from 'uuid';
import CacheUtil from '@/shared/cache.util';
import companyRepository from '../repositories/company.repository';
import postRepository from '../repositories/post.repository';
import employeeRepository from '../repositories/employee.repository';
import cloudinary from '@/config/images/store/cloudinary/cloudinary.config';

class PostService {
  private readonly CACHE_PREFIX = 'post:';
  private readonly CACHE_TTL = 300; // 5 minutes
  private readonly LIST_CACHE_TTL = 120; // 2 minutes

  // =====================================================
  // CREATE POST
  // =====================================================
  async createPost(data: CreatePostDTO & {
    pollData?: {
      question: string;
      options: string[];
      duration: 1 | 3 | 7 | 14;
    };
    images?: Express.Multer.File[];
    videos?: Express.Multer.File[];
    documents?: Express.Multer.File[];   // ✅ already hai — bas logic add karna hai
  }): Promise<IPostDocument> {
    try {
      let company = await companyRepository.findByUUID(data.company);
      if (!company && mongoose.Types.ObjectId.isValid(data.company)) {
        company = await companyRepository.findByObjectId(data.company);
      }
      if (!company) throw new Error('Company not found');

      let author = data.author ? await employeeRepository.findByUUID(data.author) : null;
      if (!author && data.author && mongoose.Types.ObjectId.isValid(data.author)) {
        author = await employeeRepository.findByObjectId(data.author);
      }
      if (!author) {
        const [companyEmps] = await employeeRepository.findByCompanyObjectId(company._id.toString(), 0, 1);
        if (companyEmps && companyEmps.length > 0) {
          author = companyEmps[0];
        } else {
          const slug = company.companySlug || (company as any).slug || 'company';
          author = await employeeRepository.create({
            firstName: company.companyName || 'Company',
            lastName: 'Team',
            email: `team@${slug}-${company._id.toString().slice(-4)}.com`,
            company: company._id,
            designation: 'Admin / Author',
            department: 'Leadership',
            isActive: true,
            isAdvocate: true,
            joinDate: new Date(),
          });
        }
      }
      if (!author) throw new Error('Author (employee) not found');

      // ✅ Media upload (images + videos) — same as before
      const uploadedMedia: Array<{
        url: string;
        type: 'Image' | 'Video';
        caption?: string;
      }> = [];

      if (data.images && data.images.length > 0) {
        for (const file of data.images) {
          const result = await this.uploadToCloudinary(
            file.buffer, 'company-post-images', 'image'
          );
          uploadedMedia.push({ url: result.secure_url, type: 'Image' });
        }
      }

      if (data.videos && data.videos.length > 0) {
        for (const file of data.videos) {
          const result = await this.uploadToCloudinary(
            file.buffer, 'company-post-videos', 'video'
          );
          uploadedMedia.push({ url: result.secure_url, type: 'Video' });
        }
      }

      // ✅ ADD: Documents upload
      const uploadedDocuments: Array<{
        url: string;
        type: 'PDF' | 'DOC' | 'DOCX' | 'TXT';
        name: string;
        size?: number;
        caption?: string;
      }> = [];

      if (data.documents && data.documents.length > 0) {
        for (const file of data.documents) {
          const result = await this.uploadToCloudinary(
            file.buffer, 'company-post-documents', 'raw'
          );

          // File extension se type determine karo
          const ext = file.originalname.split('.').pop()?.toUpperCase() || 'PDF';
          const docType = ['PDF', 'DOC', 'DOCX', 'TXT'].includes(ext)
            ? (ext as 'PDF' | 'DOC' | 'DOCX' | 'TXT')
            : 'PDF';

          uploadedDocuments.push({
            url: result.secure_url,
            type: docType,
            name: file.originalname,
            size: file.size,
          });
        }
      }

      // ✅ Poll Setup — same as before
      let pollSetup: {
        question: string;
        options: { optionId: string; text: string; votes: number; votedBy: string[] }[];
        duration: 1 | 3 | 7 | 14;
        endsAt: Date;
        totalVotes: number;
        isActive: boolean;
      } | undefined = undefined;

      if (data.pollData) {
        const pollEndsAt = new Date();
        pollEndsAt.setDate(pollEndsAt.getDate() + data.pollData.duration);

        pollSetup = {
          question: data.pollData.question,
          options: data.pollData.options.map((opt: string) => ({
            optionId: uuidv4(),
            text: opt,
            votes: 0,
            votedBy: [] as string[],
          })),
          duration: data.pollData.duration,
          endsAt: pollEndsAt,
          totalVotes: 0,
          isActive: true,
        };
      }

      // ✅ Clean data — exclude raw inputs
      const {
        pollData: _pollData,
        images: _images,
        videos: _videos,
        documents: _documents,
        ...cleanData
      } = data;

      let postStatus: PostStatus = PostStatus.PUBLISHED;
      let isPublished = true;
      let scheduledFor: Date | undefined;

      if (data.status) {
        const s = String(data.status).toLowerCase();
        if (s === 'published') {
          postStatus = PostStatus.PUBLISHED;
          isPublished = true;
        } else if (s === 'draft') {
          postStatus = PostStatus.DRAFT;
          isPublished = false;
        } else if (s === 'scheduled') {
          postStatus = PostStatus.SCHEDULED;
          isPublished = false;
        }
      }

      const scheduleDateVal = data.scheduledFor || (data as any).scheduledAt;
      if (scheduleDateVal) {
        const scheduledDate = new Date(scheduleDateVal);
        if (scheduledDate > new Date()) {
          postStatus = PostStatus.SCHEDULED;
          scheduledFor = scheduledDate;
          isPublished = false;
        }
      }

      const post = await postRepository.create({
        ...cleanData,
        company: company._id,
        author: author._id,
        status: postStatus,
        isPublished,
        publishedAt: isPublished ? new Date() : undefined,
        scheduledFor,
        media: [
          ...(cleanData.media || []),
          ...uploadedMedia,
        ],
        ...(uploadedDocuments.length > 0 && {
          documents: uploadedDocuments,
        }),
        ...(pollSetup && {
          hasPoll: true,
          pollData: pollSetup,
        }),
      });

      await Company.findByIdAndUpdate(company._id, {
        $inc: { 'stats.postsCount': 1 }
      });

      await CacheUtil.del(`company:${data.company}`);
      await CacheUtil.del(`company:${company.companySlug}:posts`);
      await CacheUtil.clearByPattern(`${this.CACHE_PREFIX}company:*`);

      logger.info(`Post created: ${post._id}`);
      return post;

    } catch (error: any) {
      logger.error('Error creating post:', error);
      throw error;
    }
  }

  // ✅ Cloudinary upload helper (supports images, videos, documents)
  private async uploadToCloudinary(
    buffer: Buffer,
    folder: string,
    resourceType: 'image' | 'video' | 'raw'
  ): Promise<any> {
    return new Promise((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        {
          folder,
          public_id: `post_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
          resource_type: resourceType === 'video' ? 'auto' : resourceType,
          overwrite: true,
        },
        (error, result) => {
          if (error) {
            logger.error('❌ [CLOUDINARY UPLOAD ERROR]', {
              folder,
              resourceType,
              error: error.message || error,
            });
            return reject(new Error(`Cloudinary upload failed: ${error.message || error}`));
          }
          resolve(result);
        }
      );

      uploadStream.end(buffer);
    });
  }

  // =====================================================
  // GET POST BY ID
  // =====================================================
  async getPostById(id: string): Promise<IPostDocument | null> {
    try {
      // Check cache first
      const cacheKey = `${this.CACHE_PREFIX}${id}`;
      const cached = await CacheUtil.get(cacheKey);

      if (cached) {
        logger.debug(`Cache hit for post: ${id}`);
        return cached;
      }

      // Fetch from DB
      const post = await postRepository.findById(id);

      if (post) {
        // ✅ FIXED: Removed JSON.stringify - CacheUtil handles it internally
        await CacheUtil.set(cacheKey, post, this.CACHE_TTL);
      }

      return post;
    } catch (error: any) {
      logger.error(`Error getting post ${id}:`, error);
      throw error;
    }
  }

  // =====================================================
  // GET POST BY SLUG
  // =====================================================
  async getPostBySlug(slug: string): Promise<IPostDocument | null> {
    try {
      const cacheKey = `${this.CACHE_PREFIX}slug:${slug}`;
      // const cached = await CacheUtil.get<IPostDocument>(cacheKey);
      const cached = await CacheUtil.get(cacheKey);

      if (cached) {
        return cached;
      }


      const post = await CompanyPost.findOne({ slug, isPublished: true })
        .populate('company', 'name slug logo')
        .populate('author', 'firstName lastName')
        .exec();

      if (post) {
        // ✅ FIXED: Removed JSON.stringify - CacheUtil handles it internally
        await CacheUtil.set(cacheKey, post, this.CACHE_TTL);
      }

      return post;
    } catch (error: any) {
      logger.error(`Error getting post by slug ${slug}:`, error);
      throw error;
    }
  }

  // =====================================================
  // LIST POSTS WITH FILTERS
  // =====================================================
  async listPosts(filters: PostFilterQuery): Promise<PostListResponse> {
    try {
      const {
        page = 1,
        pageSize = 20,
        company,
        author,
        type,
        status,
        search,
        tags,
        sort = 'recent',
      } = filters;

      const cacheKey = `${this.CACHE_PREFIX}list:${JSON.stringify(filters)}`;
      const cached = await CacheUtil.get(cacheKey);
      if (cached) return cached;

      const query: Record<string, unknown> = {};

      // ✅ Company filter — ObjectId se
      if (company) {
        if (mongoose.Types.ObjectId.isValid(company)) {
          query.company = new mongoose.Types.ObjectId(company);
        }
      }

      // ✅ Author filter — ObjectId se
      if (author) {
        if (mongoose.Types.ObjectId.isValid(author)) {
          query.author = new mongoose.Types.ObjectId(author);
        }
      }

      if (type) query.type = type;
      if (status) query.status = status;
      else query.status = { $ne: 'Archived' }; // archived posts default mein nahi dikhao
      if (tags?.length) query.tags = { $in: tags };
      if (search) query.$text = { $search: search };

      const sortMap: Record<string, Record<string, 1 | -1>> = {
        trending: { 'engagementMetrics.likesCount': -1, 'engagementMetrics.viewsCount': -1 },
        engagement: { 'engagementMetrics.likesCount': -1, 'engagementMetrics.sharesCount': -1 },
        recent: { createdAt: -1 },
      };
      const sortQuery = sortMap[sort] || sortMap.recent;

      const skip = (page - 1) * pageSize;
      const [posts, total] = await postRepository.findWithFilters(
        query, sortQuery, skip, pageSize
      );

      const totalPages = Math.ceil(total / pageSize);
      const response: PostListResponse = {
        items: posts.map(p => this.transformPostToDTO(p)),
        pagination: { total, page, pageSize, totalPages, hasMore: page < totalPages },
      };

      await CacheUtil.set(cacheKey, response, this.LIST_CACHE_TTL);
      return response;
    } catch (error: any) {
      logger.error('Error listing posts:', error);
      throw error;
    }
  }

  // =====================================================
  // GET POSTS BY COMPANY
  // =====================================================
  async getPostsByCompany(
    companyObjectId: string,
    page = 1,
    pageSize = 20
  ): Promise<PostListResponse> {
    const cacheKey = `${this.CACHE_PREFIX}company:${companyObjectId}:${page}:${pageSize}`;
    const cached = await CacheUtil.get(cacheKey);
    if (cached) return cached;

    const skip = (page - 1) * pageSize;
    const [posts, total] = await postRepository.findByCompanyObjectId(
      companyObjectId, skip, pageSize
    );

    const totalPages = Math.ceil(total / pageSize);
    const response: PostListResponse = {
      items: posts.map(p => this.transformPostToDTO(p)),
      pagination: { total, page, pageSize, totalPages, hasMore: page < totalPages },
    };

    await CacheUtil.set(cacheKey, response, this.LIST_CACHE_TTL);
    return response;
  }

  // =====================================================
  // GET POSTS BY AUTHOR — employee UUID se
  // =====================================================
  async getPostsByAuthor(
    authorObjectId: string,
    page = 1,
    pageSize = 20
  ): Promise<PostListResponse> {
    const cacheKey = `${this.CACHE_PREFIX}author:${authorObjectId}:${page}:${pageSize}`;
    const cached = await CacheUtil.get(cacheKey);
    if (cached) return cached;

    const skip = (page - 1) * pageSize;
    const [posts, total] = await postRepository.findByAuthorObjectId(
      authorObjectId, skip, pageSize
    );

    const totalPages = Math.ceil(total / pageSize);
    const response: PostListResponse = {
      items: posts.map(p => this.transformPostToDTO(p)),
      pagination: { total, page, pageSize, totalPages, hasMore: page < totalPages },
    };

    await CacheUtil.set(cacheKey, response, this.LIST_CACHE_TTL);
    return response;
  }

  // =====================================================
  // UPDATE POST
  // =====================================================
  async updatePost(
    id: string,
    data: UpdatePostDTO & {
      existingMedia?: Array<{ url: string; type: 'Image' | 'Video'; caption?: string }>;
      images?: Express.Multer.File[];
      videos?: Express.Multer.File[];
      documents?: Express.Multer.File[];
    }
  ): Promise<IPostDocument | null> {
    try {
      const existing = await CompanyPost.findById(id);
      if (!existing) return null;

      const allowedUpdate: Partial<IPostDocument> = {};
      if (data.title !== undefined) allowedUpdate.title = data.title;
      if (data.content !== undefined) allowedUpdate.content = data.content;
      if (data.type !== undefined) allowedUpdate.type = data.type;
      if (data.tags !== undefined) allowedUpdate.tags = data.tags;
      if (data.status !== undefined) allowedUpdate.status = data.status;

      // Handle Media (images and videos)
      let updatedMedia: Array<{ url: string; type: 'Image' | 'Video'; caption?: string }> | undefined = undefined;

      if (data.existingMedia !== undefined) {
        updatedMedia = [...data.existingMedia];
      } else if ((data.images && data.images.length > 0) || (data.videos && data.videos.length > 0)) {
        updatedMedia = existing.media ? [...existing.media] : [];
      }

      // Upload new images to Cloudinary
      if (data.images && data.images.length > 0) {
        if (!updatedMedia) updatedMedia = [];
        for (const file of data.images) {
          const result = await this.uploadToCloudinary(
            file.buffer, 'company-post-images', 'image'
          );
          updatedMedia.push({ url: result.secure_url, type: 'Image' });
        }
      }

      // Upload new videos to Cloudinary
      if (data.videos && data.videos.length > 0) {
        if (!updatedMedia) updatedMedia = [];
        for (const file of data.videos) {
          const result = await this.uploadToCloudinary(
            file.buffer, 'company-post-videos', 'video'
          );
          updatedMedia.push({ url: result.secure_url, type: 'Video' });
        }
      }

      if (updatedMedia !== undefined) {
        allowedUpdate.media = updatedMedia;
      }

      // Upload new documents to Cloudinary if provided
      if (data.documents && data.documents.length > 0) {
        const updatedDocuments = existing.documents ? [...existing.documents] : [];
        for (const file of data.documents) {
          const result = await this.uploadToCloudinary(
            file.buffer, 'company-post-documents', 'raw'
          );
          const ext = file.originalname.split('.').pop()?.toUpperCase() || 'PDF';
          const docType = ['PDF', 'DOC', 'DOCX', 'TXT'].includes(ext)
            ? (ext as 'PDF' | 'DOC' | 'DOCX' | 'TXT')
            : 'PDF';

          updatedDocuments.push({
            url: result.secure_url,
            type: docType,
            name: file.originalname,
            size: file.size,
          });
        }
        allowedUpdate.documents = updatedDocuments;
      }

      const post = await postRepository.updateById(id, allowedUpdate);
      if (!post) return null;

      await this.invalidatePostCache(id, post.company.toString(), post.slug);
      logger.info(`Post updated: ${id}`);
      return post;
    } catch (error: any) {
      logger.error(`Error updating post ${id}:`, error);
      throw error;
    }
  }


  // =====================================================
  // DELETE POST (SOFT DELETE)
  // =====================================================
  async deletePost(id: string): Promise<boolean> {
    try {
      const post = await CompanyPost.findById(id);
      if (!post) {
        return false;
      }

      const companyId = post.company.toString();

      // Archive the post
      await post.archive();

      // Decrement company post count safely
      try {
        const company = await Company.findById(companyId);
        if (company) {
          await company.decrementStat('postsCount');
        }
      } catch (statError: any) {
        logger.warn(`Could not decrement postsCount for company ${companyId}:`, { error: statError?.message });
      }

      // Invalidate caches
      await this.invalidatePostCache(id, companyId, post.slug);

      logger.info(`Post deleted: ${id}`);
      return true;
    } catch (error: any) {
      logger.error(`Error deleting post ${id}:`, error);
      throw error;
    }
  }

  // =====================================================
  // PUBLISH POST
  // =====================================================
  async publishPost(id: string): Promise<IPostDocument | null> {
    try {
      const post = await CompanyPost.findById(id);
      if (!post) {
        return null;
      }

      await post.publish();

      // Invalidate caches
      await this.invalidatePostCache(id, post.company.toString(), post.slug);

      logger.info(`Post published: ${id}`);
      return post;
    } catch (error: any) {
      logger.error(`Error publishing post ${id}:`, error);
      throw error;
    }
  }

  // =====================================================
  // SCHEDULE POST
  // =====================================================
  async schedulePost(id: string, scheduledFor: Date): Promise<IPostDocument | null> {
    try {
      const post = await CompanyPost.findById(id);
      if (!post) {
        return null;
      }

      // Validate future date
      if (scheduledFor <= new Date()) {
        throw new Error('Scheduled date must be in the future');
      }

      await post.schedule(scheduledFor);

      // Invalidate caches
      await this.invalidatePostCache(id, post.company.toString(), post.slug);

      logger.info(`Post scheduled: ${id} for ${scheduledFor}`);
      return post;
    } catch (error: any) {
      logger.error(`Error scheduling post ${id}:`, error);
      throw error;
    }
  }

  // =====================================================
  // INCREMENT VIEWS
  // =====================================================
  async incrementViews(id: string): Promise<void> {
    await postRepository.incrementField(id, 'engagementMetrics.viewsCount');
    await CacheUtil.del(`${this.CACHE_PREFIX}${id}`);
  }

  // =====================================================
  // INCREMENT LIKES
  // =====================================================
  async incrementLikes(id: string): Promise<void> {
    await postRepository.incrementField(id, 'engagementMetrics.likesCount');
    await CacheUtil.del(`${this.CACHE_PREFIX}${id}`);
  }

  // =====================================================
  // INCREMENT SHARES
  // =====================================================
  async incrementShares(id: string): Promise<void> {
    await postRepository.incrementField(id, 'engagementMetrics.sharesCount');
    await CacheUtil.del(`${this.CACHE_PREFIX}${id}`);
  }

  // =====================================================
  // SEARCH POSTS
  // =====================================================
  async searchPosts(
    searchTerm: string,
    page = 1,
    pageSize = 20
  ): Promise<PostListResponse> {
    try {
      const cacheKey = `${this.CACHE_PREFIX}search:${searchTerm}:${page}:${pageSize}`;
      const cached = await CacheUtil.get(cacheKey);

      if (cached) {
        return cached;
      }

      const [posts, total] = await Promise.all([
        CompanyPost.searchPosts(searchTerm, page, pageSize),
        CompanyPost.countDocuments({
          $text: { $search: searchTerm },
          isPublished: true,
        }),
      ]);

      const totalPages = Math.ceil(total / pageSize);
      const transformedPosts = posts.map((post: any) => this.transformPostToDTO(post));

      const response: PostListResponse = {
        items: transformedPosts,
        pagination: {
          total,
          page,
          pageSize,
          totalPages,
          hasMore: page < totalPages
        }
      };

      await CacheUtil.set(cacheKey, response, this.LIST_CACHE_TTL);
      return response;
    } catch (error: any) {
      logger.error('Error searching posts:', error);
      throw error;
    }
  }

  // =====================================================
  // GET TRENDING POSTS
  // =====================================================
  async getTrendingPosts(limit = 10): Promise<PostResponseDTO[]> {
    try {
      const cacheKey = `${this.CACHE_PREFIX}trending:${limit}`;
      const cached = await CacheUtil.get(cacheKey);

      if (cached) {
        return cached;
      }

      const posts = await CompanyPost.getTrendingPosts(limit);
      const transformedPosts = posts.map((post: any) => this.transformPostToDTO(post));

      // ✅ FIXED: Removed JSON.stringify - CacheUtil handles it internally
      await CacheUtil.set(cacheKey, transformedPosts, this.CACHE_TTL);

      return transformedPosts;
    } catch (error: any) {
      logger.error('Error getting trending posts:', error);
      throw error;
    }
  }

  // =====================================================
  // GET POPULAR POSTS
  // =====================================================
  // async getPopularPosts (limit = 10): Promise<PostResponseDTO[]> {
  async getPopularPosts(limit = 10): Promise<any> {
    try {
      const cacheKey = `${this.CACHE_PREFIX}popular:${limit}`;
      const cached = await CacheUtil.get(cacheKey);

      if (cached) {
        return cached;
      }

      const posts = await CompanyPost.getPopularPosts(limit);
      const transformedPosts = posts.map((post: any) => this.transformPostToDTO(post));

      // ✅ FIXED: Removed JSON.stringify - CacheUtil handles it internally
      await CacheUtil.set(cacheKey, transformedPosts, this.CACHE_TTL);

      return transformedPosts;
    } catch (error: any) {
      logger.error('Error getting popular posts:', error);
      throw error;
    }
  }

  // =====================================================
  // GET SCHEDULED POSTS (For background job)
  // =====================================================
  async getScheduledPosts(): Promise<IPostDocument[]> {
    try {
      return await CompanyPost.findScheduledPosts();
    } catch (error: any) {
      logger.error('Error getting scheduled posts:', error);
      throw error;
    }
  }

  // =====================================================
  // HELPER: TRANSFORM POST TO DTO
  // =====================================================
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private transformPostToDTO(post: any): PostResponseDTO {
    return {
      _id: post._id.toString(),
      postId: post.postId,           // ✅ UUID
      title: post.title,
      slug: post.slug,
      content: post.content,
      company: post.company
        ? {
          _id: post.company._id?.toString() || post.company.toString(),
          name: post.company.companyName || post.company.name || '',
          logo: post.company.media?.logo?.url || post.company.logo,
        }
        : { _id: '', name: '', logo: undefined },
      author: post.author
        ? {
          _id: post.author._id?.toString() || post.author.toString(),
          firstName: post.author.firstName || '',
          lastName: post.author.lastName || '',
        }
        : { _id: '', firstName: '', lastName: '' },
      type: post.type,
      media: post.media || [],
      documents: post.documents || [],   // ✅ documents
      hasPoll: post.hasPoll || false,    // ✅ poll info
      pollData: post.pollData ? {
        question: post.pollData.question,
        options: post.pollData.options?.map((opt: any) => ({
          optionId: opt.optionId,
          text: opt.text,
          votes: opt.votes,
          // votedBy expose mat karo — privacy
        })),
        duration: post.pollData.duration,
        endsAt: post.pollData.endsAt,
        totalVotes: post.pollData.totalVotes,
        isActive: post.pollData.isActive,
      } : undefined,
      tags: post.tags || [],
      engagementMetrics: post.engagementMetrics || {
        likesCount: 0,
        commentsCount: 0,
        sharesCount: 0,
        viewsCount: 0,
      },
      status: post.status,
      isPublished: post.isPublished,
      publishedAt: post.publishedAt,
      scheduledFor: post.scheduledFor,   // ✅ scheduled info
      createdAt: post.createdAt,
      updatedAt: post.updatedAt,
    };
  }

  // =====================================================
  // HELPER: INVALIDATE CACHE
  // =====================================================
  private async invalidatePostCache(
    postId: string,
    companyId: string,
    slug: string
  ): Promise<void> {
    try {
      await Promise.all([
        CacheUtil.del(`${this.CACHE_PREFIX}${postId}`),
        CacheUtil.del(`${this.CACHE_PREFIX}slug:${slug}`),
        CacheUtil.clearByPattern(`${this.CACHE_PREFIX}company:${companyId}:*`),
        CacheUtil.clearByPattern(`${this.CACHE_PREFIX}list:*`),
      ]);
    } catch (error: any) {
      logger.warn('Error invalidating cache:', error);
    }
  }
}

export default new PostService();