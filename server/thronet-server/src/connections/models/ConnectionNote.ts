// src/models/mongodb/ConnectionNote.ts

import { 
  Schema, 
  model, 
  Document, 
  Model, 
  Types, 
  QueryOptions, 
  UpdateQuery,
  FilterQuery,
} from 'mongoose';
import { v4 as uuidv4 } from 'uuid';
import mongoosePaginate from 'mongoose-paginate-v2';
import mongooseAggregatePaginate from 'mongoose-aggregate-paginate-v2';
import { createHash } from 'crypto';

// ✅ HELPER: Convert connectionId to appropriate format (ObjectId or String)
const convertToObjectId = (id: string): Types.ObjectId | string => {
  // If it's a valid 24-character hex string (MongoDB ObjectId), convert it
  if (/^[0-9a-fA-F]{24}$/.test(id)) {
    return new Types.ObjectId(id);
  }
  // If it's a UUID, return as string for MongoDB query matching
  return id;
};

export enum NoteType {
  PERSONAL = 'personal',
  PROFESSIONAL = 'professional',
  MEETING = 'meeting',
  FOLLOW_UP = 'follow_up',
  REMINDER = 'reminder',
  FEEDBACK = 'feedback',
  OTHER = 'other'
}

export enum NotePriority {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  URGENT = 'urgent'
}

export enum NoteStatus {
  ACTIVE = 'active',
  ARCHIVED = 'archived',
  DELETED = 'deleted'
}

export interface INoteAttachment {
  id: string;
  filename: string;
  mimeType: string;
  size: number;
  uploadedAt: Date;
  url?: string;
}

export interface INoteReminder {
  id: string;
  reminderAt: Date;
  isCompleted: boolean;
  notificationSent: boolean;
  reminderType: 'email' | 'push' | 'sms';
}

export interface INoteCollaborator {
  userId: Types.ObjectId;
  permission: 'view' | 'edit' | 'admin';
  addedAt: Date;
  addedBy: Types.ObjectId;
}

export interface INoteActivity {
  action: 'created' | 'updated' | 'viewed' | 'shared' | 'archived';
  userId: Types.ObjectId;
  timestamp: Date;
  metadata?: Record<string, any>;
}

export interface IConnectionNote extends Document {
  noteId: string;
  connectionId: Types.ObjectId;
  userId: Types.ObjectId;
  title?: string;
  content: string;
  summary?: string;
  contentHash: string;
  type: NoteType;
  priority: NotePriority;
  status: NoteStatus;
  tags: string[];
  category?: string;
  isPrivate: boolean;
  visibility: 'private' | 'shared' | 'team' | 'public';
  sharedWith: Types.ObjectId[];
  collaborators: INoteCollaborator[];
  attachments: INoteAttachment[];
  mentions: Types.ObjectId[];
  linkedNotes: Types.ObjectId[];
  reminders: INoteReminder[];
  viewCount: number;
  lastViewedAt?: Date;
  likeCount: number;
  shareCount: number;
  version: number;
  previousVersions: Types.ObjectId[];
  activities: INoteActivity[];
  searchKeywords: string[];
  isIndexed: boolean;
  isTemplate: boolean;
  templateCategory?: string;
  isPinned: boolean;
  expiresAt?: Date;
  retentionPolicy?: string;
  lastModifiedBy: Types.ObjectId;
  wordCount: number;
  readTimeMinutes: number;
  createdAt: Date;
  updatedAt: Date;
  archivedAt?: Date;
  deletedAt?: Date;
}

export interface IPaginatedNotes {
  docs: IConnectionNote[];
  totalDocs: number;
  limit: number;
  page: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPrevPage: boolean;
  nextPage?: number;
  prevPage?: number;
}

export interface INoteSearchOptions {
  query?: string;
  tags?: string[];
  type?: NoteType;
  priority?: NotePriority;
  status?: NoteStatus;
  userId?: string;
  connectionId?: string;
  dateFrom?: Date;
  dateTo?: Date;
  isPrivate?: boolean;
  hasAttachments?: boolean;
  hasReminders?: boolean;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  page?: number;
  limit?: number;
}

