import mongoose, { Schema, Document, Model } from 'mongoose';
import { v4 as uuidv4, validate as uuidValidate } from 'uuid';
import logger from '@/shared/logger.util';
import { cacheHits } from '@/shared/metrics';
import CacheUtil from '@/shared/cache.util';

const validUUIDRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// TTL configurations
const TTL_CONFIG = {
  PROFESSIONAL_DEV: 2 * 365 * 24 * 60 * 60, // 2 years in seconds
  DATA_EXPORT: 30 * 24 * 60 * 60, // 30 days for export files
};

// Enums
export enum ExportType {
  FULL = 'full',
  PROFILE = 'profile',
  APPLICATIONS = 'applications',
  SEARCH_HISTORY = 'search_history',
  PREFERENCES = 'preferences',
  ANALYTICS = 'analytics'
}

export enum ExportFormat {
  JSON = 'json',
  CSV = 'csv',
  XML = 'xml',
  PDF = 'pdf'
}

export enum ExportStatus {
  REQUESTED = 'requested',
  PROCESSING = 'processing',
  COMPLETED = 'completed',
  FAILED = 'failed',
  EXPIRED = 'expired'
}

export enum DeliveryMethod {
  DOWNLOAD = 'download',
  EMAIL = 'email',
  SECURE_LINK = 'secure_link'
}

export enum ErasureRequestStatus {
  PENDING = 'pending',
  APPROVED = 'approved',
  COMPLETED = 'completed',
  REJECTED = 'rejected'
}

// Interfaces
interface ICurrentSkill {
  skillId: string;
  proficiencyLevel: number;
}

interface ISkillGap {
  skillId: string;
  skillName: string;
  requiredLevel: number;
  currentLevel: number;
  priority: string;
  estimatedLearningTime: number;
}

interface ISkillRecommendation {
  skillId: string;
  skillName: string;
  recommendation: string;
  resources: string[];
  estimatedTime: number;
}

interface ISkillsAnalysis {
  currentSkills: ICurrentSkill[];
  targetRole?: string;
  targetIndustry?: string;
  skillGaps: ISkillGap[];
  recommendations: ISkillRecommendation[];
  analysisScore?: number;
  lastAnalyzedAt?: Date;
  estimatedLearningTime?: number;
}

interface ICertification {
  certificationId: string;
  name: string;
  issuer: string;
  issueDate: Date;
  credentialUrl?: string;
  addedAt: Date;
}

interface ICourse {
  courseId: string;
  title: string;
  provider: string;
  status: string;
  progress: number;
  completedAt?: Date;
  skillsLearned: string[];
  timeSpent: number;
}

interface ILinkedInLearning {
  connected: boolean;
  accessToken?: string;
  lastSyncAt?: Date;
  courses: ICourse[];
  learningPaths: string[];
  syncPreferences?: any;
}

interface ISuggestedPath {
  targetRole: string;
  targetLevel: string;
  estimatedTime: string;
  requiredSkills: string[];
  salaryRange: {
    min: number;
    max: number;
    currency: string;
  };
  pathScore: number;
}

interface ICareerPath {
  currentRole?: string;
  experienceLevel?: string;
  suggestedPaths: ISuggestedPath[];
  lastUpdatedAt?: Date;
}

interface IQuestion {
  questionId: string;
  question: string;
  options: string[];
  correctAnswer: string;
  explanation: string;
  timeSpent: number;
}

interface IAnswer {
  questionId: string;
  answer: string;
  timeSpent: number;
}

interface IAssessmentResults {
  score: number;
  percentile: number;
  correctAnswers: number;
  totalQuestions: number;
  strengths: string[];
  weaknesses: string[];
  recommendations: string[];
}

interface IAssessment {
  assessmentId: string;
  skillId: string;
  difficulty: string;
  assessmentType: string;
  timeLimit: number;
  questions: IQuestion[];
  answers: IAnswer[];
  results?: IAssessmentResults;
  status: string;
  startedAt: Date;
  completedAt?: Date;
  timeTaken?: number;
  expiresAt: Date;
}

interface IInterviewQuestion {
  questionId: string;
  question: string;
  category: string;
  difficulty: string;
  answer: string;
  timeSpent: number;
  feedback?: any;
}

