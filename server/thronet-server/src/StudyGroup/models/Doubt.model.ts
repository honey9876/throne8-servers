import mongoose, { Schema, Model, Document } from 'mongoose';
import { IDoubt } from '../interfaces/IDoubt';
import { validId } from '@/shared/security';

interface IDoubtMethods {
  markAsSolved(answerId: string): Promise<void>;
  incrementViewCount(): Promise<void>;
  incrementAnswerCount(): Promise<void>;
  decrementAnswerCount(): Promise<void>;
  softDelete(): Promise<void>;
}

interface IDoubtStatics {
  findByGroup(groupId: string, options?: any): Promise<IDoubt[]>;
  findSolved(groupId: string): Promise<IDoubt[]>;
  findUnsolved(groupId: string): Promise<IDoubt[]>;
  findUrgent(groupId: string): Promise<IDoubt[]>;
  findByCategory(category: string, groupId?: string): Promise<IDoubt[]>;
  searchDoubts(query: string, groupId?: string): Promise<IDoubt[]>;
  getDoubtStatsByGroup(groupId: string): Promise<any>;
  getDoubtStatsByUser(userId: string): Promise<any>;
}

type DoubtModel = Model<IDoubt, {}, IDoubtMethods> & IDoubtStatics;
type DoubtDoc = IDoubt & IDoubtMethods & Document;

const doubtSchema = new Schema(
  {
    doubtId: {
      type: String,
      required: true,
      default: () => validId(''),
    },
    title: {
      type: String,
      required: [true, 'Doubt title is required'],
      trim: true,
      minlength: [5, 'Title must be at least 5 characters'],
      maxlength: [200, 'Title must not exceed 200 characters'],
    },
    description: {
      type: String,
      trim: true,
      maxlength: [2000, 'Description must not exceed 2000 characters'],
    },
    group: {
      type: String,
      ref: 'StudyGroup_Group',
      required: [true, 'Group is required'],
    },
    postedBy: {
      type: String,
      ref: 'User',
      required: [true, 'Posted by user is required'],
    },
    category: {
      type: String,
      enum: [
        'Mathematics', 'Physics', 'Chemistry', 'Biology', 'Computer Science',
        'English', 'Hindi', 'Social Science', 'General Knowledge', 'Aptitude',
        'Reasoning', 'Current Affairs', 'Programming', 'Data Structures',
        'Algorithms', 'Web Development', 'Mobile Development', 'Machine Learning',
        'Artificial Intelligence', 'Database', 'Networking', 'Operating System', 'Other',
      ],
      default: 'Other',
    },
    subject: {
      type: String,
      trim: true,
      maxlength: [50, 'Subject must not exceed 50 characters'],
    },
    tags: {
      type: [String],
      default: [],
      validate: {
        validator: function (tags: string[]) { return tags.length <= 10; },
        message: 'Cannot have more than 10 tags',
      },
    },
    images: {
      type: [
        {
          url: { type: String, required: true },
          publicId: { type: String, required: true },
          uploadedAt: { type: Date, default: Date.now },
        },
      ],
      default: [],
      validate: {
        validator: function (images: any[]) { return images.length <= 5; },
        message: 'Cannot upload more than 5 images',
      },
    },
    isUrgent: { type: Boolean, default: false },
    isSolved: { type: Boolean, default: false },
    solvedAt: { type: Date, default: null },
    bestAnswer: { type: String, ref: 'Answer', default: null },
    answerCount: { type: Number, default: 0, min: 0 },
    viewCount: { type: Number, default: 0, min: 0 },
    upvotes: { type: Number, default: 0, min: 0 },
    upvotedBy: {
      type: [{ type: String, ref: 'User' }],
      default: [],
    },
    taggedMembers: {
      type: [{ type: String, ref: 'User' }],
      default: [],
      validate: {
        validator: function (members: any[]) { return members.length <= 10; },
        message: 'Cannot tag more than 10 members',
      },
    },
    priority: { type: Number, default: 0, min: 0, max: 10 },
    difficulty: {
      type: String,
      enum: ['Easy', 'Medium', 'Hard', 'Expert'],
      default: 'Medium',
    },
    isEdited: { type: Boolean, default: false },
    editedAt: { type: Date, default: null },
    isDeleted: { type: Boolean, default: false },
    deletedAt: { type: Date, default: null },
    deletedBy: { type: String, ref: 'User', default: null },
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
      transform: function (_doc, ret) {
        const r = ret as any;
        r.id = r.doubtId;
        delete r._id;
        delete r.__v;
        return r;
      },
    },
    toObject: { virtuals: true },
  }
);

doubtSchema.index({ doubtId: 1 }, { unique: true });
doubtSchema.index({ group: 1, isSolved: 1 });
doubtSchema.index({ group: 1, createdAt: -1 });
doubtSchema.index({ postedBy: 1, createdAt: -1 });
doubtSchema.index({ category: 1, isSolved: 1 });
doubtSchema.index({ title: 'text', description: 'text', tags: 'text' });
doubtSchema.index({ isDeleted: 1, createdAt: -1 });

doubtSchema.virtual('answers', {
  ref: 'Answer',
  localField: '_id',
  foreignField: 'doubt',
  options: { sort: { upvotes: -1, createdAt: -1 } },
});

doubtSchema.virtual('isAnswered').get(function (this: DoubtDoc) {
  return this.answerCount > 0;
});

doubtSchema.virtual('solvedDuration').get(function (this: DoubtDoc) {
  if (this.isSolved && this.solvedAt) {
    const duration = this.solvedAt.getTime() - this.createdAt.getTime();
    return Math.floor(duration / (1000 * 60));
  }
  return null;
});

