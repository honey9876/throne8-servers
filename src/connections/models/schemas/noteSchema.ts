// src/models/schemas/noteSchema.ts

import Joi from 'joi';
import { NotePriority, NoteStatus, NoteType } from '../ConnectionNote';

// ================================================================================
// COMMON VALIDATORS
// ================================================================================

export const objectIdValidator = Joi.string()
  .pattern(/^[0-9a-fA-F]{24}$/)
  .messages({
    'string.pattern.base': 'Invalid ObjectId format'
  });

export const uuidValidator = Joi.string()
  .guid({ version: ['uuidv4'] })
  .messages({
    'string.guid': 'Invalid UUID format'
  });

export const isoDateValidator = Joi.date()
  .iso()
  .messages({
    'date.format': 'Invalid ISO date format'
  });

// ================================================================================
// NOTE CONTENT SCHEMAS
// ================================================================================

export const noteTitleSchema = Joi.string()
  .max(200)
  .trim()
  .messages({
    'string.max': 'Title cannot exceed 200 characters'
  });

export const noteContentSchema = Joi.string()
  .min(1)
  .max(50000)
  .trim()
  .messages({
    'string.min': 'Content must be at least 1 character',
    'string.max': 'Content cannot exceed 50,000 characters'
  });

export const noteSummarySchema = Joi.string()
  .max(500)
  .trim()
  .messages({
    'string.max': 'Summary cannot exceed 500 characters'
  });

// ================================================================================
// NOTE TYPE SCHEMAS
// ================================================================================

export const noteTypeSchema = Joi.string()
  .valid(...Object.values(NoteType))
  .default(NoteType.PERSONAL)
  .messages({
    'any.only': 'Invalid note type'
  });

export const notePrioritySchema = Joi.string()
  .valid(...Object.values(NotePriority))
  .default(NotePriority.MEDIUM)
  .messages({
    'any.only': 'Invalid priority level'
  });

export const noteStatusSchema = Joi.string()
  .valid(...Object.values(NoteStatus))
  .default(NoteStatus.ACTIVE)
  .messages({
    'any.only': 'Invalid note status'
  });

// ================================================================================
// TAG SCHEMAS
// ================================================================================

export const tagSchema = Joi.string()
  .max(50)
  .trim()
  .pattern(/^[a-zA-Z0-9\-_\s]+$/)
  .messages({
    'string.max': 'Tag cannot exceed 50 characters',
    'string.pattern.base': 'Tag can only contain letters, numbers, hyphens, underscores, and spaces'
  });

export const tagsArraySchema = Joi.array()
  .items(tagSchema)
  .max(20)
  .default([])
  .messages({
    'array.max': 'Maximum 20 tags allowed'
  });

// ================================================================================
// PRIVACY SCHEMAS
// ================================================================================

export const isPrivateSchema = Joi.boolean()
  .default(true)
  .messages({
    'boolean.base': 'isPrivate must be a boolean'
  });

export const visibilitySchema = Joi.string()
  .valid('private', 'shared', 'team', 'public')
  .default('private')
  .messages({
    'any.only': 'Invalid visibility level'
  });

// ================================================================================
// REMINDER SCHEMAS
// ================================================================================

export const reminderSchema = Joi.object({
  id: uuidValidator.optional(),
  reminderAt: isoDateValidator
    .greater('now')
    .required()
    .messages({
      'date.greater': 'Reminder must be set for a future date'
    }),
  reminderType: Joi.string()
    .valid('email', 'push', 'sms')
    .default('push')
    .messages({
      'any.only': 'Invalid reminder type'
    }),
  isCompleted: Joi.boolean().default(false),
  notificationSent: Joi.boolean().default(false)
});

export const remindersArraySchema = Joi.array()
  .items(reminderSchema)
  .max(10)
  .default([])
  .messages({
    'array.max': 'Maximum 10 reminders allowed'
  });

// ================================================================================
// ATTACHMENT SCHEMAS
// ================================================================================

