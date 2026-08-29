// src/models/schemas/requestSchema.ts

import { Schema } from 'mongoose';

/**
 * Connection Request Schema
 * Defines the Mongoose schema for ConnectionRequest documents in MongoDB.
 * Supports all 18 features from requestController and requestRoutes.
 * 
 * Fields:
 * - requestId: Unique identifier (primary key)
 * - fromUserId: Sender/initiator user ID (indexed)
 * - toUserId: Receiver/target user ID (indexed)
 * - status: Request status (enum: pending, accepted, declined)
 * - message: Optional custom message from sender
 * - visibility: Privacy level (enum)
 * - priority: Priority level (number)
 * - tags: Array of tags (strings)
 * - expiresAt: Expiration date for the request
 * - reminders: Array of reminder events
 * - activity: Array of activity logs
 * - metadata: Additional metadata (e.g., source of request)
 * - createdAt, updatedAt: Timestamps
 * 
 * Indexes: Compound indexes for queries like incoming/outgoing requests, status, etc.
 * Validation: Required fields, enums, expiration logic, etc.
 * 
 * Dependencies:
 * - mongoose: For Schema
 * - Aligns with ConnectionRequest.ts model interface
 * - Used in requestRoutes.ts for validation (e.g., sendRequest, acceptRequest)
 * - Supports bulk operations, notifications, workflows
 */

export const requestSchema = new Schema({
  requestId: {
    type: String,
    required: true,
    unique: true,
    primaryKey: true // Though Mongoose doesn't enforce primaryKey strictly, used for uniqueness
  },
  fromUserId: {
    type: String,
    required: true,
     // Indexed for queries by fromUserId (outgoing requests)
  },
  toUserId: {
    type: String,
    required: true,
     // Indexed for queries by toUserId (incoming requests)
  },
  status: {
    type: String,
    enum: ['pending', 'accepted', 'declined'], // As per Feature 15
    required: true,
    default: 'pending',
     // Indexed for status-based queries
  },
  message: {
    type: String,
    maxlength: 500,
    trim: true // Optional custom message
  },
  visibility: {
    type: String,
    enum: ['public', 'private', 'connections'],
    default: 'public'
  },
  priority: {
    type: Number,
    min: 1,
    max: 5,
    default: 3 // For priority-based sorting in incoming requests
  },
  tags: [{
    type: String,
    trim: true // For categorizing requests
  }],
  expiresAt: {
    type: Date,
    index: { expires: '30d' }, // TTL index for auto-expiration after 30 days (configurable)
    default: () => new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // Default 30 days
  },
  reminders: [{
    sentAt: { type: Date, default: Date.now },
    type: { type: String, enum: ['email', 'in-app', 'push'] },
    details: Schema.Types.Mixed
  }],
  activity: [{
    action: String, // e.g., 'sent', 'viewed', 'reminded'
    timestamp: { type: Date, default: Date.now },
    metadata: Schema.Types.Mixed // For tracking request activity
  }],
  metadata: {
    type: Schema.Types.Mixed, // e.g., { source: 'search', campaignId: 'abc' }
    default: {}
  }
}, {
  timestamps: true, // Auto-adds createdAt and updatedAt
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Compound indexes for performance (e.g., for getIncomingRequests, getOutgoingRequests)
requestSchema.index({ fromUserId: 1, status: 1 });
requestSchema.index({ toUserId: 1, status: 1 });
requestSchema.index({ tags: 1 });
requestSchema.index({ createdAt: -1 }); // For recent requests
requestSchema.index({ expiresAt: 1 }); // For expiration queries

// Pre-save middleware to validate expiration
requestSchema.pre('save', function(next) {
  if (this.expiresAt && this.expiresAt < new Date()) {
    return next(new Error('Request has expired'));
  }
  next();
});

// Validation schemas for routes (exported for use in validation.middleware, using Joi-like structure for consistency)
export const sendConnectionRequestValidation = {
  body: {
    type: 'object',
    required: true,
    properties: {
      fromUserId: { type: 'string', required: true },
      toUserId: { type: 'string', required: true },
      requestId: { type: 'string', required: true }, // Generated or provided
      message: { type: 'string', maxLength: 500 },
      tags: { type: 'array', items: { type: 'string' } }
    },
    additionalProperties: false
  }
};

export const acceptConnectionRequestValidation = {
  body: {
    type: 'object',
    required: false, // Optional body for accept
    properties: {
      message: { type: 'string', maxLength: 500 } // Optional response message
    }
  }
};

export const declineConnectionRequestValidation = {
  body: {
    type: 'object',
    required: false,
    properties: {
      reason: { type: 'string', maxLength: 200 }, // Optional decline reason
      message: { type: 'string', maxLength: 500 }
    }
  }
};

export const bulkProcessRequestsValidation = {
  body: {
    type: 'object',
    required: true,
    properties: {
      requestIds: { type: 'array', items: { type: 'string' }, required: true, minItems: 1, maxItems: 50 },
      action: { type: 'string', enum: ['accept', 'decline'], required: true }
    }
  }
};

// Export the main schema and validation objects for use in routes and services
export default requestSchema;