doubtSchema.methods.markAsSolved = async function (this: DoubtDoc, answerId: string): Promise<void> {
  this.isSolved = true;
  this.solvedAt = new Date();
  this.bestAnswer = answerId;
  await this.save();
};

doubtSchema.methods.incrementViewCount = async function (this: DoubtDoc): Promise<void> {
  this.viewCount += 1;
  await this.save({ validateBeforeSave: false });
};

doubtSchema.methods.incrementAnswerCount = async function (this: DoubtDoc): Promise<void> {
  this.answerCount += 1;
  await this.save({ validateBeforeSave: false });
};

doubtSchema.methods.decrementAnswerCount = async function (this: DoubtDoc): Promise<void> {
  if (this.answerCount > 0) {
    this.answerCount -= 1;
    await this.save({ validateBeforeSave: false });
  }
};

doubtSchema.methods.softDelete = async function (this: DoubtDoc): Promise<void> {
  this.isDeleted = true;
  this.deletedAt = new Date();
  await this.save();
};

doubtSchema.statics.findByGroup = function (groupId: string, options: any = {}) {
  const query: any = { group: groupId, isDeleted: false };
  if (options.isSolved !== undefined) query.isSolved = options.isSolved;

  return this.find(query)
    .populate('postedBy', 'name email avatar')
    .sort(options.sort || { createdAt: -1 })
    .limit(options.limit || 50);
};

doubtSchema.statics.findSolved = function (groupId: string) {
  return this.find({ group: groupId, isSolved: true, isDeleted: false })
    .populate('postedBy', 'name email avatar')
    .populate('bestAnswer')
    .sort({ solvedAt: -1 });
};

doubtSchema.statics.findUnsolved = function (groupId: string) {
  return this.find({ group: groupId, isSolved: false, isDeleted: false })
    .populate('postedBy', 'name email avatar')
    .sort({ isUrgent: -1, createdAt: -1 });
};

doubtSchema.statics.findUrgent = function (groupId: string) {
  return this.find({ group: groupId, isUrgent: true, isSolved: false, isDeleted: false })
    .populate('postedBy', 'name email avatar')
    .sort({ createdAt: -1 });
};

doubtSchema.statics.findByCategory = function (category: string, groupId?: string) {
  const query: any = { category, isDeleted: false };
  if (groupId) query.group = groupId;

  return this.find(query)
    .populate('postedBy', 'name email avatar')
    .sort({ createdAt: -1 });
};

doubtSchema.statics.searchDoubts = function (query: string, groupId?: string) {
  const searchQuery: any = { $text: { $search: query }, isDeleted: false };
  if (groupId) searchQuery.group = groupId;

  return this.find(searchQuery, { score: { $meta: 'textScore' } })
    .populate('postedBy', 'name email avatar')
    .sort({ score: { $meta: 'textScore' } });
};

doubtSchema.statics.getDoubtStatsByGroup = async function (groupId: string) {
  const stats = await this.aggregate([
    { $match: { group: groupId, isDeleted: false } },
    {
      $group: {
        _id: null,
        totalDoubts: { $sum: 1 },
        solvedDoubts: { $sum: { $cond: [{ $eq: ['$isSolved', true] }, 1, 0] } },
        unsolvedDoubts: { $sum: { $cond: [{ $eq: ['$isSolved', false] }, 1, 0] } },
        urgentDoubts: { $sum: { $cond: [{ $eq: ['$isUrgent', true] }, 1, 0] } },
        totalAnswers: { $sum: '$answerCount' },
        totalViews: { $sum: '$viewCount' },
        avgAnswersPerDoubt: { $avg: '$answerCount' },
        avgViewsPerDoubt: { $avg: '$viewCount' },
      },
    },
  ]);
  return stats[0] || {};
};

doubtSchema.statics.getDoubtStatsByUser = async function (userId: string) {
  const stats = await this.aggregate([
    { $match: { postedBy: userId, isDeleted: false } },
    {
      $group: {
        _id: null,
        totalDoubtsPosted: { $sum: 1 },
        solvedDoubts: { $sum: { $cond: [{ $eq: ['$isSolved', true] }, 1, 0] } },
        unsolvedDoubts: { $sum: { $cond: [{ $eq: ['$isSolved', false] }, 1, 0] } },
        totalAnswersReceived: { $sum: '$answerCount' },
        totalViews: { $sum: '$viewCount' },
      },
    },
  ]);
  return stats[0] || {};
};

doubtSchema.pre('save', function (this: DoubtDoc, next) {
  if (this.isModified('isSolved') && this.isSolved && !this.solvedAt) {
    this.solvedAt = new Date();
  }

  if (this.isModified('title') || this.isModified('description')) {
    if (!this.isNew) {
      this.isEdited = true;
      this.editedAt = new Date();
    }
  }

  if (this.isUrgent) {
    this.priority = 10;
  } else if (this.answerCount === 0) {
    this.priority = 5;
  } else {
    this.priority = Math.max(0, 5 - this.answerCount);
  }

  next();
});

doubtSchema.pre('find', function (next) {
  if (!(this.getOptions() as any).includeDeleted) {
    this.where({ isDeleted: false });
  }
  next();
});

doubtSchema.pre('findOne', function (next) {
  if (!(this.getOptions() as any).includeDeleted) {
    this.where({ isDeleted: false });
  }
  next();
});

doubtSchema.pre('findOneAndUpdate', function (next) {
  if (!(this.getOptions() as any).includeDeleted) {
    this.where({ isDeleted: false });
  }
  next();
});

const Doubt = mongoose.model<IDoubt, DoubtModel>('StudyGroup_Doubt', doubtSchema);

export default Doubt;