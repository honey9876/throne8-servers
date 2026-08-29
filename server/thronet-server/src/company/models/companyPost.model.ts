import { PostStatus, PostType } from '../interfaces';
import mongoose, { Model, Query, Document, Schema } from 'mongoose';
import { v4 as uuidv4 } from 'uuid';

// Interface for Post Document
export interface IPostDocument extends Document {
  _id: mongoose.Types.ObjectId;
  postId: string;
  title: string;
  slug: string;
  content: string;
  company: mongoose.Types.ObjectId;
  author: mongoose.Types.ObjectId;
  type: PostType;
  media?: Array<{
    url: string;
    type: 'Image' | 'Video';
    caption?: string;
  }>;
  documents?: Array<{
    url: string;
    type: 'PDF' | 'DOC' | 'DOCX' | 'TXT';
    name: string;
    size?: number;
    caption?: string;
  }>;
  hasPoll?: boolean;
  pollData?: {
    question: string;
    options: Array<{
      optionId: string;
      text: string;
      votes: number;
      votedBy: string[];
    }>;
    duration: 1 | 3 | 7 | 14;
    endsAt: Date;
    totalVotes: number;
    isActive: boolean;
  };
  tags?: string[];
  engagementMetrics: {
    likesCount: number;
    commentsCount: number;
    sharesCount: number;
    viewsCount: number;
  };
  isPublished: boolean;
  publishedAt?: Date;
  scheduledFor?: Date;
  status: PostStatus;
  createdAt: Date;
  updatedAt: Date;
}

// Interface for instance methods
interface IPostMethods {
  publish(): Promise<IPostDocument>;
  archive(): Promise<IPostDocument>;
  incrementViews(): Promise<IPostDocument>;
  incrementLikes(): Promise<IPostDocument>;
  incrementShares(): Promise<IPostDocument>;
  incrementComments(): Promise<IPostDocument>;
  schedule(date: Date): Promise<IPostDocument>;
}

// Interface for static methods
interface IPostModel extends Model<IPostDocument, Record<string, never>, IPostMethods> {
  createPost(data: Partial<IPostDocument>): Promise<IPostDocument>;
  findPostById(id: string): Promise<IPostDocument | null>;
  findPostsByCompany(companyId: string, page?: number, limit?: number): Promise<IPostDocument[]>;
  findPostsByAuthor(authorId: string, page?: number, limit?: number): Promise<IPostDocument[]>;
  findPublishedPosts(page?: number, limit?: number): Query<IPostDocument[], IPostDocument>;
  findDraftPosts(companyId: string): Query<IPostDocument[], IPostDocument>;
  findScheduledPosts(): Promise<IPostDocument[]>;
  searchPosts(searchTerm: string, page?: number, limit?: number): Promise<IPostDocument[]>;
  getTrendingPosts(limit?: number): Promise<IPostDocument[]>;
  getPopularPosts(limit?: number): Promise<IPostDocument[]>;
  findByStatus(status: PostStatus, page?: number, limit?: number): Query<IPostDocument[], IPostDocument>;
}


// =====================================================
// schema
// =====================================================