const connectionNoteSchema: Schema = new Schema(
  {
    noteId: {
      type: String,
      default: () => uuidv4(),
      unique: true,
      required: true,
    },
    connectionId: {
      type: Schema.Types.Mixed,  // ✅ Changed to Mixed to support both ObjectId and String (UUID)
      required: [true, 'Connection ID is required'],
    },
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'User ID is required'],
    },
    title: {
      type: String,
      maxlength: [200, 'Title cannot exceed 200 characters'],
      trim: true,
      index: 'text'
    },
    content: {
      type: String,
      required: [true, 'Note content is required'],
      minlength: [1, 'Content must be at least 1 character'],
      maxlength: [50000, 'Content cannot exceed 50,000 characters'],
      trim: true,
      index: 'text'
    },
    summary: {
      type: String,
      maxlength: [500, 'Summary cannot exceed 500 characters']
    },
    contentHash: {
      type: String,
    },
    type: {
      type: String,
      enum: Object.values(NoteType),
      default: NoteType.PERSONAL,
    },
    priority: {
      type: String,
      enum: Object.values(NotePriority),
      default: NotePriority.MEDIUM,
    },
    status: {
      type: String,
      enum: Object.values(NoteStatus),
      default: NoteStatus.ACTIVE,
    },
    tags: {
      type: [String],
      default: [],
      validate: {
        validator: (tags: string[]) => tags.length <= 20,
        message: 'Maximum 20 tags allowed'
      },
    },
    category: {
      type: String,
      maxlength: [50, 'Category cannot exceed 50 characters'],
    },
    isPrivate: {
      type: Boolean,
      default: true,
    },
    visibility: {
      type: String,
      enum: ['private', 'shared', 'team', 'public'],
      default: 'private',
    },
    sharedWith: [{
      type: Schema.Types.ObjectId,
      ref: 'User'
    }],
    collaborators: [{
      userId: {
        type: Schema.Types.ObjectId,
        ref: 'User',
        required: true
      },
      permission: {
        type: String,
        enum: ['view', 'edit', 'admin'],
        default: 'view'
      },
      addedAt: {
        type: Date,
        default: Date.now
      },
      addedBy: {
        type: Schema.Types.ObjectId,
        ref: 'User',
        required: true
      }
    }],
    attachments: [{
      id: {
        type: String,
        default: () => uuidv4()
      },
      filename: String,
      mimeType: String,
      size: Number,
      uploadedAt: {
        type: Date,
        default: Date.now
      },
      url: String
    }],
    mentions: [{
      type: Schema.Types.ObjectId,
      ref: 'User'
    }],
    linkedNotes: [{
      type: Schema.Types.ObjectId,
      ref: 'ConnectionNote'
    }],
    reminders: [{
      id: {
        type: String,
        default: () => uuidv4()
      },
      reminderAt: {
        type: Date,
        required: true,
      },
      isCompleted: {
        type: Boolean,
        default: false
      },
      notificationSent: {
        type: Boolean,
        default: false
      },
      reminderType: {
        type: String,
        enum: ['email', 'push', 'sms'],
        default: 'push'
      }
    }],
    viewCount: {
      type: Number,
      default: 0,
      min: 0
    },
    lastViewedAt: Date,
    likeCount: {
      type: Number,
      default: 0,
      min: 0
    },
    shareCount: {
      type: Number,
      default: 0,
      min: 0
    },
    version: {
      type: Number,
      default: 1,
      min: 1
    },
    previousVersions: [{
      type: Schema.Types.ObjectId,
      ref: 'ConnectionNoteVersion'
    }],
    activities: [{
      action: {
        type: String,
        enum: ['created', 'updated', 'viewed', 'shared', 'archived'],
        required: true
      },
      userId: {
        type: Schema.Types.ObjectId,
        ref: 'User',
        required: true
      },
      timestamp: {
        type: Date,
        default: Date.now
      },
      metadata: Schema.Types.Mixed
    }],
    searchKeywords: [{
      type: String,
      index: 'text'
    }],
    isIndexed: {
      type: Boolean,
      default: false,
    },
    isTemplate: {
      type: Boolean,
      default: false,
    },
    templateCategory: {
      type: String,
      maxlength: [50, 'Template category cannot exceed 50 characters']
    },
    isPinned: {
      type: Boolean,
      default: false,
    },
    expiresAt: {
      type: Date,
      index: { expireAfterSeconds: 0 }
    },
    retentionPolicy: {
      type: String,
      maxlength: [100, 'Retention policy cannot exceed 100 characters']
    },
    lastModifiedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    wordCount: {
      type: Number,
      default: 0,
      min: 0
    },
    readTimeMinutes: {
      type: Number,
      default: 1,
      min: 1
    },
    archivedAt: Date,
    deletedAt: Date
  },
  {
    timestamps: true,
    toJSON: { 
      virtuals: true,
      transform: (_doc, ret) => { 
        delete (ret as any).__v; 
        return ret;
      } 
    },
    toObject: { virtuals: true },
    collection: 'connection_notes'
  }
);

