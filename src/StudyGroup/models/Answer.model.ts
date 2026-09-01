/**
 * ====================================
 * ANSWER MODEL (PRODUCTION READY - FIXED)
 * ====================================
 * Optimized for 100K+ users
 * Features: Caching, Indexing, Performance optimization
 */

import mongoose, { Schema, Model } from 'mongoose';
import { IAnswer } from '../interfaces/IAnswer';
import Doubt from './Doubt.model';
import { validId } from '@/shared/security';

interface IAnswerMethods {
  upvote(userId: string): Promise<void>;
  downvote(userId: string): Promise<void>;
  removeVote(userId: string): Promise<void>;
  markAsBest(): Promise<void>;
  softDelete(): Promise<void>;
  addEditHistory(): Promise<void>;
}

interface IAnswerStatics {
  findByDoubt(doubtId: string, options?: any): Promise<IAnswer[]>;
  findByUser(userId: string, options?: any): Promise<IAnswer[]>;
  findBestAnswers(userId?: string, limit?: number): Promise<IAnswer[]>;
  getTopAnswerers(groupId?: string, limit?: number): Promise<any[]>;
  getAnswerStatsByUser(userId: string): Promise<any>;
  getMostUpvotedAnswers(limit?: number): Promise<IAnswer[]>;
  getRecentAnswers(groupId?: string, limit?: number): Promise<IAnswer[]>;
}

type AnswerModel = Model<IAnswer, {}, IAnswerMethods> & IAnswerStatics;

const answerSchema = new Schema<IAnswer, AnswerModel, IAnswerMethods>(
  {
    answerId: {
      type: String,
      required: true,
      unique: true,
      index: true,
      default: (v: any) => validId(v),
    },
    doubt: {
      type: String,
      ref: 'StudyGroup_Doubt',
      required: [true, 'Doubt reference is required'],
      index: true,
    },
    answeredBy: {
      type: String,
      ref: 'User',
      required: [true, 'Answered by user is required'],
      index: true,
    },
    content: {
      type: String,
      required: [true, 'Answer content is required'],
      trim: true,
      minlength: [10, 'Answer must be at least 10 characters'],
      maxlength: [5000, 'Answer must not exceed 5000 characters'],
    },
    images: {
      type: [
        {
          url: {
            type: String,
            required: true,
          },
          publicId: {
            type: String,
            required: true,
          },
          uploadedAt: {
            type: Date,
            default: Date.now,
          },
        },
      ],
      default: [],
      validate: {
        validator: function (images: any[]) {
          return images.length <= 3;
        },
        message: 'Cannot upload more than 3 images',
      },
    },
    links: {
      type: [
        {
          url: {
            type: String,
            required: true,
            match: [
              /^https?:\/\/.+/,
              'Please provide a valid URL starting with http:// or https://',
            ],
          },
          title: {
            type: String,
            trim: true,
            maxlength: [100, 'Link title must not exceed 100 characters'],
          },
        },
      ],
      default: [],
      validate: {
        validator: function (links: any[]) {
          return links.length <= 5;
        },
        message: 'Cannot add more than 5 reference links',
      },
    },
    upvotes: {
      type: Number,
      default: 0,
      min: 0,
      index: true, // For sorting by upvotes
    },
    downvotes: {
      type: Number,
      default: 0,
      min: 0,
    },
    upvotedBy: {
      type: [
        {
          type: String,
          ref: 'User',
        },
      ],
      default: [],
      // Performance: Limit array size for large-scale apps
      validate: {
        validator: function (arr: any[]) {
          return arr.length <= 10000; // Max 10K upvotes tracking
        },
        message: 'Upvote limit reached',
      },
    },
    downvotedBy: {
      type: [
        {
          type: String,
          ref: 'User',
        },
      ],
      default: [],
      validate: {
        validator: function (arr: any[]) {
          return arr.length <= 10000;
        },
        message: 'Downvote limit reached',
      },
    },
    isBestAnswer: {
      type: Boolean,
      default: false,
      index: true,
    },
    markedBestAt: {
      type: Date,
      default: null,
    },
    isEdited: {
      type: Boolean,
      default: false,
    },
    editedAt: {
      type: Date,
      default: null,
    },
    editHistory: {
      type: [
        {
          content: String,
          editedAt: {
            type: Date,
            default: Date.now,
          },
        },
      ],
      default: [],
      // Limit edit history for performance
      validate: {
        validator: function (history: any[]) {
          return history.length <= 10;
        },
        message: 'Edit history limit reached (max 10 edits)',
      },
    },
    isDeleted: {
      type: Boolean,
      default: false,
      index: true,
    },
    deletedAt: {
      type: Date,
      default: null,
    },
    deletedBy: {
      type: String,
      ref: 'User',
      default: null,
    },
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
      transform: function (_doc, ret) {
        (ret as any).id = (ret as any).answerId;
        delete ret._id;
        delete ret.__v;
        return ret;
      }
    },
    toObject: { virtuals: true },
  }
);

