// models/SeniorMentorApplication.ts
import mongoose, { Schema, Document, Model } from 'mongoose';
import { v4 as uuidv4 } from 'uuid';
import { Domain } from '@/shared/constants/domains';
import { ExperienceLevel } from '@/Mentorship/interface/mentor.types';
import {
  ApplicationStatus,
  ISeniorMentorApplication,
  MentorshipHelpArea,
} from '@/Mentorship/interface/seniorMentorApplication.types';

export interface SeniorMentorApplicationDocument
  extends Omit<ISeniorMentorApplication, '_id'>,
    Document {
  profileCompletion: number; // virtual
}

interface ISeniorMentorApplicationModel extends Model<SeniorMentorApplicationDocument> {
  findByUserId(userId: string): Promise<SeniorMentorApplicationDocument | null>;
  findPending(): mongoose.Query<SeniorMentorApplicationDocument[], SeniorMentorApplicationDocument>;
}

const SeniorMentorApplicationSchema = new Schema<SeniorMentorApplicationDocument>(
  {
    applicationId: {
      type: String,
      required: true,
      unique: true,
      index: true,
      default: () => uuidv4(),
      validate: {
        validator: (v: string) =>
          /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v),
        message: 'Invalid application UUID format',
      },
    },
    userId: {
      type: String,
      required: [true, 'User ID is required'],
      index: true,
    },

    // ── 1. Profile ────────────────────────────────────────────────
    fullName: {
      type: String,
      required: [true, 'Full name is required'],
      trim: true,
      minlength: [2, 'Full name must be at least 2 characters'],
      maxlength: [100, 'Full name cannot exceed 100 characters'],
    },
    profilePhoto: { type: String, trim: true },
    profilePhotoKey: { type: String, trim: true },
    college: {
      type: String,
      required: [true, 'College/University is required'],
      trim: true,
      maxlength: [200, 'College/University cannot exceed 200 characters'],
    },
    degree: {
      type: String,
      required: [true, 'Degree is required'],
      trim: true,
      maxlength: [100, 'Degree cannot exceed 100 characters'],
    },
    fieldOfStudy: {
      type: String,
      required: [true, 'Field of study is required'],
      trim: true,
      maxlength: [100, 'Field of study cannot exceed 100 characters'],
    },
    graduationYear: {
      type: Number,
      required: [true, 'Graduation year is required'],
      min: [1980, 'Graduation year seems invalid'],
      max: [new Date().getFullYear() + 10, 'Graduation year seems invalid'],
    },
    currentRole: {
      type: String,
      required: [true, 'Current role is required'],
      trim: true,
      maxlength: [100, 'Current role cannot exceed 100 characters'],
    },
    currentCompany: {
      type: String,
      required: [true, 'Current company is required'],
      trim: true,
      maxlength: [100, 'Current company cannot exceed 100 characters'],
    },
    shortBio: {
      type: String,
      required: [true, 'Short bio is required'],
      trim: true,
      minlength: [50, 'Bio must be at least 50 characters'],
      maxlength: [1000, 'Bio cannot exceed 1000 characters'],
    },

    // ── 2. Professional ──────────────────────────────────────────
    linkedinUrl: {
      type: String,
      required: [true, 'LinkedIn URL is required'],
      trim: true,
      match: [/^https?:\/\/(www\.)?linkedin\.com\/.+/i, 'Invalid LinkedIn URL'],
    },
    githubUrl: {
      type: String,
      trim: true,
      match: [/^https?:\/\/(www\.)?github\.com\/.+/i, 'Invalid GitHub URL'],
    },
    portfolioUrl: { type: String, trim: true },
    yearsOfExperience: {
      type: Number,
      required: [true, 'Years of experience is required'],
      min: [0, 'Years of experience cannot be negative'],
      max: [50, 'Years of experience seems invalid'],
    },
    experienceLevel: {
      type: String,
      enum: Object.values(ExperienceLevel),
      required: [true, 'Experience level is required'],
    },
    primaryExpertise: {
      type: String,
      enum: Object.values(Domain),
      required: [true, 'Primary expertise is required'],
      index: true,
    },
    otherSkills: {
      type: [String],
      default: [],
      validate: {
        validator: (v: string[]) => v.length <= 20,
        message: 'Cannot list more than 20 skills',
      },
    },
    technologies: {
      type: [String],
      default: [],
      validate: {
        validator: (v: string[]) => v.length <= 30,
        message: 'Cannot list more than 30 technologies',
      },
    },
    achievements: {
      type: [String],
      default: [],
      validate: {
        validator: (v: string[]) => v.length <= 15,
        message: 'Cannot list more than 15 achievements',
      },
    },
    certifications: {
      type: [String],
      default: [],
      validate: {
        validator: (v: string[]) => v.length <= 15,
        message: 'Cannot list more than 15 certifications',
      },
    },

    // ── 3. Mentorship ────────────────────────────────────────────
    helpAreas: {
      type: [String],
      enum: Object.values(MentorshipHelpArea),
      required: [true, 'At least one mentorship help area is required'],
      validate: {
        validator: (v: string[]) => v.length > 0 && v.length <= 7,
        message: 'Select 1-7 help areas',
      },
    },

    // ── 4. Why Become a Mentor? ──────────────────────────────────
    motivation: {
      type: String,
      required: [true, 'Please share why you want to become a Senior Mentor'],
      trim: true,
      minlength: [30, 'Please write at least 30 characters'],
      maxlength: [1000, 'Cannot exceed 1000 characters'],
    },
    adviceToJuniorSelf: {
      type: String,
      required: [true, 'This field is required'],
      trim: true,
      minlength: [10, 'Please write at least 10 characters'],
      maxlength: [500, 'Cannot exceed 500 characters'],
    },

    // ── 5. Verification ──────────────────────────────────────────
    resumeUrl: {
      type: String,
      required: [true, 'Resume/CV is required'],
      trim: true,
    },
    resumeKey: { type: String, trim: true },
    proofDocumentUrl: {
      type: String,
      required: [true, 'Proof of experience/achievement is required'],
      trim: true
    },  
    proofDocumentKey: { type: String, trim: true },
    verificationStatus: {
      type: String,
      enum: Object.values(ApplicationStatus),
      default: ApplicationStatus.PENDING,
      index: true,
    },
    verifiedAt: { type: Date },
    verifiedBy: { type: String },
    rejectionReason: {
      type: String,
      trim: true,
      maxlength: [500, 'Rejection reason cannot exceed 500 characters'],
    },

    // ── 6. System ─────────────────────────────────────────────────
    isActive: { type: Boolean, default: true, index: true },
    isDeleted: { type: Boolean, default: false, index: true },
    deletedAt: { type: Date },
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
      transform: (_doc, ret) => {
        ret.id = ret.applicationId;
        delete (ret as any)._id;
        delete (ret as any).__v;
        return ret;
      },
    },
    toObject: { virtuals: true },
  }
);