interface IOverallFeedback {
  communicationScore: number;
  technicalScore: number;
  confidenceScore: number;
  overallRating: number;
  strengths: string[];
  areasForImprovement: string[];
  nextSteps: string[];
}

interface IMockInterview {
  sessionId: string;
  jobRole: string;
  interviewType: string;
  experienceLevel: string;
  scheduledAt: Date;
  duration: number;
  questions: IInterviewQuestion[];
  status: string;
  completedAt?: Date;
  overallFeedback?: IOverallFeedback;
}

interface IPracticeStats {
  totalAssessments?: number;
  completedAssessments?: number;
  averageScore?: number;
  totalInterviews?: number;
  averageInterviewRating?: number;
  streak?: {
    lastPracticeDate?: Date;
    currentStreak: number;
  };
}

interface IResumeSection {
  section: string;
  rating: number;
  comments: string;
  suggestions: string[];
}

interface IATSCompatibility {
  score: number;
  issues: string[];
  recommendations: string[];
}

interface IImprovement {
  category: string;
  priority: string;
  suggestion: string;
  example: string;
}

interface IResumeFeedback {
  overallRating: number;
  sections: IResumeSection[];
  atsCompatibility: IATSCompatibility;
  improvements: IImprovement[];
  finalNotes?: string;
}

interface IResumeReview {
  reviewId: string;
  resumeUrl: string;
  targetRole: string;
  urgency: string;
  status: string;
  submittedAt: Date;
  reviewerId?: string;
  feedback?: IResumeFeedback;
  completedAt?: Date;
}

interface IActionItem {
  itemId: string;
  description: string;
  dueDate: Date;
  status: string;
}

interface ISessionFeedback {
  rating: number;
  comments: string;
  areasCovered: string[];
  outcomes: string[];
}

interface ICoachingSession {
  sessionId: string;
  coachId: string;
  sessionMode: string;
  scheduledAt: Date;
  duration: number;
  goals: string[];
  status: string;
  actionItems: IActionItem[];
  feedback?: ISessionFeedback;
}

interface IMilestone {
  milestone: string;
  targetDate: Date;
  status: string;
  achievedAt?: Date;
  notes?: string;
}

interface ICoachingPlan {
  planId: string;
  goals: string[];
  timeline: string;
  milestones: IMilestone[];
  progress: number;
  createdAt: Date;
  lastUpdatedAt: Date;
}

interface IAssignedCoach {
  coachId: string;
  name: string;
  specializations: string[];
  industries: string[];
  experience: string;
  rating: number;
}

interface IFileDetails {
  fileName?: string;
  fileSize?: number;
  downloadUrl?: string;
  expiresAt: Date;
  downloadCount: number;
  maxDownloads: number;
}

interface IProcessingDetails {
  startedAt?: Date;
  completedAt?: Date;
  processingTime?: number;
  recordsExported?: number;
  errorMessage?: string;
}

interface IDataExport {
  exportId: string;
  exportType: ExportType;
  format: ExportFormat;
  status: ExportStatus;
  dateRange?: {
    startDate: Date;
    endDate: Date;
  };
  includeDeleted: boolean;
  anonymize: boolean;
  compressionEnabled: boolean;
  deliveryMethod: DeliveryMethod;
  fileDetails?: IFileDetails;
  processingDetails?: IProcessingDetails;
  requestedAt: Date;
  gdprCompliant: boolean;
}

interface IDataCategory {
  retain: boolean;
  retentionDays: number;
}

interface IRetentionSettings {
  autoDeleteInactiveData: boolean;
  inactivityThreshold: number;
  dataCategories?: {
    searchHistory?: IDataCategory;
    applicationHistory?: IDataCategory;
    viewHistory?: IDataCategory;
    analyticsData?: IDataCategory;
  };
}

interface IErasureRequest {
  requestId: string;
  requestedAt: Date;
  status: ErasureRequestStatus;
  completedAt?: Date;
  dataCategories: string[];
}

interface IPortabilityRequest {
  requestId: string;
  requestedAt: Date;
  status: string;
  exportId?: string;
  completedAt?: Date;
}