connectionNoteSchema.index({ userId: 1, connectionId: 1 });
connectionNoteSchema.index({ userId: 1, status: 1, createdAt: -1 });
connectionNoteSchema.index({ userId: 1, type: 1, priority: 1 });
connectionNoteSchema.index({ userId: 1, isPrivate: 1, updatedAt: -1 });
connectionNoteSchema.index({ connectionId: 1, status: 1, createdAt: -1 });
connectionNoteSchema.index({ tags: 1, status: 1, userId: 1 });
connectionNoteSchema.index({ contentHash: 1, userId: 1 });
connectionNoteSchema.index({ 'reminders.reminderAt': 1, 'reminders.isCompleted': 1 });
connectionNoteSchema.index({ isTemplate: 1, templateCategory: 1 });
connectionNoteSchema.index({ visibility: 1, status: 1 });

connectionNoteSchema.index({
  title: 'text',
  content: 'text',
  tags: 'text',
  searchKeywords: 'text'
}, {
  weights: {
    title: 10,
    content: 5,
    tags: 8,
    searchKeywords: 3
  },
  name: 'note_text_index'
});

connectionNoteSchema.pre('save', function(next) {
  const note = this as unknown as IConnectionNote;
  
  if (note.isModified('content')) {
    note.contentHash = createHash('sha256')
      .update(note.content.toLowerCase().replace(/\s+/g, ' ').trim())
      .digest('hex');
      
    const wordCount = note.content.split(/\s+/).filter(word => word.length > 0).length;
    note.wordCount = wordCount;
    note.readTimeMinutes = Math.max(1, Math.ceil(wordCount / 200));
    
    const keywords = note.content
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(word => word.length > 2)
      .slice(0, 50);
    note.searchKeywords = [...new Set(keywords)];
  }
  
  if (note.isModified() && !note.isNew) {
    note.lastModifiedBy = note.userId;
  }
  
  if (note.isNew) {
    note.activities.push({
      action: 'created',
      userId: note.userId,
      timestamp: new Date()
    } as INoteActivity);
  } else if (note.isModified('content') || note.isModified('title')) {
    note.activities.push({
      action: 'updated',
      userId: note.lastModifiedBy,
      timestamp: new Date(),
      metadata: {
        fields: note.modifiedPaths()
      }
    } as INoteActivity);
  }
  
  next();
});

interface ConnectionNoteModel extends Model<IConnectionNote> {
  paginate(query?: FilterQuery<IConnectionNote>, options?: any): Promise<IPaginatedNotes>;
  findByConnectionAndUser(connectionId: string, userId: string, options?: QueryOptions): Promise<IConnectionNote[]>;
  createNote(noteData: Partial<IConnectionNote>): Promise<IConnectionNote>;
  updateNote(noteId: string, updateData: UpdateQuery<IConnectionNote>): Promise<IConnectionNote | null>;
  softDelete(noteId: string, userId: string): Promise<boolean>;
  searchNotes(searchOptions: INoteSearchOptions): Promise<IPaginatedNotes>;
  findByTags(tags: string[], userId: string, options?: QueryOptions): Promise<IConnectionNote[]>;
  getNoteStats(userId: string): Promise<any>;
  getPopularTags(userId: string, limit?: number): Promise<Array<{ tag: string; count: number }>>;
  bulkUpdateStatus(noteIds: string[], status: NoteStatus, userId: string): Promise<number>;
  bulkAddTags(noteIds: string[], tags: string[], userId: string): Promise<number>;
  bulkDelete(noteIds: string[], userId: string): Promise<number>;
  shareNote(noteId: string, userIds: string[], permission: string): Promise<boolean>;
  exportUserNotes(userId: string, format: 'json' | 'csv'): Promise<any>;
}