// ── Compound Indexes ─────────────────────────────────────────────
SeniorMentorApplicationSchema.index({ userId: 1, isDeleted: 1 });
SeniorMentorApplicationSchema.index({ verificationStatus: 1, createdAt: -1 });
SeniorMentorApplicationSchema.index({ primaryExpertise: 1, verificationStatus: 1 });
// One non-deleted application per user (prevents duplicate spam applications).
// A rejected application must be updated/reapplied rather than duplicated.
SeniorMentorApplicationSchema.index(
  { userId: 1 },
  { unique: true, partialFilterExpression: { isDeleted: false } }
);

// ── Virtuals ─────────────────────────────────────────────────────
SeniorMentorApplicationSchema.virtual('profileCompletion').get(function (
  this: SeniorMentorApplicationDocument
) {
  const fields = [
    this.fullName,
    this.profilePhoto,
    this.college,
    this.degree,
    this.fieldOfStudy,
    this.graduationYear,
    this.currentRole,
    this.currentCompany,
    this.shortBio,
    this.linkedinUrl,
    this.githubUrl || this.portfolioUrl,
    this.yearsOfExperience !== undefined && this.yearsOfExperience !== null,
    this.experienceLevel,
    this.primaryExpertise,
    this.otherSkills && this.otherSkills.length > 0,
    this.technologies && this.technologies.length > 0,
    this.helpAreas && this.helpAreas.length > 0,
    this.motivation,
    this.adviceToJuniorSelf,
    this.resumeUrl,
    this.proofDocumentUrl,
  ];

  const filled = fields.filter(Boolean).length;
  return Math.round((filled / fields.length) * 100);
});

// ── Pre-save ─────────────────────────────────────────────────────
SeniorMentorApplicationSchema.pre('save', function (next) {
  // Re-submitting after a rejection moves the application back to pending review.
  if (
    this.isModified() &&
    !this.isNew &&
    this.verificationStatus === ApplicationStatus.REJECTED &&
    !this.isModified('verificationStatus')
  ) {
    this.verificationStatus = ApplicationStatus.PENDING;
    this.rejectionReason = undefined;
  }
  next();
});

// ── Instance Methods ─────────────────────────────────────────────
SeniorMentorApplicationSchema.methods.approve = async function (adminUserId: string) {
  this.verificationStatus = ApplicationStatus.VERIFIED;
  this.verifiedAt = new Date();
  this.verifiedBy = adminUserId;
  this.rejectionReason = undefined;
  return await this.save();
};

SeniorMentorApplicationSchema.methods.reject = async function (
  adminUserId: string,
  reason: string
) {
  this.verificationStatus = ApplicationStatus.REJECTED;
  this.verifiedBy = adminUserId;
  this.rejectionReason = reason;
  this.verifiedAt = undefined;
  return await this.save();
};

SeniorMentorApplicationSchema.methods.softDelete = async function () {
  this.isDeleted = true;
  this.deletedAt = new Date();
  this.isActive = false;
  return await this.save();
};

// ── Static Methods ───────────────────────────────────────────────
SeniorMentorApplicationSchema.statics.findByUserId = function (userId: string) {
  return this.findOne({ userId, isDeleted: false });
};

SeniorMentorApplicationSchema.statics.findPending = function () {
  return this.find({
    verificationStatus: { $in: [ApplicationStatus.PENDING, ApplicationStatus.UNDER_REVIEW] },
    isDeleted: false,
  }).sort({ createdAt: 1 });
};

export default mongoose.model<SeniorMentorApplicationDocument, ISeniorMentorApplicationModel>(
  'SeniorMentorApplication',
  SeniorMentorApplicationSchema
);
