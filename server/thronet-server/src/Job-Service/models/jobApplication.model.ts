import mongoose, { Schema, Document, Model } from 'mongoose';
import { generateSecureId } from '@/shared/security';

const validUUIDRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// Enums
export enum ApplicationStatus {
  SUBMITTED = 'submitted',
  REVIEWED = 'reviewed',
  SHORTLISTED = 'shortlisted',
  INTERVIEWED = 'interviewed',
  REJECTED = 'rejected',
  HIRED = 'hired'
}

export enum ApplicationSource {
  DIRECT = 'direct',
  LINKEDIN = 'linkedin',
  REFERRAL = 'referral',
  JOB_BOARD = 'job-board'
}

export enum NoteType {
  NOTE = 'note',
  REMINDER = 'reminder',
  INTERVIEW = 'interview',
  THANK_YOU = 'thankYou'
}

export enum NoteStatus {
  PENDING = 'pending',
  COMPLETED = 'completed',
  CANCELLED = 'cancelled',
  RESCHEDULED = 'rescheduled'
}

export enum AttachmentType {
  VIDEO = 'video',
  PORTFOLIO = 'portfolio'
}

// Interfaces
interface IMetadata {
  ipAddress?: string;
  userAgent?: string;
}

interface INote {
  id: string;
  type: NoteType;
  content?: string;
  tags?: string[];
  isPrivate: boolean;
  reminderDate?: Date;
  status?: NoteStatus;
  interviewId?: string;
  createdAt: Date;
  updatedAt: Date;
}

interface IAttachment {
  id: string;
  type: AttachmentType;
  fileUrl: string;
  tags?: string[];
  categories?: string[];
  createdAt: Date;
}

interface IOfferDetails {
  id: string;
  skills: string[];
  salary?: number;
  equity?: number;
  benefits?: string[];
  companyName?: string;
  competitiveScore?: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface IJobApplication extends Document {
  applicationId: string;
  jobId: string;
  userId: string;
  companyId: string;
  experienceYears:number;
   location: string;
  status: ApplicationStatus;
  appliedAt: Date;
  resumeVersion?: string;
  coverLetter?: string;
  source: ApplicationSource;
  metadata?: IMetadata;
  notes: INote[];
  attachments: IAttachment[];
  offerDetails?: IOfferDetails;
  createdAt: Date;
  updatedAt: Date;
}

// Schema definition
const jobApplicationSchema = new Schema<IJobApplication>({
  applicationId: {
    type: String,
    required: true,
    unique: true,
    default: generateSecureId
  },
  jobId: {
    type: String,
    required: true,
    validate: {
      validator: (v: string) => validUUIDRegex.test(v),
      message: 'Invalid job ID format'
    }
  },
  userId: {
    type: String,
    required: true,
    validate: {
      validator: (v: string) => validUUIDRegex.test(v),
      message: 'Invalid user ID format'
    }
  },
  companyId: {
    type: String,
    required: true,
    validate: {
      validator: (v: string) => validUUIDRegex.test(v),
      message: 'Invalid company ID format'
    }
  },
  status: {
    type: String,
    enum: Object.values(ApplicationStatus),
    default: ApplicationStatus.SUBMITTED,
  },
  appliedAt: {
    type: Date,
    default: Date.now,
  },
  resumeVersion: {
    type: String,
    maxlength: 36,
    validate: {
      validator: (v: string) => !v || validUUIDRegex.test(v),
      message: 'resumeVersion must be a valid resume ID'
    }
  },
  coverLetter: {
    type: String,
    maxlength: 2000,
    validate: {
      validator: (v: string) => !v || !/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi.test(v),
      message: 'Cover letter contains unsafe content'
    }
  },
  source: {
    type: String,
    enum: Object.values(ApplicationSource),
    default: ApplicationSource.DIRECT
  },
  experienceYears: { type: Number, required: true },
   location: { type: String, required: true },
  metadata: {
    ipAddress: {
      type: String,
      validate: {
        validator: (v: string) => !v || /^(?:[0-9]{1,3}\.){3}[0-9]{1,3}$|^(?:[0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}$/.test(v),
        message: 'Invalid IP address format'
      }
    },
    userAgent: { type: String, maxlength: 500 }
  },
  notes: [{
    id: { 
      type: String, 
      default: generateSecureId, 
      validate: validUUIDRegex 
    },
    type: { 
      type: String, 
      enum: Object.values(NoteType), 
      required: true 
    },
    content: { type: String, maxlength: 2000 },
    tags: [{ type: String, maxlength: 50 }],
    isPrivate: { type: Boolean, default: false },
    reminderDate: { type: Date },
    status: { 
      type: String, 
      enum: Object.values(NoteStatus)
    },
    interviewId: { 
      type: String, 
      validate: { 
        validator: (v: string) => !v || validUUIDRegex.test(v), 
        message: 'Invalid interviewId UUID' 
      } 
    },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
  }],
  attachments: [{
    id: { 
      type: String, 
      default: generateSecureId, 
      validate: validUUIDRegex 
    },
    type: { 
      type: String, 
      enum: Object.values(AttachmentType), 
      required: true 
    },
    fileUrl: { type: String, required: true },
    tags: [{ type: String, maxlength: 50 }],
    categories: [{ type: String, maxlength: 50 }],
    createdAt: { type: Date, default: Date.now }
  }],
  offerDetails: {
    id: { 
      type: String, 
      default: generateSecureId, 
      validate: validUUIDRegex 
    },
    skills: {
    type: [String],
    default: [],
  },
    salary: { type: Number, min: 0 },
    equity: { type: Number, min: 0 },
    benefits: [{ type: String, maxlength: 100 }],
    companyName: { type: String, maxlength: 100 },
    competitiveScore: { type: Number, min: 0, max: 100 },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
}
}, {
  timestamps: true,
  collection: 'job_applications',
  shardKey: { userId: 1 }
});

// Indexes
jobApplicationSchema.index({ jobId: 1, appliedAt: -1 });
jobApplicationSchema.index({ userId: 1, appliedAt: -1 });
jobApplicationSchema.index({ companyId: 1, status: 1 });
jobApplicationSchema.index({ 'notes.id': 1 });
jobApplicationSchema.index({ 'attachments.id': 1 });
jobApplicationSchema.index({ 'offerDetails.id': 1 });

// Export model
const JobApplication: Model<IJobApplication> = mongoose.model<IJobApplication>(
  'JobApplication', 
  jobApplicationSchema
);

export default JobApplication;