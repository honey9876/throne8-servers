import mongoose, { Schema, Document, Model } from 'mongoose';

export interface IResume {
  _id: string;
  userId: string;
  sessionId?: string;
  filename: string;
  originalName: string;
  fileUrl: string;
  fileKey: string;
  fileSize: number;
  mimeType: string;
  
  analysis: {
    atsScore: number;
    scannedAt: Date;
    
    sections: {
      contactInfo: boolean;
      summary: boolean;
      experience: boolean;
      education: boolean;
      skills: boolean;
      certifications: boolean;
      projects: boolean;
    };
    
    keywords: string[];
    missingKeywords: string[];
    
    strengths: string[];
    weaknesses: string[];
    suggestions: string[];
    
    formatting: {
      score: number;
      issues: string[];
    };
    
    content: {
      score: number;
      wordCount: number;
      pageCount: number;
    };
  };
  
  mentorFeedback?: {
    mentorId: string;
    rating: number;
    comments: string;
    detailedFeedback: {
      structure: string;
      content: string;
      formatting: string;
      keywords: string;
      overall: string;
    };
    actionItems: string[];
    submittedAt: Date;
  };
  
  version: number;
  isLatest: boolean;
  isDeleted: boolean;
  createdAt: Date;
  updatedAt: Date;
}

// // export interface ResumeDocument extends Omit<IResume, '_id'>, Document {
//   needsImprovement: boolean;
//   isGoodQuality: boolean;
  
//   markAsDeleted(): Promise<ResumeDocument>;
//   addMentorFeedback(
//     mentorId: string,
//     rating: number,
//     comments: string,
//     detailedFeedback: any,
//     actionItems: string[]
//   ): Promise<ResumeDocument>;
//   getLatestResume(userId: string): Promise<ResumeDocument | null>;
//   getAllVersions(userId: string): Promise<ResumeDocument[]>;
//   getResumeStats(userId: string): Promise<{
//     totalVersions: number;
//     averageScore: number;
//     latestScore: number;
//     improvement: number;
//   } | null>;
// }

export interface ResumeDocument extends Omit<IResume, '_id'>, Document {
  needsImprovement: boolean;
  isGoodQuality: boolean;
  
  markAsDeleted(): Promise<ResumeDocument>;
  addMentorFeedback(
    mentorId: string,
    rating: number,
    comments: string,
    detailedFeedback: any,
    actionItems: string[]
  ): Promise<ResumeDocument>;
}

// ADD THIS INTERFACE for static methods
export interface ResumeModel extends Model<ResumeDocument> {
  getLatestResume(userId: string): Promise<ResumeDocument | null>;
  getAllVersions(userId: string): Promise<ResumeDocument[]>;
  getResumeStats(userId: string): Promise<{
    totalVersions: number;
    averageScore: number;
    latestScore: number;
    improvement: number;
  } | null>;
}

const ResumeSchema = new Schema<ResumeDocument>(
  {
    userId: {
      type: String,
      required: [true, 'User ID is required'],
      index: true,
    },
    sessionId: {
      type: String,
      index: true,
    },
    filename: {
      type: String,
      required: true,
    },
    originalName: {
      type: String,
      required: true,
    },
    fileUrl: {
      type: String,
      required: true,
    },
    fileKey: {
      type: String,
      required: true,
    },
    fileSize: {
      type: Number,
      required: true,
    },
    mimeType: {
      type: String,
      required: true,
    },
    
    analysis: {
      atsScore: {
        type: Number,
        min: 0,
        max: 100,
        required: true,
      },
      scannedAt: {
        type: Date,
        default: Date.now,
      },
      
      sections: {
        contactInfo: { type: Boolean, default: false },
        summary: { type: Boolean, default: false },
        experience: { type: Boolean, default: false },
        education: { type: Boolean, default: false },
        skills: { type: Boolean, default: false },
        certifications: { type: Boolean, default: false },
        projects: { type: Boolean, default: false },
      },
      
      keywords: [String],
      missingKeywords: [String],
      
      strengths: [String],
      weaknesses: [String],
      suggestions: [String],
      
      formatting: {
        score: {
          type: Number,
          min: 0,
          max: 100,
        },
        issues: [String],
      },
      
      content: {
        score: {
          type: Number,
          min: 0,
          max: 100,
        },
        wordCount: Number,
        pageCount: Number,
      },
    },
    
    mentorFeedback: {
      mentorId: String,
      rating: {
        type: Number,
        min: 1,
        max: 5,
      },
      comments: String,
      detailedFeedback: {
        structure: String,
        content: String,
        formatting: String,
        keywords: String,
        overall: String,
      },
      actionItems: [String],
      submittedAt: Date,
    },
    
    version: {
      type: Number,
      default: 1,
    },
    isLatest: {
      type: Boolean,
      default: true,
      index: true,
    },
    isDeleted: {
      type: Boolean,
      default: false,
      index: true,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Indexes
ResumeSchema.index({ userId: 1, isLatest: 1, isDeleted: 1 });
ResumeSchema.index({ sessionId: 1 });
ResumeSchema.index({ 'analysis.atsScore': 1 });

// Virtuals
ResumeSchema.virtual('needsImprovement').get(function () {
  return this.analysis.atsScore < 70;
});

ResumeSchema.virtual('isGoodQuality').get(function () {
  return this.analysis.atsScore >= 80;
});

// Pre-save: Mark previous versions as not latest
ResumeSchema.pre('save', async function (next) {
  if (this.isNew && this.isLatest) {
    await mongoose.model('Resume').updateMany(
      {
        userId: this.userId,
        _id: { $ne: this._id },
        isLatest: true,
      },
      {
        $set: { isLatest: false },
      }
    );
  }
  next();
});

// Instance Methods
ResumeSchema.methods.markAsDeleted = async function () {
  this.isDeleted = true;
  return await this.save();
};

ResumeSchema.methods.addMentorFeedback = async function (
  mentorId: string,
  rating: number,
  comments: string,
  detailedFeedback: any,
  actionItems: string[]
) {
  this.mentorFeedback = {
    mentorId,
    rating,
    comments,
    detailedFeedback,
    actionItems,
    submittedAt: new Date(),
  };
  
  return await this.save();
};

// Static Methods
ResumeSchema.statics.getLatestResume = function (userId: string) {
  return this.findOne({
    userId,
    isLatest: true,
    isDeleted: false,
  });
};

ResumeSchema.statics.getAllVersions = function (userId: string) {
  return this.find({
    userId,
    isDeleted: false,
  }).sort({ version: -1 });
};

ResumeSchema.statics.getResumeStats = async function (userId: string) {
  const resumes = await this.find({ userId, isDeleted: false });
  
  if (resumes.length === 0) {
    return null;
  }
  
  const avgScore = resumes.reduce((sum: number, r: any) => sum + r.analysis.atsScore, 0) / resumes.length;
  const latestScore = resumes.find((r: any) => r.isLatest)?.analysis.atsScore || 0;
  
  return {
    totalVersions: resumes.length,
    averageScore: Math.round(avgScore),
    latestScore,
    improvement: latestScore - avgScore,
  };
};

export default mongoose.model<ResumeDocument , ResumeModel>('Resume', ResumeSchema);