interface IGDPRCompliance {
  consentGiven: boolean;
  consentDate?: Date;
  consentVersion?: string;
  dataProcessingPurposes: string[];
  rightToErasureRequests: IErasureRequest[];
  dataPortabilityRequests: IPortabilityRequest[];
  lastDataAudit?: Date;
}

interface IDataManagement {
  dataExports: IDataExport[];
  retentionSettings?: IRetentionSettings;
  gdprCompliance?: IGDPRCompliance;
}

export interface IProfessionalDev extends Document {
  userId: string;
  skillsAnalysis?: ISkillsAnalysis;
  certifications: ICertification[];
  linkedinLearning?: ILinkedInLearning;
  careerPath?: ICareerPath;
  assessments: IAssessment[];
  mockInterviews: IMockInterview[];
  practiceStats?: IPracticeStats;
  resumeReviews: IResumeReview[];
  coachingSessions: ICoachingSession[];
  coachingPlan?: ICoachingPlan;
  assignedCoach?: IAssignedCoach;
  dataManagement?: IDataManagement;
  isDeleted: boolean;
  createdAt: Date;
  updatedAt: Date;
}

// Static methods interface
interface IProfessionalDevModel extends Model<IProfessionalDev> {
  findUserDevelopment(userId: string, pagination?: { page?: number; limit?: number }): Promise<IProfessionalDev | null>;
  updatePracticeStats(userId: string, stats: IPracticeStats): Promise<any>;
  getRecentAssessments(userId: string, limit?: number): Promise<IProfessionalDev | null>;
  getDataExports(userId: string, status?: string, limit?: number): Promise<IProfessionalDev | null>;
  getGDPRRequests(userId: string, type?: 'erasure' | 'portability', limit?: number): Promise<IProfessionalDev | null>;
}