/**
 * ====================================
 * PERFORMANCE INDEXES (100K+ Users)
 * ====================================
 */
// Compound index for efficient doubt-wise queries
answerSchema.index({ doubt: 1, upvotes: -1, createdAt: -1 });

// Index for user's answers
answerSchema.index({ answeredBy: 1, createdAt: -1 });

// Index for best answers
answerSchema.index({ isBestAnswer: 1, markedBestAt: -1 });

// Index for leaderboard queries
answerSchema.index({ upvotes: -1, downvotes: 1 });

// Index for active (non-deleted) answers
answerSchema.index({ isDeleted: 1, createdAt: -1 });

// Compound index for group-wise queries (via doubt lookup)
answerSchema.index({ doubt: 1, isDeleted: 1, isBestAnswer: 1 });

/**
 * ====================================
 * VIRTUAL FIELDS
 * ====================================
 */
answerSchema.virtual('voteScore').get(function (this: IAnswer) {
  return this.upvotes - this.downvotes;
});

answerSchema.virtual('hasBeenEdited').get(function (this: IAnswer) {
  return this.editHistory.length > 0;
});

answerSchema.virtual('upvotePercentage').get(function (this: IAnswer) {
  const total = this.upvotes + this.downvotes;
  if (total === 0) return 0;
  return Math.round((this.upvotes / total) * 100);
});

/**
 * ====================================
 * INSTANCE METHODS
 * ====================================
 */

/**
 * Upvote an answer (Optimized for performance) - FIXED
 */

answerSchema.methods.upvote = async function(this: IAnswer, userId: string): Promise<void> {
  if (this.upvotedBy.includes(userId)) return;       // string comparison ✅

  if (this.downvotedBy.includes(userId)) {
    this.downvotes = Math.max(0, this.downvotes - 1);
    this.downvotedBy = this.downvotedBy.filter(id => id !== userId);
  }

  this.upvotedBy.push(userId);
  this.upvotes += 1;
  await this.save();
};
// answerSchema.methods.upvote = async function (
//   this: IAnswer,
//   userId: string
// ): Promise<void> {
//   const userObjectId = userId;

//   // Check if already upvoted to avoid duplicate
//   const alreadyUpvoted = this.upvotedBy.some((id: any) =>
//     id.equals(userObjectId)
//   );

//   if (!alreadyUpvoted) {
//     // Remove from downvotes if exists
//     const wasDownvoted = this.downvotedBy.some((id: any) =>
//       id.equals(userObjectId)
//     );

//     if (wasDownvoted) {
//       this.downvotes = Math.max(0, this.downvotes - 1);
//       const index = this.downvotedBy.findIndex((id: any) =>
//         id.equals(userObjectId)
//       );
//       this.downvotedBy.splice(index, 1);
//     }

//     this.upvotedBy.push(userObjectId);
//     this.upvotes += 1;

//     await this.save();
//   }
// };

/**
 * Downvote an answer (Optimized for performance)
 */
answerSchema.methods.downvote = async function(this: IAnswer, userId: string): Promise<void> {
  if (this.downvotedBy.includes(userId)) return;     // string comparison ✅

  if (this.upvotedBy.includes(userId)) {
    this.upvotes = Math.max(0, this.upvotes - 1);
    this.upvotedBy = this.upvotedBy.filter(id => id !== userId);
  }

  this.downvotedBy.push(userId);
  this.downvotes += 1;
  await this.save();
};
// answerSchema.methods.downvote = async function (
//   this: IAnswer,
//   userId: string
// ): Promise<void> {
//   const userObjectId = userId;