// ✅ FIXED: Handle both ObjectId and UUID formats
connectionNoteSchema.statics.findByConnectionAndUser = async function(
  connectionId: string,
  userId: string,
  options: QueryOptions = {}
): Promise<IConnectionNote[]> {
  return this.find({
    connectionId: convertToObjectId(connectionId),  // ✅ Supports both formats
    userId: new Types.ObjectId(userId),
    status: { $ne: NoteStatus.DELETED }
  }, null, {
    sort: { isPinned: -1, updatedAt: -1 },
    ...options
  });
};

connectionNoteSchema.statics.createNote = async function(
  noteData: Partial<IConnectionNote>
): Promise<IConnectionNote> {
  const note = new this(noteData);
  return note.save();
};

connectionNoteSchema.statics.updateNote = async function(
  noteId: string,
  updateData: UpdateQuery<IConnectionNote>
): Promise<IConnectionNote | null> {
  return this.findOneAndUpdate(
    { noteId, status: { $ne: NoteStatus.DELETED } },
    { ...updateData, updatedAt: new Date() },
    { new: true, runValidators: true }
  );
};

connectionNoteSchema.statics.softDelete = async function(
  noteId: string,
  userId: string
): Promise<boolean> {
  const result = await this.updateOne(
    { noteId, userId: new Types.ObjectId(userId) },
    {
      status: NoteStatus.DELETED,
      deletedAt: new Date()
    }
  );
  return result.modifiedCount > 0;
};

// ✅ FIXED: Handle both ObjectId and UUID formats in search
connectionNoteSchema.statics.searchNotes = async function(
  searchOptions: INoteSearchOptions
): Promise<IPaginatedNotes> {
  const {
    query,
    tags,
    type,
    priority,
    status = NoteStatus.ACTIVE,
    userId,
    connectionId,
    dateFrom,
    dateTo,
    isPrivate,
    hasAttachments,
    hasReminders,
    sortBy = 'updatedAt',
    sortOrder = 'desc',
    page = 1,
    limit = 20
  } = searchOptions;
  
  const filter: FilterQuery<IConnectionNote> = { status };
  
  if (userId) filter.userId = new Types.ObjectId(userId);
  if (connectionId) filter.connectionId = convertToObjectId(connectionId);  // ✅ Supports both formats
  if (type) filter.type = type;
  if (priority) filter.priority = priority;
  if (typeof isPrivate === 'boolean') filter.isPrivate = isPrivate;
  if (tags?.length) filter.tags = { $in: tags };
  if (hasAttachments) filter['attachments.0'] = { $exists: true };
  if (hasReminders) filter['reminders.0'] = { $exists: true };
  
  if (dateFrom || dateTo) {
    filter.createdAt = {};
    if (dateFrom) filter.createdAt.$gte = dateFrom;
    if (dateTo) filter.createdAt.$lte = dateTo;
  }
  
  if (query) {
    filter.$text = { $search: query };
  }
  
  const sortOptions: any = {};
  sortOptions[sortBy] = sortOrder === 'desc' ? -1 : 1;
  
  return (this as any).paginate(filter, {
    page,
    limit: Math.min(limit, 100),
    sort: sortOptions,
    populate: [
      { path: 'userId', select: 'firstName lastName profilePicture' },
      { path: 'connectionId', select: 'fromUserId toUserId status' }
    ]
  });
};

connectionNoteSchema.statics.getNoteStats = async function(userId: string) {
  const result = await this.aggregate([
    {
      $match: {
        userId: new Types.ObjectId(userId),
        status: { $ne: NoteStatus.DELETED }
      }
    },
    {
      $group: {
        _id: null,
        totalNotes: { $sum: 1 },
        privateNotes: { $sum: { $cond: ['$isPrivate', 1, 0] } },
        totalWords: { $sum: '$wordCount' },
        averageWordsPerNote: { $avg: '$wordCount' },
        totalViews: { $sum: '$viewCount' }
      }
    }
  ]);
  
  return result[0] || {};
};

