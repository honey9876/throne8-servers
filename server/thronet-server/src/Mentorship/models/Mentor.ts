import mongoose, { Schema, Document } from 'mongoose';
import { v4 as uuidv4 } from 'uuid';
import { Domain } from '@/shared/constants/domains';
import { ExperienceLevel, IMentor, MentorStatus } from '@/Mentorship/interface/mentor.types';

export interface MentorDocument extends Omit<IMentor, '_id'>, Document {}

const MentorSchema = new Schema<MentorDocument>(
  {
    mentorId: {
      type: String,
      required: true,
      unique: true,
      index: true,
      default: () => uuidv4(),
      validate: {
        validator: (v: string) =>
          /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v),
        message: 'Invalid mentor UUID format',
      },
    },
    userId: {
      type: String,
      required: [true, 'User ID is required'],
      unique: true,
      index: true,
    },
    profilePic: { type: String, trim: true },
    bannerImage: { type: String, trim: true },
    cloudinaryPublicId: { type: String, trim: true },
    companyId: { type: String, index: true },
    status: {
      type: String,
      enum: Object.values(MentorStatus),
      default: MentorStatus.PENDING_APPROVAL,
      index: true,
    },
    title: {
      type: String,
      required: [true, 'Title is required'],
      trim: true,
      maxlength: [100, 'Title cannot exceed 100 characters'],
    },
    bio: {
      type: String,
      required: [true, 'Bio is required'],
      trim: true,
      minlength: [50, 'Bio must be at least 50 characters'],
      maxlength: [2000, 'Bio cannot exceed 2000 characters'],
    },
    tagline: {
      type: String,
      trim: true,
      maxlength: [150, 'Tagline cannot exceed 150 characters'],
    },
    domains: {
      type: [String],
      enum: Object.values(Domain),
      required: [true, 'At least one domain is required'],
      validate: {
        validator: (v: string[]) => v.length > 0 && v.length <= 5,
        message: 'Must have 1-5 domains',
      },
      index: true,
    },
    skills: {
      type: [String],
      required: [true, 'At least one skill is required'],
      validate: {
        validator: (v: string[]) => v.length > 0 && v.length <= 20,
        message: 'Must have 1-20 skills',
      },
    },
    languages: { type: [String], default: ['English'] },
    experience: {
      total: { type: Number, required: [true, 'Total experience is required'], min: 0, max: 50 },
      level: { type: String, enum: Object.values(ExperienceLevel) }, // backend sets this
      currentRole: { type: String, required: [true, 'Current role is required'], trim: true },
      previousRoles: [
        {
          title: { type: String, required: true },
          company: { type: String, required: true },
          duration: { type: String, required: true },
        },
      ],
    },
    pricing: {
      quickCall:      { type: Number, default: 0, min: 0 },
      deepDive:       { type: Number, default: 0, min: 0 },
      resumeReview:   { type: Number, default: 0, min: 0 },
      mockInterview:  { type: Number, default: 0, min: 0 },
      careerPlanning: { type: Number, default: 0, min: 0 },
      portfolioReview:{ type: Number, default: 0, min: 0 },
      askQuery:       { type: Number, default: 0, min: 0 },
      groupSession:   { type: Number, default: 0, min: 0 },
    },
    stats: {
      totalSessions:     { type: Number, default: 0, min: 0 },
      completedSessions: { type: Number, default: 0, min: 0 },
      cancelledSessions: { type: Number, default: 0, min: 0 },
      totalEarnings:     { type: Number, default: 0, min: 0 },
      averageRating:     { type: Number, default: 0, min: 0, max: 5 },
      totalReviews:      { type: Number, default: 0, min: 0 },
      responseTime:      { type: Number, default: 0, min: 0 },
      completionRate:    { type: Number, default: 100, min: 0, max: 100 },
    },
    availability: {
      timezone:            { type: String, default: 'UTC' },
      daysAvailable: {
        type: [String],
        enum: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'],
        default: [],
      },
      preferredHours: {
        start: { type: String },
        end:   { type: String },
      },
      autoAcceptBookings:     { type: Boolean, default: false },
      maxSessionsPerDay:      { type: Number, default: 5, min: 1, max: 15 },
      bufferBetweenSessions:  { type: Number, default: 15, min: 0 },
    },
    socialProof: {
      linkedinUrl:    { type: String, trim: true },
      githubUrl:      { type: String, trim: true },
      portfolioUrl:   { type: String, trim: true },
      twitterUrl:     { type: String, trim: true },
      websiteUrl:     { type: String, trim: true },
      certifications: [String],
      achievements:   [String],
    },
    preferences: {
      acceptGroupSessions:  { type: Boolean, default: true },
      maxGroupSize:         { type: Number, default: 10, min: 2, max: 50 },
      acceptQueries:        { type: Boolean, default: true },
      maxQueriesPerWeek:    { type: Number, default: 10, min: 0, max: 50 },
      notificationPreferences: {
        email: { type: Boolean, default: true },
        sms:   { type: Boolean, default: false },
        push:  { type: Boolean, default: true },
      },
    },
    verification: {
      isVerified:           { type: Boolean, default: false },
      verifiedAt:           { type: Date },
      verifiedBy:           { type: String },
      verificationDocuments:[String],
    },
    featured: {
      isFeatured:    { type: Boolean, default: false, index: true },
      featuredUntil: { type: Date },
      featuredOrder: { type: Number, default: 0 },
    },
    trustScore: {
      overall: { type: Number, default: 0 },
      breakdown: {
        profileCompleteness: { type: Number, default: 0 },
        reliability: { type: Number, default: 0 },
        studentSatisfaction: { type: Number, default: 0 },
        engagement: { type: Number, default: 0 }
      },
      metrics: {
        totalCompletedSessions: { type: Number, default: 0 },
        totalCancelledSessions: { type: Number, default: 0 },
        averageRating: { type: Number, default: 0 },
        reviewCount: { type: Number, default: 0 }
      },
      version: { type: String, default: "1.0" },
      lastCalculatedAt: { type: Date }
    },
    isDeleted: { type: Boolean, default: false, index: true },
    deletedAt: { type: Date },
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
      transform: (_doc, ret) => {
        ret.id = ret.mentorId;
        delete (ret as any)._id;
        delete (ret as any).__v;
        return ret;
      },
    },
    toObject: { virtuals: true },
  }
);