// Schema definition
const professionalDevSchema = new Schema<IProfessionalDev>(
  {
    userId: {
      type: String,
      required: true,
      unique: true,
      validate: {
        validator: (v: string) => validUUIDRegex.test(v),
        message: 'Invalid userId UUID',
      },
    },
    skillsAnalysis: {
      currentSkills: [{ skillId: { type: String, validate: validUUIDRegex }, proficiencyLevel: Number }],
      targetRole: String,
      targetIndustry: String,
      skillGaps: [{
        skillId: { type: String, validate: validUUIDRegex },
        skillName: String,
        requiredLevel: Number,
        currentLevel: Number,
        priority: String,
        estimatedLearningTime: Number,
      }],
      recommendations: [{
        skillId: { type: String, validate: validUUIDRegex },
        skillName: String,
        recommendation: String,
        resources: [String],
        estimatedTime: Number,
      }],
      analysisScore: Number,
      lastAnalyzedAt: Date,
      estimatedLearningTime: Number,
    },
    certifications: [{
      certificationId: { type: String, default: uuidv4, validate: validUUIDRegex },
      name: String,
      issuer: String,
      issueDate: Date,
      credentialUrl: String,
      addedAt: { type: Date, default: Date.now },
    }],
    linkedinLearning: {
      connected: Boolean,
      accessToken: String,
      lastSyncAt: Date,
      courses: [{
        courseId: { type: String, validate: validUUIDRegex },
        title: String,
        provider: String,
        status: String,
        progress: Number,
        completedAt: Date,
        skillsLearned: [String],
        timeSpent: Number,
      }],
      learningPaths: [String],
      syncPreferences: Object,
    },
    careerPath: {
      currentRole: String,
      experienceLevel: String,
      suggestedPaths: [{
        targetRole: String,
        targetLevel: String,
        estimatedTime: String,
        requiredSkills: [String],
        salaryRange: { min: Number, max: Number, currency: String },
        pathScore: Number,
      }],
      lastUpdatedAt: Date,
    },
    assessments: [{
      assessmentId: { type: String, default: uuidv4, validate: validUUIDRegex },
      skillId: { type: String, validate: validUUIDRegex },
      difficulty: String,
      assessmentType: String,
      timeLimit: Number,
      questions: [{
        questionId: { type: String, validate: validUUIDRegex },
        question: String,
        options: [String],
        correctAnswer: String,
        explanation: String,
        timeSpent: Number,
      }],
      answers: [{ questionId: { type: String, validate: validUUIDRegex }, answer: String, timeSpent: Number }],
      results: {
        score: Number,
        percentile: Number,
        correctAnswers: Number,
        totalQuestions: Number,
        strengths: [String],
        weaknesses: [String],
        recommendations: [String],
      },
      status: String,
      startedAt: Date,
      completedAt: Date,
      timeTaken: Number,
      expiresAt: { type: Date, default: () => new Date(Date.now() + TTL_CONFIG.PROFESSIONAL_DEV * 1000) },
    }],
    mockInterviews: [{
      sessionId: { type: String, default: uuidv4, validate: validUUIDRegex },
      jobRole: String,
      interviewType: String,
      experienceLevel: String,
      scheduledAt: Date,
      duration: Number,
      questions: [{
        questionId: { type: String, validate: validUUIDRegex },
        question: String,
        category: String,
        difficulty: String,
        answer: String,
        timeSpent: Number,
        feedback: Object,
      }],
      status: String,
      completedAt: Date,
      overallFeedback: {
        communicationScore: Number,
        technicalScore: Number,
        confidenceScore: Number,
        overallRating: Number,
        strengths: [String],
        areasForImprovement: [String],
        nextSteps: [String],
      },
    }],
    practiceStats: {
      totalAssessments: Number,
      completedAssessments: Number,
      averageScore: Number,
      totalInterviews: Number,
      averageInterviewRating: Number,
      streak: { lastPracticeDate: Date, currentStreak: Number },
    },
    resumeReviews: [{
      reviewId: { type: String, default: uuidv4, validate: validUUIDRegex },
      resumeUrl: String,
      targetRole: String,
      urgency: String,
      status: String,
      submittedAt: Date,
      reviewerId: { type: String, validate: validUUIDRegex },
      feedback: {
        overallRating: Number,
        sections: [{ section: String, rating: Number, comments: String, suggestions: [String] }],
        atsCompatibility: { score: Number, issues: [String], recommendations: [String] },
        improvements: [{ category: String, priority: String, suggestion: String, example: String }],
        finalNotes: String,
      },
      completedAt: Date,
    }],
    coachingSessions: [{
      sessionId: { type: String, default: uuidv4, validate: validUUIDRegex },
      coachId: { type: String, validate: validUUIDRegex },
      sessionMode: String,
      scheduledAt: Date,
      duration: Number,
      goals: [String],
      status: String,
      actionItems: [{ itemId: { type: String, validate: validUUIDRegex }, description: String, dueDate: Date, status: String }],
      feedback: {
        rating: Number,
        comments: String,
        areasCovered: [String],
        outcomes: [String],
      },
    }],
    coachingPlan: {
      planId: { type: String, default: uuidv4, validate: validUUIDRegex },
      goals: [String],
      timeline: String,
      milestones: [{ milestone: String, targetDate: Date, status: String, achievedAt: Date, notes: String }],
      progress: Number,
      createdAt: Date,
      lastUpdatedAt: Date,
    },
    assignedCoach: {
      coachId: { type: String, validate: validUUIDRegex },
      name: String,
      specializations: [String],
      industries: [String],
      experience: String,
      rating: Number,
    },
    dataManagement: {
      dataExports: [{
        exportId: { type: String, default: uuidv4, validate: validUUIDRegex },
        exportType: { type: String, enum: Object.values(ExportType), default: ExportType.FULL },
        format: { type: String, enum: Object.values(ExportFormat), default: ExportFormat.JSON },
        status: { type: String, enum: Object.values(ExportStatus), default: ExportStatus.REQUESTED },
        dateRange: { startDate: Date, endDate: Date },
        includeDeleted: { type: Boolean, default: false },
        anonymize: { type: Boolean, default: false },
        compressionEnabled: { type: Boolean, default: true },
        deliveryMethod: { type: String, enum: Object.values(DeliveryMethod), default: DeliveryMethod.DOWNLOAD },
        fileDetails: {
          fileName: String,
          fileSize: Number,
          downloadUrl: String,
          expiresAt: { type: Date, default: () => new Date(Date.now() + TTL_CONFIG.DATA_EXPORT * 1000) },
          downloadCount: { type: Number, default: 0 },
          maxDownloads: { type: Number, default: 5 },
        },
        processingDetails: {
          startedAt: Date,
          completedAt: Date,
          processingTime: Number,
          recordsExported: Number,
          errorMessage: String,
        },
        requestedAt: { type: Date, default: Date.now },
        gdprCompliant: { type: Boolean, default: true },
      }],
      retentionSettings: {
        autoDeleteInactiveData: { type: Boolean, default: false },
        inactivityThreshold: { type: Number, default: 365 },
        dataCategories: {
          searchHistory: { retain: Boolean, retentionDays: Number },
          applicationHistory: { retain: Boolean, retentionDays: Number },
          viewHistory: { retain: Boolean, retentionDays: Number },
          analyticsData: { retain: Boolean, retentionDays: Number },
        },
      },
      gdprCompliance: {
        consentGiven: { type: Boolean, default: false },
        consentDate: Date,
        consentVersion: String,
        dataProcessingPurposes: [String],
        rightToErasureRequests: [{
          requestId: { type: String, default: uuidv4, validate: validUUIDRegex },
          requestedAt: Date,
          status: { type: String, enum: Object.values(ErasureRequestStatus) },
          completedAt: Date,
          dataCategories: [String],
        }],
        dataPortabilityRequests: [{
          requestId: { type: String, default: uuidv4, validate: validUUIDRegex },
          requestedAt: Date,
          status: String,
          exportId: { type: String, validate: validUUIDRegex },
          completedAt: Date,
        }],
        lastDataAudit: Date,
      },
    },
    isDeleted: { type: Boolean, default: false },
  },
  {
    timestamps: { updatedAt: 'updatedAt' },
    versionKey: false,
    collection: 'professional_dev',
    shardKey: { userId: 1 },
  }
);