connectionNoteSchema.statics.getPopularTags = async function(
  userId: string,
  limit: number = 20
): Promise<Array<{ tag: string; count: number }>> {
  return this.aggregate([
    {
      $match: {
        userId: new Types.ObjectId(userId),
        status: NoteStatus.ACTIVE,
        tags: { $exists: true, $not: { $size: 0 } }
      }
    },
    { $unwind: '$tags' },
    {
      $group: {
        _id: '$tags',
        count: { $sum: 1 }
      }
    },
    {
      $project: {
        tag: '$_id',
        count: 1,
        _id: 0
      }
    },
    { $sort: { count: -1 } },
    { $limit: limit }
  ]);
};

connectionNoteSchema.statics.bulkUpdateStatus = async function(
  noteIds: string[],
  status: NoteStatus,
  userId: string
): Promise<number> {
  const result = await this.updateMany(
    {
      noteId: { $in: noteIds },
      userId: new Types.ObjectId(userId)
    },
    {
      status,
      updatedAt: new Date(),
      ...(status === NoteStatus.ARCHIVED && { archivedAt: new Date() })
    }
  );
  return result.modifiedCount;
};

connectionNoteSchema.statics.bulkAddTags = async function(
  noteIds: string[],
  tags: string[],
  userId: string
): Promise<number> {
  const result = await this.updateMany(
    {
      noteId: { $in: noteIds },
      userId: new Types.ObjectId(userId)
    },
    {
      $addToSet: { tags: { $each: tags } },
      updatedAt: new Date()
    }
  );
  return result.modifiedCount;
};

connectionNoteSchema.statics.bulkDelete = async function(
  noteIds: string[],
  userId: string
): Promise<number> {
  const result = await this.updateMany(
    {
      noteId: { $in: noteIds },
      userId: new Types.ObjectId(userId)
    },
    {
      status: NoteStatus.DELETED,
      deletedAt: new Date()
    }
  );
  return result.modifiedCount;
};

connectionNoteSchema.statics.shareNote = async function(
  noteId: string,
  userIds: string[],
  _permission: string
): Promise<boolean> {
  const result = await this.updateOne(
    { noteId },
    {
      $addToSet: {
        sharedWith: { $each: userIds.map(id => new Types.ObjectId(id)) }
      }
    }
  );
  return result.modifiedCount > 0;
};

connectionNoteSchema.statics.exportUserNotes = async function(
  userId: string,
  format: 'json' | 'csv'
): Promise<any> {
  const notes = await this.find({
    userId: new Types.ObjectId(userId),
    status: { $ne: NoteStatus.DELETED }
  }).lean();
  
  if (format === 'json') {
    return notes;
  }
  
  interface Note {
    noteId: string;
    title?: string;
    content: string;
    type: string;
    priority: string;
    tags: string[];
    createdAt: Date;
    updatedAt: Date;
  }

  const csvData = notes.map((note: Note) => ({
    noteId: note.noteId,
    title: note.title || '',
    content: note.content,
    type: note.type,
    priority: note.priority,
    tags: note.tags.join(';'),
    createdAt: note.createdAt,
    updatedAt: note.updatedAt
  }));
  
  return csvData;
};

connectionNoteSchema.plugin(mongoosePaginate);
connectionNoteSchema.plugin(mongooseAggregatePaginate);

connectionNoteSchema.post('save', (error: any, _doc: IConnectionNote, next: (err?: any) => void) => {
  if (error.name === 'MongoServerError' && error.code === 11000) {
    next(new Error('Duplicate note detected'));
  } else if (error.name === 'ValidationError') {
    const messages = Object.values(error.errors).map((err: any) => err.message);
    next(new Error(`Validation failed: ${messages.join(', ')}`));
  } else {
    next(error);
  }
});

export const ConnectionNote: ConnectionNoteModel = model<IConnectionNote, ConnectionNoteModel>(
  'ConnectionNote',
  connectionNoteSchema
);