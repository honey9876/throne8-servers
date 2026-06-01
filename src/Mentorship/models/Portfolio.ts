import mongoose, { Schema, Document } from 'mongoose';

export interface IPortfolioProject {
  title: string;
  description: string;
  url?: string;
  technologies: string[];
  role: string;
  duration?: string;
  highlights?: string[];
  images?: string[];
}

export interface IPortfolioAnalysis {
  overallScore: number;
  strengths: string[];
  improvements: string[];
  suggestions: string[];
  technicalDepth: number;
  presentationQuality: number;
  projectDiversity: number;
  completeness: number;
  analyzedAt: Date;
}

export interface IPortfolio {
  _id: string;
  userId: string;
  portfolioUrl: string;
  portfolioType: 'design' | 'development' | 'product' | 'data_science' | 'other';
  projects: IPortfolioProject[];
  skills: string[];
  status: 'pending_review' | 'under_review' | 'reviewed' | 'archived';
  sessionId?: string;
  analysis?: IPortfolioAnalysis;
  mentorFeedback?: {
    mentorId: string;
    overallComments: string;
    projectFeedbacks: Array<{
      projectTitle: string;
      strengths: string[];
      improvements: string[];
      rating: number;
    }>;
    actionItems: string[];
    resources: string[];
    submittedAt: Date;
  };
  revisions?: Array<{
    version: number;
    portfolioUrl: string;
    submittedAt: Date;
    changes: string;
  }>;
  createdAt: Date;
  updatedAt: Date;
}

export interface PortfolioDocument extends Omit<IPortfolio, '_id'>, Document {}

const PortfolioProjectSchema = new Schema<IPortfolioProject>(
  {
    title: { type: String, required: true, trim: true },
    description: { type: String, required: true, trim: true },
    url: { type: String, trim: true },
    technologies: [{ type: String, trim: true }],
    role: { type: String, required: true, trim: true },
    duration: { type: String, trim: true },
    highlights: [{ type: String, trim: true }],
    images: [{ type: String }],
  },
  { _id: false }
);