// ── Compound Indexes ─────────────────────────────────────────────
MentorSchema.index({ userId: 1, status: 1 });
MentorSchema.index({ userId: 1, isDeleted: 1 });
MentorSchema.index({ domains: 1, status: 1 });
MentorSchema.index({ 'stats.averageRating': -1 });
MentorSchema.index({ 'experience.total': -1 });
MentorSchema.index({ 'featured.isFeatured': 1, 'featured.featuredOrder': 1 });
MentorSchema.index({ companyId: 1, status: 1 });
MentorSchema.index({ createdAt: -1 });
MentorSchema.index({ isDeleted: 1, status: 1 });
MentorSchema.index({ mentorId: 1, userId: 1 });
MentorSchema.index({ mentorId: 1, status: 1 });
MentorSchema.index(
  { title: 'text', bio: 'text', 'experience.currentRole': 'text', skills: 'text', domains: 'text' }
);

// ── Virtuals ─────────────────────────────────────────────────────
MentorSchema.virtual('profileCompleteness').get(function () {
  let score = 0;
  const total = 11;
  if (this.title) score++;
  if (this.bio && this.bio.length >= 100) score++;
  if (this.tagline) score++;
  if (this.domains && this.domains.length >= 2) score++;
  if (this.skills && this.skills.length >= 5) score++;
  if ((this.experience.previousRoles?.length ?? 0) > 0) score++;
  if (this.socialProof.linkedinUrl) score++;
  if (this.socialProof.githubUrl || this.socialProof.portfolioUrl) score++;
  if (this.verification.isVerified) score++;
  if (this.stats.totalReviews >= 5) score++;
  if (this.stats.averageRating >= 4) score++;
  return Math.round((score / total) * 100);
});

