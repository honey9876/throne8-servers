import mongoose, { Schema, Document } from 'mongoose';

export interface IQuery {
  _id: string;
  queryId: string; // New field for external reference
  mentorId: string;
  menteeId: string;
  question: string;
  context?: string;
  attachments?: string[];
  answer?: string;
  answeredAt?: Date;
  status: 'pending' | 'answered' | 'expired';
  priority: 'normal' | 'high';
  category?: string;
  pricing: {
    amount: number;
    currency: string;
    transactionId?: string;
    paidAt?: Date;
  };
  followUp?: {
    question: string;
    answer?: string;
    askedAt: Date;
    answeredAt?: Date;
  };
  feedback?: {
    rating: number;
    comment?: string;
    submittedAt: Date;
  };
  createdAt: Date;
  updatedAt: Date;
}

export interface QueryDocument extends Omit<IQuery, '_id'>, Document { }

const QuerySchema = new Schema<QueryDocument>(
  {
    // ADD: queryId field
    queryId: {
      type: String,
      required: true,
      unique: true,
      index: true,
      // default: () => uuidv4(),
    },
    mentorId: {
      type: String,
      required: [true, 'Mentor ID is required'],
      index: true,
    },
    menteeId: {
      type: String,
      required: [true, 'Mentee ID is required'],
      index: true,
    },
    question: {
      type: String,
      required: [true, 'Question is required'],
      trim: true,
      maxlength: [500, 'Question cannot exceed 500 characters'],
      minlength: [20, 'Question must be at least 20 characters'],
    },
    context: {
      type: String,
      trim: true,
      maxlength: [1000, 'Context cannot exceed 1000 characters'],
    },
    attachments: [String],
    answer: {
      type: String,
      trim: true,
      maxlength: [5000, 'Answer cannot exceed 5000 characters'],
    },
    answeredAt: { type: Date },
    status: {
      type: String,
      enum: ['pending', 'answered', 'expired'],
      default: 'pending',
      index: true,
    },
    priority: {
      type: String,
      enum: ['normal', 'high'],
      default: 'normal',
    },
    category: {
      type: String,
      trim: true,
    },
    pricing: {
      amount: { type: Number, required: true, min: 0 },
      currency: { type: String, default: 'INR' },
      transactionId: { type: String },
      paidAt: { type: Date },
    },
    followUp: {
      question: { type: String, trim: true, maxlength: 300 },
      answer: { type: String, trim: true, maxlength: 3000 },
      askedAt: { type: Date },
      answeredAt: { type: Date },
    },
    feedback: {
      rating: { type: Number, min: 1, max: 5 },
      comment: { type: String, trim: true, maxlength: 500 },
      submittedAt: { type: Date },
    },
  },
  {
    timestamps: true,
    // toJSON: { virtuals: true },
    // ADD: toJSON transform
   // 3. toJSON transform update karo
toJSON: {
  virtuals: true,
  transform: function (_doc, ret) {
    ret.id = ret.queryId;
    delete (ret as any)._id;
    delete (ret as any).__v;
    return ret;
  }
},
    toObject: { virtuals: true },
  }
);

// Indexes
QuerySchema.index({ mentorId: 1, status: 1 });
QuerySchema.index({ menteeId: 1, status: 1 });
QuerySchema.index({ status: 1, createdAt: -1 });
QuerySchema.index({ mentorId: 1, answeredAt: -1 });

// Virtual: isExpired
QuerySchema.virtual('isExpired').get(function () {
  if (this.status === 'answered') return false;
  const hoursSinceCreated = (Date.now() - this.createdAt.getTime()) / (1000 * 60 * 60);
  return hoursSinceCreated > 48;
});

// Virtual: canFollowUp
QuerySchema.virtual('canFollowUp').get(function () {
  return this.status === 'answered' && !this.followUp?.askedAt;
});

// Instance Methods
QuerySchema.methods.answerQuery = async function (answer: string) {
  this.answer = answer;
  this.answeredAt = new Date();
  this.status = 'answered';
  return await this.save();
};

QuerySchema.methods.addFollowUp = async function (question: string) {
  if (this.followUp?.askedAt) {
    throw new Error('Follow-up already submitted');
  }
  this.followUp = {
    question,
    askedAt: new Date(),
  };
  return await this.save();
};

QuerySchema.methods.answerFollowUp = async function (answer: string) {
  if (!this.followUp?.question) {
    throw new Error('No follow-up question found');
  }
  this.followUp.answer = answer;
  this.followUp.answeredAt = new Date();
  return await this.save();
};

QuerySchema.methods.addFeedback = async function (rating: number, comment?: string) {
  this.feedback = {
    rating,
    comment,
    submittedAt: new Date(),
  };
  return await this.save();
};

QuerySchema.methods.markAsExpired = async function () {
  this.status = 'expired';
  return await this.save();
};

// Pre-save middleware
QuerySchema.pre('save', function (next) {
  // Auto-expire if more than 48 hours old and still pending
  if (this.status === 'pending') {
    const hoursSinceCreated = (Date.now() - this.createdAt.getTime()) / (1000 * 60 * 60);
    if (hoursSinceCreated > 48) {
      this.status = 'expired';
    }
  }
  next();
});

// Static Methods
QuerySchema.statics.findPending = function (mentorId: string) {
  return this.find({
    mentorId,
    status: 'pending',
  }).sort({ priority: -1, createdAt: 1 });
};

QuerySchema.statics.findAnswered = function (mentorId: string) {
  return this.find({
    mentorId,
    status: 'answered',
  }).sort({ answeredAt: -1 });
};

QuerySchema.statics.getQueryStats = async function (mentorId: string) {
  const stats = await this.aggregate([
    { $match: { mentorId } },
    {
      $group: {
        _id: null,
        total: { $sum: 1 },
        pending: {
          $sum: { $cond: [{ $eq: ['$status', 'pending'] }, 1, 0] },
        },
        answered: {
          $sum: { $cond: [{ $eq: ['$status', 'answered'] }, 1, 0] },
        },
        expired: {
          $sum: { $cond: [{ $eq: ['$status', 'expired'] }, 1, 0] },
        },
        totalRevenue: { $sum: '$pricing.amount' },
        avgRating: { $avg: '$feedback.rating' },
      },
    },
  ]);

  return stats[0] || {
    total: 0,
    pending: 0,
    answered: 0,
    expired: 0,
    totalRevenue: 0,
    avgRating: 0,
  };
};

export default mongoose.model<QueryDocument>('Query', QuerySchema);