const PortfolioAnalysisSchema = new Schema<IPortfolioAnalysis>(
  {
    overallScore: { type: Number, required: true, min: 0, max: 100 },
    strengths: [{ type: String, trim: true }],
    improvements: [{ type: String, trim: true }],
    suggestions: [{ type: String, trim: true }],
    technicalDepth: { type: Number, min: 0, max: 10 },
    presentationQuality: { type: Number, min: 0, max: 10 },
    projectDiversity: { type: Number, min: 0, max: 10 },
    completeness: { type: Number, min: 0, max: 10 },
    analyzedAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const PortfolioSchema = new Schema<PortfolioDocument>(
  {
    userId: {
      type: String,
      required: [true, 'User ID is required'],
      index: true,
    },
    portfolioUrl: {
      type: String,
      required: [true, 'Portfolio URL is required'],
      trim: true,
    },
    portfolioType: {
      type: String,
      enum: ['design', 'development', 'product', 'data_science', 'other'],
      required: [true, 'Portfolio type is required'],
    },
    projects: [PortfolioProjectSchema],
    skills: [{ type: String, trim: true }],
    status: {
      type: String,
      enum: ['pending_review', 'under_review', 'reviewed', 'archived'],
      default: 'pending_review',
      index: true,
    },
    sessionId: {
      type: String,
      index: true,
    },
    analysis: PortfolioAnalysisSchema,
    mentorFeedback: {
      mentorId: { type: String },
      overallComments: { type: String, trim: true },
      projectFeedbacks: [
        {
          projectTitle: { type: String, required: true },
          strengths: [{ type: String, trim: true }],
          improvements: [{ type: String, trim: true }],
          rating: { type: Number, min: 1, max: 5 },
        },
      ],
      actionItems: [{ type: String, trim: true }],
      resources: [{ type: String, trim: true }],
      submittedAt: { type: Date, default: Date.now },
    },
    revisions: [
      {
        version: { type: Number, required: true },
        portfolioUrl: { type: String, required: true },
        submittedAt: { type: Date, default: Date.now },
        changes: { type: String, trim: true },
      },
    ],
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Indexes
PortfolioSchema.index({ userId: 1, status: 1 });
PortfolioSchema.index({ sessionId: 1 });
PortfolioSchema.index({ portfolioType: 1, status: 1 });

// Virtuals
PortfolioSchema.virtual('hasBeenReviewed').get(function () {
  return this.status === 'reviewed' && !!this.mentorFeedback;
});

PortfolioSchema.virtual('needsImprovement').get(function () {
  return this.analysis && this.analysis.overallScore < 60;
});

PortfolioSchema.virtual('revisionCount').get(function () {
  return this.revisions ? this.revisions.length : 0;
});

// Instance Methods
PortfolioSchema.methods.analyzePortfolio = async function (
  this: PortfolioDocument,
  analysisData: IPortfolioAnalysis
) {
  this.analysis = analysisData;
  this.status = 'under_review';
  return await this.save();
};

PortfolioSchema.methods.addMentorFeedback = async function (
  this: PortfolioDocument,
  mentorId: string,
  overallComments: string,
  projectFeedbacks: any[],
  actionItems: string[],
  resources: string[]
) {
  this.mentorFeedback = {
    mentorId,
    overallComments,
    projectFeedbacks,
    actionItems,
    resources,
    submittedAt: new Date(),
  };
  this.status = 'reviewed';
  return await this.save();
};

PortfolioSchema.methods.submitRevision = async function (
  this: PortfolioDocument,
  newPortfolioUrl: string,
  changes: string
) {
  if (!this.revisions) {
    this.revisions = [];
  }

  const version = this.revisions.length + 1;

  this.revisions.push({
    version,
    portfolioUrl: newPortfolioUrl,
    submittedAt: new Date(),
    changes,
  });

  this.portfolioUrl = newPortfolioUrl;
  this.status = 'pending_review';

  return await this.save();
};

PortfolioSchema.methods.addProject = async function (
  this: PortfolioDocument,
  project: IPortfolioProject
) {
  if (!this.projects) {
    this.projects = [];
  }
  this.projects.push(project);
  return await this.save();
};

PortfolioSchema.methods.updateProject = async function (
  this: PortfolioDocument,
  projectTitle: string,
  updates: Partial<IPortfolioProject>
) {
  const project = this.projects.find((p: IPortfolioProject) => p.title === projectTitle);
  if (!project) {
    throw new Error('Project not found');
  }
  Object.assign(project, updates);
  return await this.save();
};

PortfolioSchema.methods.removeProject = async function (
  this: PortfolioDocument,
  projectTitle: string
) {
  this.projects = this.projects.filter((p: IPortfolioProject) => p.title !== projectTitle);
  return await this.save();
};

PortfolioSchema.methods.markAsArchived = async function (this: PortfolioDocument) {
  this.status = 'archived';
  return await this.save();
};

// Static Methods
PortfolioSchema.statics.findPendingReviews = function () {
  return this.find({
    status: 'pending_review',
  }).sort({ createdAt: 1 });
};

PortfolioSchema.statics.findByUser = function (userId: string) {
  return this.find({ userId }).sort({ createdAt: -1 });
};

PortfolioSchema.statics.findByType = function (portfolioType: string) {
  return this.find({
    portfolioType,
    status: { $ne: 'archived' },
  }).sort({ createdAt: -1 });
};

PortfolioSchema.statics.getPortfolioStats = async function (userId: string) {
  const portfolios = await this.find({ userId });

  const stats = {
    total: portfolios.length,
    reviewed: portfolios.filter((p: any) => p.status === 'reviewed').length,
    pending: portfolios.filter((p: any) => p.status === 'pending_review').length,
    underReview: portfolios.filter((p: any) => p.status === 'under_review').length,
    averageScore: 0,
    totalProjects: 0,
    totalRevisions: 0,
  };

  const reviewedPortfolios = portfolios.filter((p: any) => p.analysis);
  if (reviewedPortfolios.length > 0) {
    const totalScore = reviewedPortfolios.reduce(
      (sum: number, p: any) => sum + p.analysis.overallScore,
      0
    );
    stats.averageScore = totalScore / reviewedPortfolios.length;
  }

  stats.totalProjects = portfolios.reduce(
    (sum: number, p: any) => sum + (p.projects?.length || 0),
    0
  );

  stats.totalRevisions = portfolios.reduce(
    (sum: number, p: any) => sum + (p.revisions?.length || 0),
    0
  );

  return stats;
};

export default mongoose.model<PortfolioDocument>('Portfolio', PortfolioSchema);