// src/validators/noteValidator.ts

import Joi from 'joi';
import {
  createNoteSchema,
  updateNoteSchema,
  noteIdParamSchema,
  connectionIdParamSchema,
  paginationQuerySchema,
  searchQuerySchema,
  tagManagementSchema,
  shareNoteSchema,
  privacyUpdateSchema,
  bulkOperationSchema,
  exportNotesSchema,
  remindersArraySchema
} from '../models/schemas/noteSchema';

/**
 * ================================================================================
 * NOTE VALIDATION SCHEMAS
 * ================================================================================
 * Centralized validation schemas for all note-related operations.
 * Each endpoint has its own validation for params, body, and query.
 */

// Define the setReminders body schema separately
const setRemindersBodySchema = Joi.object({
  reminders: remindersArraySchema.required().messages({
    'any.required': 'Reminders array is required'
  })
});

export const noteValidationSchemas = {
  // CREATE NOTE - POST /api/v1/notes
  createNote: {
    body: createNoteSchema
  },

  // UPDATE NOTE - PUT /api/v1/notes/:noteId
  updateNote: {
    params: noteIdParamSchema,
    body: updateNoteSchema
  },

  // DELETE NOTE - DELETE /api/v1/notes/:noteId
  deleteNote: {
    params: noteIdParamSchema
  },

  // GET CONNECTION NOTES - GET /api/v1/notes/connection/:connectionId
  getConnectionNotes: {
    params: connectionIdParamSchema,
    query: paginationQuerySchema
  },

  // SEARCH NOTES - POST /api/v1/notes/search
  searchNotes: {
    body: searchQuerySchema
  },

  // TAG NOTES - POST /api/v1/notes/:noteId/tags
  tagNotes: {
    params: noteIdParamSchema,
    body: tagManagementSchema
  },

  // SHARE NOTES - POST /api/v1/notes/:noteId/share
  shareNotes: {
    params: noteIdParamSchema,
    body: shareNoteSchema
  },

  // SET PRIVACY - PUT /api/v1/notes/:noteId/privacy
  setPrivacy: {
    params: noteIdParamSchema,
    body: privacyUpdateSchema
  },

  // EXPORT NOTES - GET /api/v1/notes/export
  exportNotes: {
    query: exportNotesSchema
  },

  // GET NOTE HISTORY - GET /api/v1/notes/:noteId/history
  getNoteHistory: {
    params: noteIdParamSchema
  },

  // SET REMINDERS - POST /api/v1/notes/:noteId/reminders
  setReminders: {
    params: noteIdParamSchema,
    body: setRemindersBodySchema
  },

  // BULK OPERATIONS - POST /api/v1/notes/bulk
  bulkOperations: {
    body: bulkOperationSchema
  }
};

export default noteValidationSchemas;