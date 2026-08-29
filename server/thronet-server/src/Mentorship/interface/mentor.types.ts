//mentor interface
import { TimeStamps, SoftDelete } from './common.types';
import { Domain } from '../../shared/constants/domains';
import { ITrustScore } from './trustScore.types';

export enum MentorStatus {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
  ON_BREAK = 'on_break',
  PENDING_APPROVAL = 'pending_approval',
  SUSPENDED = 'suspended',
}

export enum ExperienceLevel {
  JUNIOR = 'junior',
  MID = 'mid',
  SENIOR = 'senior',
  LEAD = 'lead',
  PRINCIPAL = 'principal',
  ARCHITECT = 'architect',
}

export interface IMentor extends TimeStamps, SoftDelete {
  _id: string;           // ✅ Keep for internal use
  mentorId: string;
  userId: string; // Reference to User Service
  companyId?: string; // Reference to Company Service
  status: MentorStatus;
  // ⭐ ADD THESE TWO LINES
  profilePic?: string; // Cloudinary URL
  bannerImage?: string; // Cloudinary URL
  cloudinaryPublicId?: string; // For deletion/updates

  title: string;
  bio: string;
  tagline?: string;
  domains: Domain[];
  skills: string[];
  languages?: string[];
  // CHANGE: experience mein level auto-set hoga, user nahi dega
  experience: {
    total: number;
    level?: ExperienceLevel;  // optional — backend set karega
    currentRole: string;
    previousRoles?: {
      title: string;
      company: string;
      duration: string;
    }[];
  };
  // CHANGE: pricing optional karo (whole block)
  pricing?: {
    quickCall?: number;
    deepDive?: number;
    resumeReview?: number;
    mockInterview?: number;
    careerPlanning?: number;
    portfolioReview?: number;
    askQuery?: number;
    groupSession?: number;
  };
  stats: {
    totalSessions: number;
    completedSessions: number;
    cancelledSessions: number;
    totalEarnings: number;
    averageRating: number;
    totalReviews: number;
    responseTime: number; // in minutes
    completionRate: number; // percentage
  };
  // CHANGE: availability optional karo
  availability?: {
    timezone?: string;
    daysAvailable?: string[];
    preferredHours?: {
      start: string;
      end: string;
    };
    autoAcceptBookings?: boolean;
    maxSessionsPerDay?: number;
    bufferBetweenSessions?: number;
  };
  socialProof: {
    linkedinUrl: string;
    githubUrl: string;
    portfolioUrl?: string;
    twitterUrl?: string;
    websiteUrl?: string;
    certifications?: string[];
    achievements?: string[];
  };
  preferences: {
    acceptGroupSessions: boolean;
    maxGroupSize: number;
    acceptQueries: boolean;
    maxQueriesPerWeek: number;
    notificationPreferences: {
      email: boolean;
      sms: boolean;
      push: boolean;
    };
  };
  verification: {
    isVerified: boolean;
    verifiedAt?: Date;
    verifiedBy?: string;
    verificationDocuments?: string[];
  };
  featured: {
    isFeatured: boolean;
    featuredUntil?: Date;
    featuredOrder?: number;
  };
  trustScore?: ITrustScore;
  // profilePicUrl?: string; // 👈 ADD THIS - cloudinary URL
}

export interface MentorFilters {
  domains?: Domain[];
  companyIds?: string[];
  minPrice?: number;
  maxPrice?: number;
  minRating?: number;
  minExperience?: number;
  experienceLevel?: ExperienceLevel[];
  languages?: string[];
  availability?: {
    date?: Date;
    timezone?: string;
  };
  skills?: string[];
  status?: MentorStatus;
  featured?: boolean;
}

export interface MentorSortOptions {
  field: 'rating' | 'experience' | 'price' | 'sessions' | 'createdAt';
  order: 'asc' | 'desc';
}

export interface MentorSearchQuery {
  keyword?: string;
  filters?: MentorFilters;
  sort?: MentorSortOptions;
  page?: number;
  limit?: number;
}

export interface MentorWithRelations extends IMentor {
  user?: any; // Will be populated from User Service
  company?: any; // Will be populated from Company Service
  upcomingSessions?: number;
  nextAvailableSlot?: Date;
}

export interface CreateMentorInput {
  userId: string;
  companyId?: string;
  title: string;
  bio: string;
  tagline?: string;           // already optional ✅
  domains: Domain[];
  skills: string[];
  languages?: string[];       // CHANGE: optional karo
  experience: {
    total: number;
    currentRole: string;
    previousRoles?: {
      title: string;
      company: string;
      duration: string;
    }[];
    // level yahan nahi aayega — backend set karega
  };
  pricing?: Partial<IMentor['pricing']>;        // CHANGE: optional karo
  availability?: Partial<IMentor['availability']>; // CHANGE: optional karo
  socialProof?: IMentor['socialProof'];         // already optional ✅
  preferences?: Partial<IMentor['preferences']>; // already optional ✅
  profilePicFile: Express.Multer.File;          // REQUIRED
}

export interface UpdateMentorInput {
  title?: string;
  bio?: string;
  tagline?: string;
  domains?: Domain[];
  skills?: string[];
  languages?: string[];
  experience?: Partial<IMentor['experience']>;
  pricing?: Partial<IMentor['pricing']>;
  availability?: Partial<IMentor['availability']>;
  socialProof?: Partial<IMentor['socialProof']>;
  preferences?: Partial<IMentor['preferences']>;
  status?: MentorStatus;
}