export const CompanyPostSchema = new Schema(
  {
    postId: {
      type: String,
      required: true,
      unique: true,
      default: uuidv4,
    },
    title: {
      type: String,
      required: [true, 'Post title is required'],
      trim: true,
      minlength: [5, 'Title must be at least 5 characters'],
      maxlength: [200, 'Title cannot exceed 200 characters'],
    },
    slug: {
      type: String,
      required: false,  // ✅ FIXED: Changed from true to false
      unique: true,
      lowercase: true,
      sparse: true,  // ✅ ADDED: Allows null/undefined in unique index
    },
    content: {
      type: String,
      required: false,
      default: '',
    },
    company: {
      type: Schema.Types.ObjectId,
      ref: 'Company',
      required: true,
    },
    author: {
      type: Schema.Types.ObjectId,
      ref: 'Employee',
      required: true,
    },
    type: {
      type: String,
      enum: ['Blog', 'News', 'Update', 'Achievement'],
      default: 'Blog',
    },
    media: [
      {
        url: String,
        type: { type: String, enum: ['Image', 'Video'] },
        caption: String,
      },
    ],
    documents: [
      {
        url: { type: String, required: true },
        type: {
          type: String,
          enum: ['PDF', 'DOC', 'DOCX', 'TXT'],
          required: true,
        },
        name: { type: String, required: true, trim: true, maxlength: 255 },
        size: { type: Number },
        caption: { type: String, trim: true, maxlength: 500 },
      },
    ],
    pollData: {
      question: { type: String, maxlength: 140, trim: true },
      options: [{
        optionId: { type: String, default: () => uuidv4() },
        text: { type: String, required: true, maxlength: 100 },
        votes: { type: Number, default: 0 },
        votedBy: [{ type: String }],
      }],
      duration: { type: Number, enum: [1, 3, 7, 14] },
      endsAt: Date,
      totalVotes: { type: Number, default: 0 },
      isActive: { type: Boolean, default: true },
    },
    hasPoll: { type: Boolean, default: false },
    tags: [
      {
        type: String,
        lowercase: true,
      },
    ],
    engagementMetrics: {
      likesCount: { type: Number, default: 0 },
      commentsCount: { type: Number, default: 0 },
      sharesCount: { type: Number, default: 0 },
      viewsCount: { type: Number, default: 0 },
    },
    isPublished: {
      type: Boolean,
      default: false,
    },
    publishedAt: { type: Date },
    scheduledFor: { type: Date },
    status: {
      type: String,
      enum: ['Draft', 'Published', 'Archived', 'Scheduled'],
      default: 'Draft',
    },
  },
  {
    timestamps: true,
    collection: 'company_posts',
    versionKey: false
  }
);

// Indexes
CompanyPostSchema.index({ title: 'text', content: 'text' });
CompanyPostSchema.index({ company: 1, createdAt: -1 });
CompanyPostSchema.index({ author: 1, isPublished: 1 });
CompanyPostSchema.index({ 'engagementMetrics.likesCount': -1 });


// =====================================================
// PRE-SAVE MIDDLEWARE - AUTO SLUG GENERATION
// =====================================================
CompanyPostSchema.pre('save', async function (next) {
  try {
    // ✅ FIXED: Generate slug if title exists and (slug is empty OR title is modified)
    if (this.title && (!this.slug || this.isModified('title'))) {
      const baseSlug = this.title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');

      let slug = baseSlug;
      let counter = 1;

      // Get Post model safely
      const PostModel = (mongoose.models.CompanyPost as IPostModel) ||
        mongoose.model<IPostDocument, IPostModel>('CompanyPost', CompanyPostSchema);

      // Check for duplicate slugs
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const existingPost = await PostModel.findOne({
          slug,
          _id: { $ne: this._id }
        });

        if (!existingPost) break;

        slug = `${baseSlug}-${counter}`;
        counter++;
      }

      this.slug = slug;
    }

    // Auto-set publishedAt when publishing
    if (this.isModified('isPublished') && this.isPublished && !this.publishedAt) {
      this.publishedAt = new Date();
      this.status = PostStatus.PUBLISHED;
    }

    next();
  } catch (error: any) {
    next(error as Error);
  }
});

// =====================================================
// PRE-UPDATE MIDDLEWARE
// =====================================================
CompanyPostSchema.pre(['findOneAndUpdate', 'updateOne'], async function (next) {
  try {
    const update = this.getUpdate() as Record<string, unknown>;

    // Auto-generate slug if title is updated
    if (update?.title && typeof update.title === 'string') {
      const baseSlug = update.title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');

      let slug = baseSlug;
      let counter = 1;

      const PostModel = (mongoose.models['CompanyPost'] as IPostModel) ||
        mongoose.model<IPostDocument, IPostModel>('CompanyPost', CompanyPostSchema);

      const currentDoc = await this.model.findOne(this.getQuery());

      // eslint-disable-next-line no-constant-condition
      while (true) {
        const existingPost = await PostModel.findOne({
          slug,
          _id: { $ne: currentDoc?._id }
        });

        if (!existingPost) break;

        slug = `${baseSlug}-${counter}`;
        counter++;
      }

      update.slug = slug;
    }

    // Auto-set publishedAt when publishing via update
    if (update?.isPublished === true && !update.publishedAt) {
      update.publishedAt = new Date();
      update.status = PostStatus.PUBLISHED;
    }

    next();
  } catch (error: any) {
    next(error as Error);
  }
});