// Optimized Indexes for 10M+ Users
professionalDevSchema.index({ userId: 1, 'assessments.startedAt': -1 });
professionalDevSchema.index({ 'certifications.certificationId': 1 });
professionalDevSchema.index({ 'assessments.assessmentId': 1 });
professionalDevSchema.index({ 'mockInterviews.sessionId': 1 });
professionalDevSchema.index({ 'resumeReviews.reviewId': 1 });
professionalDevSchema.index({ 'coachingSessions.sessionId': 1 });
professionalDevSchema.index({ 'skillsAnalysis.lastAnalyzedAt': 1 });
professionalDevSchema.index({ 'dataManagement.dataExports.exportId': 1 });
professionalDevSchema.index({ 'dataManagement.dataExports.status': 1 });
professionalDevSchema.index({ 'dataManagement.dataExports.requestedAt': -1 });
professionalDevSchema.index({ 'dataManagement.rightToErasureRequests.requestId': 1 });
professionalDevSchema.index({ 'dataManagement.dataPortabilityRequests.requestId': 1 });
professionalDevSchema.index({ isDeleted: 1 });
professionalDevSchema.index({ 'assessments.expiresAt': 1 }, { expireAfterSeconds: 0 });
professionalDevSchema.index({ 'dataManagement.dataExports.fileDetails.expiresAt': 1 }, { expireAfterSeconds: 0 });

// Pre-save Middleware (Kafka/VectorDB removed)
professionalDevSchema.pre<IProfessionalDev>('save', async function (next) {
  try {
    this.updatedAt = new Date();
    // Removed SearchEventService.emit for analytics - no Kafka dependency
    next();
  } catch (error : any) {
    logger.error('ProfessionalDev pre-save error:', error);
    next(error as Error);
  }
});

// Static Methods
professionalDevSchema.statics.findUserDevelopment = async function (
  userId: string,
  pagination: { page?: number; limit?: number } = {}
): Promise<IProfessionalDev | null> {
  const { page = 1, limit = 20 } = pagination;
  return this.findOne({ userId, isDeleted: false })
    .select('skillsAnalysis certifications linkedinLearning careerPath assessments mockInterviews practiceStats resumeReviews coachingSessions coachingPlan assignedCoach dataManagement')
    .slice('assessments', [(page - 1) * limit, limit])
    .slice('mockInterviews', [(page - 1) * limit, limit])
    .slice('resumeReviews', [(page - 1) * limit, limit])
    .slice('coachingSessions', [(page - 1) * limit, limit])
    .slice('dataManagement.dataExports', [(page - 1) * limit, limit])
    .slice('dataManagement.gdprCompliance.rightToErasureRequests', [(page - 1) * limit, limit])
    .slice('dataManagement.gdprCompliance.dataPortabilityRequests', [(page - 1) * limit, limit])
    .lean();
};