// ── Pre-save ─────────────────────────────────────────────────────
MentorSchema.pre('save', function (next) {
  if (this.isModified('stats') && this.stats.totalSessions > 0) {
    this.stats.completionRate = Math.round(
      (this.stats.completedSessions / this.stats.totalSessions) * 100
    );
  }
  if (this.featured.isFeatured && !this.featured.featuredUntil) {
    this.featured.featuredUntil = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  }
  next();
});

// ── Instance Methods ─────────────────────────────────────────────
MentorSchema.methods.updateStats = async function (updateData: Partial<IMentor['stats']>) {
  Object.assign(this.stats, updateData);
  return await this.save();
};

MentorSchema.methods.softDelete = async function () {
  this.isDeleted = true;
  this.deletedAt = new Date();
  this.status = MentorStatus.INACTIVE;
  return await this.save();
};

MentorSchema.methods.restore = async function () {
  this.isDeleted = false;
  this.deletedAt = undefined;
  return await this.save();
};

MentorSchema.methods.incrementSessionCount = async function () {
  this.stats.totalSessions += 1;
  return await this.save();
};

MentorSchema.methods.recordSessionCompletion = async function (
  earnings: number,
  rating?: number
) {
  this.stats.completedSessions += 1;
  this.stats.totalEarnings += earnings;
  if (rating) {
    const totalPoints = this.stats.averageRating * this.stats.totalReviews;
    this.stats.totalReviews += 1;
    this.stats.averageRating = (totalPoints + rating) / this.stats.totalReviews;
  }
  return await this.save();
};

MentorSchema.methods.recordSessionCancellation = async function () {
  this.stats.cancelledSessions += 1;
  return await this.save();
};

MentorSchema.methods.updatePricing = async function (
  sessionType: keyof IMentor['pricing'],
  price: number
) {
  if (price < 0) throw new Error('Price cannot be negative');
  this.pricing[sessionType] = price;
  return await this.save();
};

MentorSchema.methods.toggleFeatured = async function (featured: boolean, order?: number) {
  this.featured.isFeatured = featured;
  if (featured) {
    this.featured.featuredUntil = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    this.featured.featuredOrder = order ?? 0;
  } else {
    this.featured.featuredUntil = undefined;
    this.featured.featuredOrder = 0;
  }
  return await this.save();
};

// ── Static Methods ───────────────────────────────────────────────
MentorSchema.statics.findActive = function () {
  return this.find({ status: MentorStatus.ACTIVE, isDeleted: false });
};

MentorSchema.statics.findByUserId = function (userId: string) {
  return this.findOne({ userId, isDeleted: false });
};

MentorSchema.statics.findFeatured = function (limit = 10) {
  return this.find({
    'featured.isFeatured': true,
    'featured.featuredUntil': { $gt: new Date() },
    status: MentorStatus.ACTIVE,
    isDeleted: false,
  })
    .sort({ 'featured.featuredOrder': 1 })
    .limit(limit);
};

MentorSchema.statics.findTopRated = function (limit = 10) {
  return this.find({
    status: MentorStatus.ACTIVE,
    isDeleted: false,
    'stats.totalReviews': { $gte: 5 },
  })
    .sort({ 'stats.averageRating': -1, 'stats.totalReviews': -1 })
    .limit(limit);
};

MentorSchema.statics.searchMentors = function (keyword: string, filters: any = {}) {
  const query: any = { status: MentorStatus.ACTIVE, isDeleted: false, ...filters };
  if (keyword) query.$text = { $search: keyword };
  return this.find(query).sort(keyword ? { score: { $meta: 'textScore' } } : {});
};

export default mongoose.model<MentorDocument>('Mentor', MentorSchema);