// =====================================================
// INSTANCE METHODS
// =====================================================

// Publish post
CompanyPostSchema.methods.publish = async function (this: IPostDocument) {
  this.isPublished = true;
  this.publishedAt = new Date();
  this.status = PostStatus.PUBLISHED;
  this.scheduledFor = undefined; // Clear schedule
  return this.save();
};

// Archive post
CompanyPostSchema.methods.archive = async function (this: IPostDocument) {
  this.status = PostStatus.ARCHIVED;
  this.isPublished = false;
  return this.save();
};

// Increment views (atomic operation)
CompanyPostSchema.methods.incrementViews = async function () {
  await (mongoose.models['CompanyPost'] as IPostModel).updateOne(
    { _id: this._id },
    { $inc: { 'engagementMetrics.viewsCount': 1 } }
  );
  this.engagementMetrics.viewsCount += 1;
  return this;
};

// Increment likes (atomic operation)
CompanyPostSchema.methods.incrementLikes = async function (this: IPostDocument) {
  await (mongoose.models['CompanyPost'] as IPostModel).updateOne(
    { _id: this._id },
    { $inc: { 'engagementMetrics.likesCount': 1 } }
  );
  this.engagementMetrics.likesCount += 1;
  return this;
};

// Increment shares (atomic operation)
CompanyPostSchema.methods.incrementShares = async function (this: IPostDocument) {
  await (mongoose.models['CompanyPost'] as IPostModel).updateOne(
    { _id: this._id },
    { $inc: { 'engagementMetrics.sharesCount': 1 } }
  );
  this.engagementMetrics.sharesCount += 1;
  return this;
};

// Increment comments (atomic operation)
CompanyPostSchema.methods.incrementComments = async function (this: IPostDocument) {
  await (mongoose.models['CompanyPost'] as IPostModel).updateOne(
    { _id: this._id },
    { $inc: { 'engagementMetrics.commentsCount': 1 } }
  );
  this.engagementMetrics.commentsCount += 1;
  return this;
};

// Schedule post
CompanyPostSchema.methods.schedule = async function (this: IPostDocument, date: Date) {
  this.scheduledFor = date;
  this.status = PostStatus.SCHEDULED;
  this.isPublished = false;
  return this.save();
};

// =====================================================
// STATIC METHODS
// =====================================================

// Create post with validation
CompanyPostSchema.statics.createPost = async function (data: Partial<IPostDocument>) {
  const post = new this(data);
  return post.save();
};

// Find post by ID with population
CompanyPostSchema.statics.findPostById = async function (id: string) {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return null;
  }
  // ✅ FIXED: Temporarily removed employee population until Employee Service is ready
  return this.findById(id)
    .populate('company', 'name slug logo')
    // .populate('author', 'firstName lastName email')  // Commented until Employee model exists
    .exec();
};

// Find posts by company with pagination
CompanyPostSchema.statics.findPostsByCompany = async function (
  companyId: string,
  page = 1,
  limit = 20
) {
  if (!mongoose.Types.ObjectId.isValid(companyId)) {
    return [];
  }

  const skip = (page - 1) * limit;

  return this.find({ company: companyId })
    .populate('author', 'firstName lastName')
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit)
    .lean()
    .exec();
};

// Find posts by author
CompanyPostSchema.statics.findPostsByAuthor = async function (
  authorId: string,
  page = 1,
  limit = 20
) {
  if (!mongoose.Types.ObjectId.isValid(authorId)) {
    return [];
  }

  const skip = (page - 1) * limit;

  return this.find({ author: authorId })
    .populate('company', 'name slug logo')
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit)
    .lean()
    .exec();
};

// Find published posts
CompanyPostSchema.statics.findPublishedPosts = function (page = 1, limit = 20) {
  const skip = (page - 1) * limit;

  return this.find({ isPublished: true, status: PostStatus.PUBLISHED })
    .populate('company', 'name slug logo')
    .populate('author', 'firstName lastName')
    .sort({ publishedAt: -1 })
    .skip(skip)
    .limit(limit);
};