professionalDevSchema.statics.updatePracticeStats = async function (userId: string, stats: IPracticeStats) {
  const update = {
    $set: {
      'practiceStats.totalAssessments': stats.totalAssessments || 0,
      'practiceStats.completedAssessments': stats.completedAssessments || 0,
      'practiceStats.averageScore': stats.averageScore || 0,
      'practiceStats.totalInterviews': stats.totalInterviews || 0,
      'practiceStats.averageInterviewRating': stats.averageInterviewRating || 0,
      'practiceStats.streak': stats.streak || { lastPracticeDate: null, currentStreak: 0 },
      updatedAt: new Date(),
    },
  };
  return this.updateOne({ userId }, update, { upsert: true });
};

professionalDevSchema.statics.getRecentAssessments = async function (
  userId: string,
  limit: number = 10
): Promise<IProfessionalDev | null> {
  return this.findOne({ userId, isDeleted: false })
    .select('assessments')
    .slice('assessments', limit)
    .sort({ 'assessments.startedAt': -1 })
    .lean();
};

professionalDevSchema.statics.getDataExports = async function (
  userId: string,
  status: string = 'completed',
  limit: number = 10
): Promise<IProfessionalDev | null> {
  return this.findOne({ userId, isDeleted: false })
    .select('dataManagement.dataExports')
    .slice('dataManagement.dataExports', limit)
    .where('dataManagement.dataExports.status').equals(status)
    .sort({ 'dataManagement.dataExports.requestedAt': -1 })
    .lean();
};

professionalDevSchema.statics.getGDPRRequests = async function (
  userId: string,
  type: 'erasure' | 'portability' = 'erasure',
  limit: number = 10
): Promise<IProfessionalDev | null> {
  const field = type === 'erasure' 
    ? 'dataManagement.gdprCompliance.rightToErasureRequests' 
    : 'dataManagement.gdprCompliance.dataPortabilityRequests';
  return this.findOne({ userId, isDeleted: false })
    .select(field)
    .slice(field, limit)
    .sort({ [`${field}.requestedAt`]: -1 })
    .lean();
};

// Cache Manager
export class CacheManager {
  static async getMultiLevel(key: string, userId: string | null = null): Promise<any> {
    const userKey = userId ? `${key}:${userId}` : key;
    try {
      let result = await CacheUtil.get(`hot:${userKey}`);
      if (result) {
        cacheHits.inc({ cache_type: 'hot' });
        return JSON.parse(result);
      }
      result = await CacheUtil.get(`warm:${userKey}`);
      if (result) {
        cacheHits.inc({ cache_type: 'warm' });
        await CacheUtil.set(`hot:${userKey}`, result, 30);
        return JSON.parse(result);
      }
      result = await CacheUtil.get(`cold:${key}`);
      if (result) {
        cacheHits.inc({ cache_type: 'cold' });
        return JSON.parse(result);
      }
    } catch (error : any) {
      logger.error('Cache get error:', error);
    }
    return null;
  }

  static async setMultiLevel(key: string, data: any, userId: string | null = null): Promise<void> {
    const userKey = userId ? `${key}:${userId}` : key;
    const dataStr = JSON.stringify(data);
    try {
      await Promise.all([
        CacheUtil.set(`hot:${userKey}`, dataStr, 30),
        CacheUtil.set(`warm:${userKey}`, dataStr, 300),
        CacheUtil.set(`cold:${key}`, dataStr, 1800),
      ]);
    } catch (error : any) {
      logger.error('Cache set error:', error);
    }
  }
}

const ProfessionalDevModel = mongoose.model<IProfessionalDev, IProfessionalDevModel>(
  'ProfessionalDev',
  professionalDevSchema
);

export default ProfessionalDevModel;