//   const alreadyDownvoted = this.downvotedBy.some((id: any) =>
//     id.equals(userObjectId)
//   );

//   if (!alreadyDownvoted) {
//     // Remove from upvotes if exists
//     const wasUpvoted = this.upvotedBy.some((id: any) =>
//       id.equals(userObjectId)
//     );

//     if (wasUpvoted) {
//       this.upvotes = Math.max(0, this.upvotes - 1);
//       const index = this.upvotedBy.findIndex((id: any) =>
//         id.equals(userObjectId)
//       );
//       this.upvotedBy.splice(index, 1);
//     }

//     this.downvotedBy.push(userObjectId);
//     this.downvotes += 1;

//     await this.save();
//   }
// };

/**
 * Remove vote from answer
 */
answerSchema.methods.removeVote = async function(this: IAnswer, userId: string): Promise<void> {
  const wasUpvoted = this.upvotedBy.includes(userId);
  const wasDownvoted = this.downvotedBy.includes(userId);

  this.upvotedBy = this.upvotedBy.filter(id => id !== userId);
  this.downvotedBy = this.downvotedBy.filter(id => id !== userId);

  if (wasUpvoted) this.upvotes = Math.max(0, this.upvotes - 1);
  if (wasDownvoted) this.downvotes = Math.max(0, this.downvotes - 1);

  await this.save();
};

// answerSchema.methods.removeVote = async function (
//   this: IAnswer,
//   userId: string
// ): Promise<void> {
//   const userObjectId = userId;

//   // Remove from upvotes
//   const upvoteIndex = this.upvotedBy.findIndex((id: any) =>
//     id.equals(userObjectId)
//   );
//   if (upvoteIndex !== -1) {
//     this.upvotedBy.splice(upvoteIndex, 1);
//     this.upvotes = Math.max(0, this.upvotes - 1);
//   }

//   // Remove from downvotes
//   const downvoteIndex = this.downvotedBy.findIndex((id: any) =>
//     id.equals(userObjectId)
//   );
//   if (downvoteIndex !== -1) {
//     this.downvotedBy.splice(downvoteIndex, 1);
//     this.downvotes = Math.max(0, this.downvotes - 1);
//   }

//   await this.save();
// };

/**
 * Mark answer as best (Atomic operation)
 */
answerSchema.methods.markAsBest = async function(this: IAnswer): Promise<void> {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    await Answer.updateMany(
      { doubt: this.doubt },                         // string comparison ✅
      { isBestAnswer: false, markedBestAt: null },
      { session }
    );

    this.isBestAnswer = true;
    this.markedBestAt = new Date();
    await this.save({ session });

    await Doubt.findOneAndUpdate(                    // findById → findOne with doubtId
      { doubtId: this.doubt },                       // doubt field is now UUID string
      { isSolved: true, solvedAt: new Date(), bestAnswer: this.answerId },
      { session }
    );

    await session.commitTransaction();
  } catch (error: any) {
    await session.abortTransaction();
    throw error;
  } finally {
    session.endSession();
  }
};
// answerSchema.methods.markAsBest = async function (
//   this: IAnswer
// ): Promise<void> {
//   // Use session for transaction (production best practice)
//   const session = await mongoose.startSession();
//   session.startTransaction();

//   try {
//     // Remove best answer flag from other answers
//     await Answer.updateMany(
//       { doubt: this.doubt, _id: { $ne: this._id } },
//       { isBestAnswer: false, markedBestAt: null },
//       { session }
//     );

//     // Mark this as best
//     this.isBestAnswer = true;
//     this.markedBestAt = new Date();
//     await this.save({ session });

//     // Update doubt
//     await Doubt.findByIdAndUpdate(
//       this.doubt,
//       {
//         isSolved: true,
//         solvedAt: new Date(),
//         bestAnswer: this._id,
//       },
//       { session }
//     );

//     await session.commitTransaction();
//   } catch (error: any) {
//     await session.abortTransaction();
//     throw error;
//   } finally {
//     session.endSession();
//   }
// };

/**
 * Soft delete answer
 */
answerSchema.methods.softDelete = async function (
  this: IAnswer
): Promise<void> {
  this.isDeleted = true;
  this.deletedAt = new Date();
  await this.save();

  // Decrement answer count in doubt
  const doubt = await Doubt.findById(this.doubt);
  if (doubt) {
    await doubt.decrementAnswerCount();
  }
};

