// src/models/mongodb/SavedSearch.ts

import { Schema, model, Document, Model, Types } from 'mongoose';
import { v4 as uuidv4 } from 'uuid';
import { NotificationFrequency, SearchFilters } from '../types/search.types';

/**
 * SAVED SEARCH MODEL
 * ==================
 * Manages user's saved search queries with notification preferences
 * Optimized for quick retrieval and execution
 */

export interface ISavedSearch extends Document {
  savedSearchId: string;
  userId: Types.ObjectId;
  name: string;
  description?: string;
  searchQuery: string;
  filters?: SearchFilters;
  notifications: boolean;
  frequency: NotificationFrequency;
  isActive: boolean;
  lastExecuted?: Date;
  resultsCount?: number;
  createdAt: Date;
  updatedAt: Date;
}

interface ISavedSearchModel extends Model<ISavedSearch> {
  findBySavedSearchId(savedSearchId: string): Promise<ISavedSearch | null>;
  findUserSavedSearches(userId: string, isActive?: boolean): Promise<ISavedSearch[]>;
  executeSavedSearch(savedSearchId: string): Promise<ISavedSearch | null>;
  cleanupInactive(daysInactive?: number): Promise<number>;
}

const SavedSearchSchema: Schema<ISavedSearch, ISavedSearchModel> = new Schema<ISavedSearch, ISavedSearchModel>(
  {
    savedSearchId: {
      type: String,
      required: true,
      unique: true,
      default: () => uuidv4(),
    },
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'User ID is required'],
    },
    name: {
      type: String,
      required: [true, 'Search name is required'],
      trim: true,
      minlength: [1, 'Name must be at least 1 character'],
      maxlength: [100, 'Name cannot exceed 100 characters'],
    },
    description: {
      type: String,
      trim: true,
      maxlength: [500, 'Description cannot exceed 500 characters'],
    },
    searchQuery: {
      type: String,
      required: [true, 'Search query is required'],
      trim: true,
      minlength: [1, 'Query must be at least 1 character'],
      maxlength: [200, 'Query cannot exceed 200 characters'],
    },
    filters: {
      type: Schema.Types.Mixed,
      default: {},
    },
    notifications: {
      type: Boolean,
      default: false,
    },
    frequency: {
      type: String,
      enum: {
        values: Object.values(NotificationFrequency),
        message: '{VALUE} is not a valid notification frequency',
      },
      default: NotificationFrequency.NEVER,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    lastExecuted: {
      type: Date,
    },
    resultsCount: {
      type: Number,
      default: 0,
      min: [0, 'Results count cannot be negative'],
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// ============================================================================
// INDEXES
// ============================================================================

SavedSearchSchema.index({ userId: 1, isActive: 1, createdAt: -1 });
SavedSearchSchema.index({ userId: 1, notifications: 1, frequency: 1 });
SavedSearchSchema.index({ lastExecuted: 1, isActive: 1 });

// ============================================================================
// STATIC METHODS
// ============================================================================

SavedSearchSchema.statics.findBySavedSearchId = async function (
  savedSearchId: string
): Promise<ISavedSearch | null> {
  return this.findOne({ savedSearchId }).lean().exec();
};

SavedSearchSchema.statics.findUserSavedSearches = async function (
  userId: string,
  isActive?: boolean
): Promise<ISavedSearch[]> {
  const filter: any = { userId };
  if (isActive !== undefined) {
    filter.isActive = isActive;
  }
  return this.find(filter).sort({ createdAt: -1 }).lean().exec();
};

SavedSearchSchema.statics.executeSavedSearch = async function (
  savedSearchId: string
): Promise<ISavedSearch | null> {
  return this.findOneAndUpdate(
    { savedSearchId, isActive: true },
    { $set: { lastExecuted: new Date() } },
    { new: true }
  ).exec();
};

SavedSearchSchema.statics.cleanupInactive = async function (
  daysInactive: number = 180
): Promise<number> {
  const cutoffDate = new Date(Date.now() - daysInactive * 24 * 60 * 60 * 1000);
  const result = await this.updateMany(
    {
      lastExecuted: { $lt: cutoffDate },
      isActive: true,
    },
    { $set: { isActive: false } }
  );
  return result.modifiedCount;
};

// ============================================================================
// EXPORT
// ============================================================================

const SavedSearchModel = model<ISavedSearch, ISavedSearchModel>(
  'SavedSearch',
  SavedSearchSchema
);

export default SavedSearchModel;