export const attachmentSchema = Joi.object({
  id: uuidValidator.optional(),
  filename: Joi.string()
    .max(255)
    .required()
    .messages({
      'string.max': 'Filename cannot exceed 255 characters'
    }),
  mimeType: Joi.string()
    .pattern(/^[a-zA-Z0-9][a-zA-Z0-9\/\-]*$/)
    .required()
    .messages({
      'string.pattern.base': 'Invalid MIME type format'
    }),
  size: Joi.number()
    .integer()
    .min(1)
    .max(50 * 1024 * 1024) // 50MB
    .required()
    .messages({
      'number.max': 'File size cannot exceed 50MB'
    }),
  uploadedAt: isoDateValidator.optional(),
  url: Joi.string().uri().optional()
});

export const attachmentsArraySchema = Joi.array()
  .items(attachmentSchema)
  .max(5)
  .default([])
  .messages({
    'array.max': 'Maximum 5 attachments allowed'
  });

// ================================================================================
// PAGINATION SCHEMAS
// ================================================================================

export const pageSchema = Joi.number()
  .integer()
  .min(1)
  .default(1)
  .messages({
    'number.min': 'Page must be at least 1'
  });

export const limitSchema = Joi.number()
  .integer()
  .min(1)
  .max(100)
  .default(10)
  .messages({
    'number.min': 'Limit must be at least 1',
    'number.max': 'Limit cannot exceed 100'
  });

export const sortBySchema = Joi.string()
  .valid('createdAt', 'updatedAt', 'title', 'priority', 'wordCount')
  .default('updatedAt')
  .messages({
    'any.only': 'Invalid sort field'
  });

export const sortOrderSchema = Joi.string()
  .valid('asc', 'desc')
  .default('desc')
  .messages({
    'any.only': 'Sort order must be asc or desc'
  });

// ================================================================================
// COMPOSITE SCHEMAS
// ================================================================================

export const noteIdParamSchema = Joi.object({
  noteId: Joi.string().required().messages({
    'any.required': 'Note ID is required',
    'string.empty': 'Note ID cannot be empty'
  })
});

// ✅ FIXED: Accept both ObjectId and UUID formats
export const connectionIdParamSchema = Joi.object({
  connectionId: Joi.alternatives()
    .try(
      objectIdValidator,
      uuidValidator
    )
    .required()
    .messages({
      'any.required': 'Connection ID is required',
      'alternatives.match': 'Connection ID must be either a valid ObjectId or UUID'
    })
});

export const paginationQuerySchema = Joi.object({
  page: pageSchema,
  limit: limitSchema
});

export const searchQuerySchema = Joi.object({
  query: Joi.string().max(500).trim().optional(),
  tags: tagsArraySchema.max(10).optional(),
  type: noteTypeSchema.optional(),
  priority: notePrioritySchema.optional(),
  status: noteStatusSchema,
  connectionId: Joi.alternatives()
    .try(
      objectIdValidator,
      uuidValidator
    )
    .optional(),
  dateFrom: isoDateValidator.optional(),
  dateTo: isoDateValidator
    .min(Joi.ref('dateFrom'))
    .optional()
    .messages({
      'date.min': 'dateTo must be after dateFrom'
    }),
  isPrivate: Joi.boolean().optional(),
  hasAttachments: Joi.boolean().optional(),
  hasReminders: Joi.boolean().optional(),
  sortBy: sortBySchema,
  sortOrder: sortOrderSchema,
  page: pageSchema,
  limit: limitSchema
});

// ================================================================================
// MAIN OPERATION SCHEMAS
// ================================================================================

/**
 * Create note validation schema
 */
export const createNoteSchema = Joi.object({
  connectionId: Joi.alternatives()
    .try(
      objectIdValidator,
      uuidValidator
    )
    .required()
    .messages({
      'any.required': 'Connection ID is required',
      'alternatives.match': 'Connection ID must be either a valid ObjectId or UUID'
    }),
  title: noteTitleSchema.optional(),
  content: noteContentSchema.required().messages({
    'any.required': 'Content is required'
  }),
  summary: noteSummarySchema.optional(),
  type: noteTypeSchema,
  priority: notePrioritySchema,
  tags: tagsArraySchema,
  category: Joi.string().max(50).trim().optional(),
  isPrivate: isPrivateSchema,
  visibility: visibilitySchema,
  reminders: remindersArraySchema,
  attachments: attachmentsArraySchema
});