/**
 * Add to edit history
 */
answerSchema.methods.addEditHistory = async function (
  this: IAnswer
): Promise<void> {
  if (this.editHistory.length < 10) {
    this.editHistory.push({
      content: this.content,
      editedAt: new Date(),
    });
  } else {
    // Keep only last 10 edits
    this.editHistory.shift();
    this.editHistory.push({
      content: this.content,
      editedAt: new Date(),
    });
  }
  await this.save();
};

/**
 * ====================================
 * STATIC METHODS
 * ====================================
 */

/**
 * Find answers by doubt (with pagination)
 */
answerSchema.statics.findByDoubt = function (
  doubtId: string,
  options: any = {}
) {
  const page = options.page || 1;
  const limit = options.limit || 20;
  const skip = (page - 1) * limit;

  return this.find({ doubt: doubtId, isDeleted: false })
    .populate('answeredBy', 'name email avatar')
    .sort({ isBestAnswer: -1, upvotes: -1, createdAt: -1 })
    .skip(skip)
    .limit(limit)
    .lean(); // Use lean() for better performance
};

/**
 * Find answers by user
 */
answerSchema.statics.findByUser = function (
  userId: string,
  options: any = {}
) {
  const page = options.page || 1;
  const limit = options.limit || 20;
  const skip = (page - 1) * limit;

  return this.find({ answeredBy: userId, isDeleted: false })
    .populate('doubt', 'title group category')
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit)
    .lean();
};

/**
 * Find best answers
 */
answerSchema.statics.findBestAnswers = function (
  userId?: string,
  limit: number = 50
) {
  const query: any = { isBestAnswer: true, isDeleted: false };
  if (userId) {
    query.answeredBy = userId;
  }

  return this.find(query)
    .populate('answeredBy', 'name email avatar')
    .populate('doubt', 'title category')
    .sort({ markedBestAt: -1 })
    .limit(limit)
    .lean();
};

/**
 * Get top answerers (Leaderboard - Optimized with aggregation)
 */
answerSchema.statics.getTopAnswerers = async function (
  groupId?: string,
  limit: number = 10
) {
  const pipeline: any[] = [
    { $match: { isDeleted: false } },
  ];

  // Filter by group if provided
  if (groupId) {
    pipeline.push(
      {
        $lookup: {
          from: 'doubts',
          localField: 'doubt',
          foreignField: '_id',
          as: 'doubtInfo',
        },
      },
      {
        $unwind: '$doubtInfo',
      },
      {
        $match: {
          'doubtInfo.group': groupId,
        },
      }
    );
  }

  pipeline.push(
    {
      $group: {
        _id: '$answeredBy',
        totalAnswers: { $sum: 1 },
        bestAnswers: {
          $sum: { $cond: [{ $eq: ['$isBestAnswer', true] }, 1, 0] },
        },
        totalUpvotes: { $sum: '$upvotes' },
        totalDownvotes: { $sum: '$downvotes' },
        avgUpvotes: { $avg: '$upvotes' },
        voteScore: {
          $sum: { $subtract: ['$upvotes', '$downvotes'] },
        },
      },
    },
    {
      $lookup: {
        from: 'users',
        localField: '_id',
        foreignField: '_id',
        as: 'userInfo',
      },
    },
    { $unwind: '$userInfo' },
    {
      $project: {
        _id: 1,
        name: '$userInfo.name',
        email: '$userInfo.email',
        avatar: '$userInfo.avatar',
        totalAnswers: 1,
        bestAnswers: 1,
        totalUpvotes: 1,
        totalDownvotes: 1,
        avgUpvotes: { $round: ['$avgUpvotes', 2] },
        voteScore: 1,
        bestAnswerRate: {
          $round: [
            {
              $multiply: [
                { $divide: ['$bestAnswers', '$totalAnswers'] },
                100,
              ],
            },
            2,
          ],
        },
      },
    },
    { $sort: { voteScore: -1, bestAnswers: -1, totalAnswers: -1 } },
    { $limit: limit }
  );

  return this.aggregate(pipeline);
};

/**
 * Get answer statistics by user
 */