// Find draft posts by company
CompanyPostSchema.statics.findDraftPosts = function (companyId: string) {
  if (!mongoose.Types.ObjectId.isValid(companyId)) {
    return this.find({ _id: null }); // Return empty query
  }

  return this.find({
    company: companyId,
    status: PostStatus.DRAFT,
    isPublished: false,
  }).sort({ updatedAt: -1 });
};

// Find scheduled posts (ready to publish)
CompanyPostSchema.statics.findScheduledPosts = async function () {
  const now = new Date();

  return this.find({
    scheduledFor: { $lte: now },
    isPublished: false,
    status: PostStatus.SCHEDULED,  // ✅ DRAFT se SCHEDULED
  })
    .populate('company', 'companyName')
    .populate('author', 'firstName lastName')
    .exec();
};

// Search posts by text
CompanyPostSchema.statics.searchPosts = async function (
  searchTerm: string,
  page = 1,
  limit = 20
) {
  if (!searchTerm || searchTerm.trim().length === 0) {
    return [];
  }

  const skip = (page - 1) * limit;

  return this.find(
    {
      $text: { $search: searchTerm },
      isPublished: true,
      status: PostStatus.PUBLISHED,
    },
    { score: { $meta: 'textScore' } }
  )
    .populate('company', 'name slug logo')
    .populate('author', 'firstName lastName')
    .sort({ score: { $meta: 'textScore' } })
    .skip(skip)
    .limit(limit)
    .lean()
    .exec();
};

// Get trending posts (high engagement in last 7 days)
CompanyPostSchema.statics.getTrendingPosts = async function (limit = 10) {
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  return this.find({
    isPublished: true,
    status: PostStatus.PUBLISHED,
    publishedAt: { $gte: sevenDaysAgo },
  })
    .populate('company', 'name slug logo')
    .populate('author', 'firstName lastName')
    .sort({
      'engagementMetrics.likesCount': -1,
      'engagementMetrics.sharesCount': -1,
      'engagementMetrics.viewsCount': -1,
    })
    .limit(limit)
    .lean()
    .exec();
};

// Get popular posts (all time)
CompanyPostSchema.statics.getPopularPosts = async function (limit = 10) {
  return this.find({
    isPublished: true,
    status: PostStatus.PUBLISHED,
  })
    .populate('company', 'name slug logo')
    .populate('author', 'firstName lastName')
    .sort({
      'engagementMetrics.likesCount': -1,
      'engagementMetrics.viewsCount': -1,
    })
    .limit(limit)
    .lean()
    .exec();
};

// Find by status
CompanyPostSchema.statics.findByStatus = function (
  status: PostStatus,
  page = 1,
  limit = 20
) {
  const skip = (page - 1) * limit;

  return this.find({ status })
    .populate('company', 'name slug logo')
    .populate('author', 'firstName lastName')
    .sort({ updatedAt: -1 })
    .skip(skip)
    .limit(limit);
};

// =====================================================
// VIRTUALS
// =====================================================

// Engagement rate virtual
CompanyPostSchema.virtual('engagementRate').get(function (this: IPostDocument) {
  const { viewsCount, likesCount, sharesCount, commentsCount } = this.engagementMetrics;
  if (viewsCount === 0) return 0;

  const totalEngagement = likesCount + sharesCount + commentsCount;
  return ((totalEngagement / viewsCount) * 100).toFixed(2);
});

// Total engagement virtual
CompanyPostSchema.virtual('totalEngagement').get(function (this: IPostDocument) {
  const { likesCount, sharesCount, commentsCount } = this.engagementMetrics;
  return likesCount + sharesCount + commentsCount;
});

// Is scheduled virtual
CompanyPostSchema.virtual('isScheduled').get(function (this: IPostDocument) {
  return Boolean(this.scheduledFor && this.scheduledFor > new Date() && !this.isPublished);
});

// =====================================================
// JSON/OBJECT TRANSFORMATIONS
// =====================================================
CompanyPostSchema.set('toJSON', {
  virtuals: true,
  transform: function (_doc, ret) {
    // delete ret.__v;
    return ret;
  },
});

CompanyPostSchema.set('toObject', { virtuals: true });

// =====================================================
// CREATE AND EXPORT MODEL
// =====================================================
const CompanyPost = (mongoose.models['CompanyPost'] as IPostModel) ||
  mongoose.model<IPostDocument, IPostModel>('CompanyPost', CompanyPostSchema);

export default CompanyPost;