/**
 * Update note validation schema
 */
export const updateNoteSchema = Joi.object({
  title: noteTitleSchema.optional(),
  content: noteContentSchema.optional(),
  summary: noteSummarySchema.optional(),
  type: noteTypeSchema.optional(),
  priority: notePrioritySchema.optional(),
  tags: tagsArraySchema.optional(),
  category: Joi.string().max(50).trim().optional(),
  isPrivate: isPrivateSchema.optional(),
  visibility: visibilitySchema.optional(),
  reminders: remindersArraySchema.optional(),
  attachments: attachmentsArraySchema.optional(),
  isPinned: Joi.boolean().optional(),
  status: noteStatusSchema.optional()
}).min(1).messages({
  'object.min': 'At least one field must be provided for update'
});

/**
 * Tag management schema
 */
export const tagManagementSchema = Joi.object({
  tags: tagsArraySchema.min(1).required().messages({
    'array.min': 'At least one tag is required',
    'any.required': 'Tags array is required'
  }),
  action: Joi.string()
    .valid('add', 'remove', 'replace')
    .required()
    .messages({
      'any.only': 'Action must be add, remove, or replace',
      'any.required': 'Action is required'
    })
});

/**
 * Share note schema
 */
export const shareNoteSchema = Joi.object({
  userIds: Joi.array()
    .items(objectIdValidator)
    .min(1)
    .max(50)
    .required()
    .messages({
      'array.min': 'At least one user ID is required',
      'array.max': 'Cannot share with more than 50 users at once',
      'any.required': 'User IDs array is required'
    }),
  permission: Joi.string()
    .valid('view', 'edit', 'admin')
    .default('view')
    .messages({
      'any.only': 'Permission must be view, edit, or admin'
    })
});

/**
 * Privacy update schema
 */
export const privacyUpdateSchema = Joi.object({
  isPrivate: isPrivateSchema.required().messages({
    'any.required': 'isPrivate flag is required'
  }),
  visibility: visibilitySchema
});

/**
 * Bulk operations schema
 */
export const bulkOperationSchema = Joi.object({
  noteIds: Joi.array()
    .items(Joi.string())
    .min(1)
    .max(100)
    .required()
    .messages({
      'array.min': 'At least one note ID is required',
      'array.max': 'Cannot perform bulk operation on more than 100 notes',
      'any.required': 'Note IDs array is required'
    }),
  operation: Joi.string()
    .valid('archive', 'delete', 'tag')
    .required()
    .messages({
      'any.only': 'Operation must be archive, delete, or tag',
      'any.required': 'Operation is required'
    }),
  data: Joi.object({
    tags: tagsArraySchema.optional(),
    status: noteStatusSchema.optional()
  }).optional()
});

/**
 * Export notes schema
 */
export const exportNotesSchema = Joi.object({
  format: Joi.string()
    .valid('json', 'csv')
    .default('json')
    .messages({
      'any.only': 'Format must be json or csv'
    })
});

// ================================================================================
// EXPORT ALL SCHEMAS
// ================================================================================

export const noteSchemas = {
  // Common validators
  objectIdValidator,
  uuidValidator,
  isoDateValidator,
  
  // Content schemas
  noteTitleSchema,
  noteContentSchema,
  noteSummarySchema,
  
  // Type schemas
  noteTypeSchema,
  notePrioritySchema,
  noteStatusSchema,
  
  // Feature schemas
  tagSchema,
  tagsArraySchema,
  isPrivateSchema,
  visibilitySchema,
  reminderSchema,
  remindersArraySchema,
  attachmentSchema,
  attachmentsArraySchema,
  
  // Pagination
  pageSchema,
  limitSchema,
  sortBySchema,
  sortOrderSchema,
  
  // Composite
  noteIdParamSchema,
  connectionIdParamSchema,
  paginationQuerySchema,
  searchQuerySchema,
  
  // Operations
  createNoteSchema,
  updateNoteSchema,
  tagManagementSchema,
  shareNoteSchema,
  privacyUpdateSchema,
  bulkOperationSchema,
  exportNotesSchema
};

export default noteSchemas;