answerSchema.statics.getAnswerStatsByUser = async function (userId: string) {
  const stats = await this.aggregate([
    {
      $match: {
        answeredBy: userId,
        isDeleted: false,
      },
    },
    {
      $group: {
        _id: null,
        totalAnswers: { $sum: 1 },
        bestAnswers: {
          $sum: { $cond: [{ $eq: ['$isBestAnswer', true] }, 1, 0] },
        },
        totalUpvotes: { $sum: '$upvotes' },
        totalDownvotes: { $sum: '$downvotes' },
        avgUpvotes: { $avg: '$upvotes' },
        avgScore: { $avg: { $subtract: ['$upvotes', '$downvotes'] } },
        highestUpvotes: { $max: '$upvotes' },
      },
    },
    {
      $project: {
        _id: 0,
        totalAnswers: 1,
        bestAnswers: 1,
        totalUpvotes: 1,
        totalDownvotes: 1,
        avgUpvotes: { $round: ['$avgUpvotes', 2] },
        avgScore: { $round: ['$avgScore', 2] },
        highestUpvotes: 1,
        bestAnswerRate: {
          $round: [
            {
              $multiply: [
                { $divide: ['$bestAnswers', '$totalAnswers'] },
                100,
              ],
            },
            2,
          ],
        },
      },
    },
  ]);

  return stats[0] || {};
};

/**
 * Get most upvoted answers (Trending)
 */
answerSchema.statics.getMostUpvotedAnswers = function (limit: number = 10) {
  return this.find({ isDeleted: false })
    .populate('answeredBy', 'name email avatar')
    .populate('doubt', 'title category group')
    .sort({ upvotes: -1, createdAt: -1 })
    .limit(limit)
    .lean();
};

/**
 * Get recent answers
 */
answerSchema.statics.getRecentAnswers = async function (
  groupId?: string,
  limit: number = 20
) {
  const pipeline: any[] = [
    { $match: { isDeleted: false } },
  ];

  if (groupId) {
    pipeline.push(
      {
        $lookup: {
          from: 'doubts',
          localField: 'doubt',
          foreignField: '_id',
          as: 'doubtInfo',
        },
      },
      {
        $unwind: '$doubtInfo',
      },
      {
        $match: {
          'doubtInfo.group': groupId,
        },
      }
    );
  }

  pipeline.push(
    {
      $lookup: {
        from: 'users',
        localField: 'answeredBy',
        foreignField: '_id',
        as: 'answeredByInfo',
      },
    },
    { $unwind: '$answeredByInfo' },
    {
      $project: {
        content: 1,
        upvotes: 1,
        downvotes: 1,
        createdAt: 1,
        answeredBy: {
          _id: '$answeredByInfo._id',
          name: '$answeredByInfo.name',
          avatar: '$answeredByInfo.avatar',
        },
        doubt: groupId ? '$doubtInfo.title' : '$doubt',
      },
    },
    { $sort: { createdAt: -1 } },
    { $limit: limit }
  );

  return this.aggregate(pipeline);
};

/**
 * ====================================
 * PRE-SAVE MIDDLEWARE
 * ====================================
 */
answerSchema.pre('save', function (this: IAnswer, next) {
  // Track edit history (only if content changed)
  if (this.isModified('content') && !this.isNew) {
    this.isEdited = true;
    this.editedAt = new Date();
  }

  next();
});

/**
 * POST-SAVE MIDDLEWARE (Increment answer count)
 */
answerSchema.post('save', async function (doc: IAnswer) {
  if (doc.isNew && !doc.isDeleted) {
    const doubt = await Doubt.findById(doc.doubt);
    if (doubt) {
      await doubt.incrementAnswerCount();
    }
  }
});

/**
 * ====================================
 * PRE-FIND MIDDLEWARE (FIXED)
 * ====================================
 */
answerSchema.pre('find', function (next) {
  if (!(this.getOptions() as any).includeDeleted) {
    this.where({ isDeleted: false });
  }
  next();
});

answerSchema.pre('findOne', function (next) {
  if (!(this.getOptions() as any).includeDeleted) {
    this.where({ isDeleted: false });
  }
  next();
});

answerSchema.pre('findOneAndUpdate', function (next) {
  if (!(this.getOptions() as any).includeDeleted) {
    this.where({ isDeleted: false });
  }
  next();
});

const Answer = mongoose.model<IAnswer, AnswerModel>('StudyGroup_Answer', answerSchema);

export default Answer;