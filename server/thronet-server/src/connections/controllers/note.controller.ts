// src/controllers/noteController.ts

import { Request, Response, NextFunction } from 'express';
import { Types } from 'mongoose';
import noteService from '../services/note.service';
import { ConnectionNote, INoteSearchOptions, NotePriority, NoteType, NoteStatus } from '@/connections/models/ConnectionNote';
import { sendResponse, HttpStatus, ErrorResponse } from '@/shared/response.util';
import constants from '@/shared/constants.util';import logger, { LogCategory } from '@/shared/logger.util';

import environmentConfig from '@/config/environment/environment';
const { ERROR_CODES } = constants;
const DEFAULT_VALUES = constants.CONNECTION_SERVICE_CONSTANTS.DEFAULT_VALUES;
// import { validateObjectId } from '../utils/validation';

// ✅ HELPER: Validate both ObjectId and UUID formats
const isValidConnectionId = (id: string): boolean => {
  // Check MongoDB ObjectId format (24 hex characters)
  const isObjectId = /^[0-9a-fA-F]{24}$/.test(id);
  
  // Check UUID format (with hyphens)
  const isUUID = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/i.test(id);
  
  return isObjectId || isUUID;
};

// ✅ HELPER: Convert connectionId to ObjectId if needed
const getObjectIdFromConnectionId = (connectionId: string): Types.ObjectId => {
  // If it's already a valid ObjectId, use it
  if (/^[0-9a-fA-F]{24}$/.test(connectionId)) {
    return new Types.ObjectId(connectionId);
  }
  
  // If it's a UUID, use it as string (or convert based on your DB schema)
  // For now, treating UUID as-is since validation passed
  return connectionId as any;
};

export class NoteController {
  /**
   * Create a new connection note
   * POST /api/v1/notes
   */
  public async createConnectionNote(req: Request, res: Response, next: NextFunction): Promise<void> {
    const startTime = Date.now();
    
    try {
      const {
        connectionId,
        title,
        content,
        type = NoteType.PERSONAL,
        priority = NotePriority.MEDIUM,
        tags = [],
        isPrivate = true,
        category,
        reminders = [],
        attachments = []
      } = req.body;

      const userId = (req as any).user?.id;
      if (!userId) {
        throw new ErrorResponse('User not authenticated', HttpStatus.UNAUTHORIZED, ERROR_CODES.AUTH_FAILED);
      }

      if (!connectionId || !content) {
        throw new ErrorResponse(
          'Connection ID and content are required',
          HttpStatus.BAD_REQUEST,
          ERROR_CODES.VALIDATION_FAILED
        );
      }

      // ✅ FIXED: Accept both ObjectId and UUID
      if (!isValidConnectionId(connectionId)) {
        throw new ErrorResponse(
          'Invalid connection ID format',
          HttpStatus.BAD_REQUEST,
          ERROR_CODES.VALIDATION_FAILED
        );
      }

      const noteData = {
        connectionId: getObjectIdFromConnectionId(connectionId),
        userId: new Types.ObjectId(userId),
        title,
        content,
        type,
        priority,
        tags: Array.isArray(tags) ? tags : [],
        isPrivate,
        category,
        reminders,
        attachments,
        lastModifiedBy: new Types.ObjectId(userId)
      };

      const note = await noteService.createNote(noteData);

      logger.auditLog('connection_note_created', userId, {
        noteId: note.noteId,
        connectionId,
        category: LogCategory.CONNECTION
      });

      sendResponse(
        res,
        HttpStatus.CREATED,
        note,
        'Connection note created successfully',
        {
          processingTime: Date.now() - startTime,
          noteId: note.noteId
        }
      );

    } catch (error : any) {
      logger.error('Failed to create connection note', {
        error: error instanceof Error ? error.message : String(error),
        userId: (req as any).user?.id,
        connectionId: req.body?.connectionId,
        category: LogCategory.CONNECTION
      });
      next(error);
    }
  }

  /**
   * Update an existing connection note
   * PUT /api/v1/notes/:noteId
   */
  public async updateConnectionNote(req: Request, res: Response, next: NextFunction): Promise<void> {
    const startTime = Date.now();
    
    try {
      const { noteId } = req.params;
      const userId = (req as any).user?.id;
      const updateData = req.body;

      if (!userId) {
        throw new ErrorResponse('User not authenticated', HttpStatus.UNAUTHORIZED, ERROR_CODES.AUTH_FAILED);
      }

      if (!noteId) {
        throw new ErrorResponse('Note ID is required', HttpStatus.BAD_REQUEST, ERROR_CODES.VALIDATION_FAILED);
      }

      const updatedNote = await noteService.updateNote(noteId, userId, updateData);

      if (!updatedNote) {
        throw new ErrorResponse('Note not', HttpStatus.NOT_FOUND, ERROR_CODES.NOT_FOUND);
      }

      logger.auditLog('connection_note_updated', userId, {
        noteId,
        fieldsUpdated: Object.keys(updateData),
        category: LogCategory.CONNECTION
      });

      sendResponse(
        res,
        HttpStatus.OK,
        updatedNote,
        'Connection note updated successfully',
        {
          processingTime: Date.now() - startTime,
          noteId
        }
      );

    } catch (error : any) {
      logger.error('Failed to update connection note', {
        error: error instanceof Error ? error.message : String(error),
        noteId: req.params?.noteId,
        userId: (req as any).user?.id,
        category: LogCategory.CONNECTION
      });
      next(error);
    }
  }

  /**
   * Delete a connection note (soft delete)
   * DELETE /api/v1/notes/:noteId
   */
  public async deleteConnectionNote(req: Request, res: Response, next: NextFunction): Promise<void> {
    const startTime = Date.now();
    
    try {
      const { noteId } = req.params;
      const userId = (req as any).user?.id;

      if (!userId) {
        throw new ErrorResponse('User not authenticated', HttpStatus.UNAUTHORIZED, ERROR_CODES.AUTH_FAILED);
      }

      const deleted = await noteService.deleteNote(noteId, userId);
      
      if (!deleted) {
        throw new ErrorResponse('Note not found', HttpStatus.NOT_FOUND, ERROR_CODES.NOT_FOUND);
      }

      logger.auditLog('connection_note_deleted', userId, {
        noteId,
        category: LogCategory.CONNECTION
      });

      sendResponse(
        res,
        HttpStatus.OK,
        null,
        'Connection note deleted successfully',
        {
          processingTime: Date.now() - startTime,
          noteId
        }
      );

    } catch (error : any) {
      logger.error('Failed to delete connection note', {
        error: error instanceof Error ? error.message : String(error),
        noteId: req.params?.noteId,
        userId: (req as any).user?.id,
        category: LogCategory.CONNECTION
      });
      next(error);
    }
  }

  /**
   * Get connection notes for a specific connection
   * GET /api/v1/notes/connection/:connectionId
   */
  public async getConnectionNotes(req: Request, res: Response, next: NextFunction): Promise<void> {
    const startTime = Date.now();
    
    try {
      const { connectionId } = req.params;
      const userId = (req as any).user?.id;
      const { page = 1, limit = DEFAULT_VALUES.PAGINATION_LIMIT } = req.query;

      if (!userId) {
        throw new ErrorResponse('User not authenticated', HttpStatus.UNAUTHORIZED, ERROR_CODES.AUTH_FAILED);
      }

      // ✅ FIXED: Accept both ObjectId and UUID
      if (!isValidConnectionId(connectionId)) {
        throw new ErrorResponse(
          'Invalid connection ID format',
          HttpStatus.BAD_REQUEST,
          ERROR_CODES.VALIDATION_FAILED
        );
      }

      const options = {
        page: Number(page),
        limit: Math.min(Number(limit), DEFAULT_VALUES.MAX_PAGINATION_LIMIT)
      };

      const notes = await noteService.getConnectionNotes(connectionId, userId, options);

      sendResponse(
        res,
        HttpStatus.OK,
        notes,
        'Connection notes retrieved successfully',
        {
          processingTime: Date.now() - startTime,
          count: notes.length,
          page: Number(page),
          limit: Number(limit)
        }
      );

    } catch (error : any) {
      logger.error('Failed to get connection notes', {
        error: error instanceof Error ? error.message : String(error),
        connectionId: req.params?.connectionId,
        userId: (req as any).user?.id,
        category: LogCategory.CONNECTION
      });
      next(error);
    }
  }

  /**
   * Search notes with advanced filtering
   * POST /api/v1/notes/search
   */
  public async searchNotes(req: Request, res: Response, next: NextFunction): Promise<void> {
    const startTime = Date.now();
    
    try {
      const userId = (req as any).user?.id;
      if (!userId) {
        throw new ErrorResponse('User not authenticated', HttpStatus.UNAUTHORIZED, ERROR_CODES.AUTH_FAILED);
      }

      const searchOptions: INoteSearchOptions = {
        ...req.body,
        userId,
        page: Number(req.body.page) || 1,
        limit: Math.min(Number(req.body.limit) || DEFAULT_VALUES.PAGINATION_LIMIT, DEFAULT_VALUES.MAX_PAGINATION_LIMIT)
      };

      const results = await noteService.searchNotes(searchOptions);

      sendResponse(
        res,
        HttpStatus.OK,
        results,
        'Notes search completed successfully',
        {
          processingTime: Date.now() - startTime,
          totalResults: results.totalDocs,
          query: req.body.query
        }
      );

    } catch (error : any) {
      logger.error('Failed to search notes', {
        error: error instanceof Error ? error.message : String(error),
        searchQuery: req.body?.query,
        userId: (req as any).user?.id,
        category: LogCategory.CONNECTION
      });
      next(error);
    }
  }

  /**
   * Tag management for notes
   * POST /api/v1/notes/:noteId/tags
   */
  public async tagNotes(req: Request, res: Response, next: NextFunction): Promise<void> {
    const startTime = Date.now();
    
    try {
      const { noteId } = req.params;
      const { tags = [], action = 'add' } = req.body;
      const userId = (req as any).user?.id;

      if (!userId) {
        throw new ErrorResponse('User not authenticated', HttpStatus.UNAUTHORIZED, ERROR_CODES.AUTH_FAILED);
      }

      if (!Array.isArray(tags) || tags.length === 0) {
        throw new ErrorResponse('Tags array is required', HttpStatus.BAD_REQUEST, ERROR_CODES.VALIDATION_FAILED);
      }

      let updateOperation: any = {};
      
      switch (action) {
        case 'add':
          updateOperation = { $addToSet: { tags: { $each: tags } } };
          break;
        case 'remove':
          updateOperation = { $pullAll: { tags } };
          break;
        case 'replace':
          updateOperation = { $set: { tags } };
          break;
        default:
          throw new ErrorResponse('Invalid action', HttpStatus.BAD_REQUEST, ERROR_CODES.VALIDATION_FAILED);
      }

      const updatedNote = await noteService.updateNote(noteId, userId, updateOperation);
      
      if (!updatedNote) {
        throw new ErrorResponse('Note not found', HttpStatus.NOT_FOUND, ERROR_CODES.NOT_FOUND);
      }

      logger.auditLog('connection_note_tags_updated', userId, {
        noteId,
        action,
        tags,
        category: LogCategory.CONNECTION
      });

      sendResponse(
        res,
        HttpStatus.OK,
        updatedNote,
        `Note tags ${action}ed successfully`,
        {
          processingTime: Date.now() - startTime,
          noteId,
          action
        }
      );

    } catch (error : any) {
      logger.error('Failed to update note tags', {
        error: error instanceof Error ? error.message : String(error),
        noteId: req.params?.noteId,
        action: req.body?.action,
        userId: (req as any).user?.id,
        category: LogCategory.CONNECTION
      });
      next(error);
    }
  }

  /**
   * Share notes with other users
   * POST /api/v1/notes/:noteId/share
   */
  public async shareNotes(req: Request, res: Response, next: NextFunction): Promise<void> {
    const startTime = Date.now();
    
    try {
      const { noteId } = req.params;
      const { userIds, permission = 'view' } = req.body;
      const userId = (req as any).user?.id;

      if (!userId) {
        throw new ErrorResponse('User not authenticated', HttpStatus.UNAUTHORIZED, ERROR_CODES.AUTH_FAILED);
      }

      if (!Array.isArray(userIds) || userIds.length === 0) {
        throw new ErrorResponse('User IDs array is required', HttpStatus.BAD_REQUEST, ERROR_CODES.VALIDATION_FAILED);
      }

      const shareResult = await ConnectionNote.shareNote(noteId, userIds, permission);
      
      if (!shareResult) {
        throw new ErrorResponse('Failed to share note', HttpStatus.NOT_FOUND, ERROR_CODES.NOT_FOUND);
      }

      logger.auditLog('connection_note_shared', userId, {
        noteId,
        sharedWith: userIds,
        permission,
        category: LogCategory.CONNECTION
      });

      sendResponse(
        res,
        HttpStatus.OK,
        { shared: true, userIds, permission },
        'Note shared successfully',
        {
          processingTime: Date.now() - startTime,
          noteId,
          shareCount: userIds.length
        }
      );

    } catch (error : any) {
      logger.error('Failed to share note', {
        error: error instanceof Error ? error.message : String(error),
        noteId: req.params?.noteId,
        userId: (req as any).user?.id,
        category: LogCategory.CONNECTION
      });
      next(error);
    }
  }

  /**
   * Set note privacy settings
   * PUT /api/v1/notes/:noteId/privacy
   */
  public async setNotePrivacy(req: Request, res: Response, next: NextFunction): Promise<void> {
    const startTime = Date.now();
    
    try {
      const { noteId } = req.params;
      const { isPrivate, visibility = 'private' } = req.body;
      const userId = (req as any).user?.id;

      if (!userId) {
        throw new ErrorResponse('User not authenticated', HttpStatus.UNAUTHORIZED, ERROR_CODES.AUTH_FAILED);
      }

      const updateData = {
        isPrivate: Boolean(isPrivate),
        visibility
      };

      const updatedNote = await noteService.updateNote(noteId, userId, updateData);
      
      if (!updatedNote) {
        throw new ErrorResponse('Note not found', HttpStatus.NOT_FOUND, ERROR_CODES.NOT_FOUND);
      }

      logger.auditLog('connection_note_privacy_updated', userId, {
        noteId,
        isPrivate,
        visibility,
        category: LogCategory.CONNECTION
      });

      sendResponse(
        res,
        HttpStatus.OK,
        { privacy: { isPrivate, visibility } },
        'Note privacy updated successfully',
        {
          processingTime: Date.now() - startTime,
          noteId
        }
      );

    } catch (error : any) {
      logger.error('Failed to update note privacy', {
        error: error instanceof Error ? error.message : String(error),
        noteId: req.params?.noteId,
        userId: (req as any).user?.id,
        category: LogCategory.CONNECTION
      });
      next(error);
    }
  }

  /**
   * Export user notes in various formats
   * GET /api/v1/notes/export
   */
  public async exportNotes(req: Request, res: Response, next: NextFunction): Promise<void> {
    const startTime = Date.now();
    
    try {
      const userId = (req as any).user?.id;
      const { format = 'json' } = req.query;

      if (!userId) {
        throw new ErrorResponse('User not authenticated', HttpStatus.UNAUTHORIZED, ERROR_CODES.AUTH_FAILED);
      }

      if (!['json', 'csv'].includes(format as string)) {
        throw new ErrorResponse('Invalid export format', HttpStatus.BAD_REQUEST, ERROR_CODES.VALIDATION_FAILED);
      }

      const exportData = await ConnectionNote.exportUserNotes(userId, format as 'json' | 'csv');

      const timestamp = new Date().toISOString().split('T')[0];
      const filename = `connection-notes-${timestamp}.${format}`;
      
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.setHeader('Content-Type', format === 'json' ? 'application/json' : 'text/csv');

      logger.auditLog('connection_notes_exported', userId, {
        format,
        exportSize: JSON.stringify(exportData).length,
        category: LogCategory.CONNECTION
      });

      sendResponse(
        res,
        HttpStatus.OK,
        exportData,
        'Notes exported successfully',
        {
          processingTime: Date.now() - startTime,
          format,
          filename
        }
      );

    } catch (error : any) {
      logger.error('Failed to export notes', {
        error: error instanceof Error ? error.message : String(error),
        userId: (req as any).user?.id,
        format: req.query?.format,
        category: LogCategory.CONNECTION
      });
      next(error);
    }
  }

  /**
   * Get note history and versions
   * GET /api/v1/notes/:noteId/history
   */
  public async getNoteHistory(req: Request, res: Response, next: NextFunction): Promise<void> {
    const startTime = Date.now();
    
    try {
      const { noteId } = req.params;
      const userId = (req as any).user?.id;

      if (!userId) {
        throw new ErrorResponse('User not authenticated', HttpStatus.UNAUTHORIZED, ERROR_CODES.AUTH_FAILED);
      }

      const note = await ConnectionNote.findOne({ noteId, userId }).select('activities previousVersions version');
      
      if (!note) {
        throw new ErrorResponse('Note not found', HttpStatus.NOT_FOUND, ERROR_CODES.NOT_FOUND);
      }

      sendResponse(
        res,
        HttpStatus.OK,
        {
          currentVersion: note.version,
          activities: note.activities,
          previousVersions: note.previousVersions
        },
        'Note history retrieved successfully',
        {
          processingTime: Date.now() - startTime,
          noteId,
          activitiesCount: note.activities?.length || 0
        }
      );

    } catch (error : any) {
      logger.error('Failed to get note history', {
        error: error instanceof Error ? error.message : String(error),
        noteId: req.params?.noteId,
        userId: (req as any).user?.id,
        category: LogCategory.CONNECTION
      });
      next(error);
    }
  }

  /**
   * Set reminders for notes
   * POST /api/v1/notes/:noteId/reminders
   */
  public async setNoteReminders(req: Request, res: Response, next: NextFunction): Promise<void> {
    const startTime = Date.now();
    
    try {
      const { noteId } = req.params;
      const { reminders } = req.body;
      const userId = (req as any).user?.id;

      if (!userId) {
        throw new ErrorResponse('User not authenticated', HttpStatus.UNAUTHORIZED, ERROR_CODES.AUTH_FAILED);
      }

      if (!Array.isArray(reminders)) {
        throw new ErrorResponse('Reminders must be an array', HttpStatus.BAD_REQUEST, ERROR_CODES.VALIDATION_FAILED);
      }

      const updatedNote = await noteService.updateNote(noteId, userId, { reminders });
      
      if (!updatedNote) {
        throw new ErrorResponse('Note not found', HttpStatus.NOT_FOUND, ERROR_CODES.NOT_FOUND);
      }

      logger.auditLog('connection_note_reminders_set', userId, {
        noteId,
        remindersCount: reminders.length,
        category: LogCategory.CONNECTION
      });

      sendResponse(
        res,
        HttpStatus.OK,
        { reminders: updatedNote.reminders },
        'Note reminders set successfully',
        {
          processingTime: Date.now() - startTime,
          noteId,
          remindersCount: reminders.length
        }
      );

    } catch (error : any) {
      logger.error('Failed to set note reminders', {
        error: error instanceof Error ? error.message : String(error),
        noteId: req.params?.noteId,
        userId: (req as any).user?.id,
        category: LogCategory.CONNECTION
      });
      next(error);
    }
  }

  /**
   * Bulk operations on notes
   * POST /api/v1/notes/bulk
   */
  public async bulkNoteOperations(req: Request, res: Response, next: NextFunction): Promise<void> {
    const startTime = Date.now();
    
    try {
      const { operation, noteIds, data } = req.body;
      const userId = (req as any).user?.id;

      if (!userId) {
        throw new ErrorResponse('User not authenticated', HttpStatus.UNAUTHORIZED, ERROR_CODES.AUTH_FAILED);
      }

      if (!Array.isArray(noteIds) || noteIds.length === 0) {
        throw new ErrorResponse('Note IDs array is required', HttpStatus.BAD_REQUEST, ERROR_CODES.VALIDATION_FAILED);
      }

      if (noteIds.length > environmentConfig.BULK_OPERATION_BATCH_SIZE) {
        throw new ErrorResponse(
          `Bulk operation limited to ${environmentConfig.BULK_OPERATION_BATCH_SIZE} items`,
          HttpStatus.BAD_REQUEST,
          ERROR_CODES.VALIDATION_FAILED
        );
      }

      let modifiedCount = 0;

      switch (operation) {
        case 'archive':
          modifiedCount = await noteService.bulkUpdateStatus(noteIds, NoteStatus.ARCHIVED, userId);
          break;
        case 'delete':
          for (const noteId of noteIds) {
            const deleted = await noteService.deleteNote(noteId, userId);
            if (deleted) modifiedCount++;
          }
          break;
        case 'tag':
          if (!data?.tags) {
            throw new ErrorResponse('Tags are required for tag operation', HttpStatus.BAD_REQUEST, ERROR_CODES.VALIDATION_FAILED);
          }
          modifiedCount = await ConnectionNote.bulkAddTags(noteIds, data.tags, userId);
          break;
        default:
          throw new ErrorResponse('Invalid bulk operation', HttpStatus.BAD_REQUEST, ERROR_CODES.VALIDATION_FAILED);
      }

      logger.auditLog('connection_notes_bulk_operation', userId, {
        operation,
        noteIds: noteIds.slice(0, 5),
        totalNotes: noteIds.length,
        modifiedCount,
        category: LogCategory.CONNECTION
      });

      sendResponse(
        res,
        HttpStatus.OK,
        { modifiedCount },
        `Bulk ${operation} completed successfully`,
        {
          processingTime: Date.now() - startTime,
          operation,
          totalRequested: noteIds.length,
          modified: modifiedCount
        }
      );

    } catch (error : any) {
      logger.error('Failed to perform bulk note operation', {
        error: error instanceof Error ? error.message : String(error),
        operation: req.body?.operation,
        noteCount: req.body?.noteIds?.length,
        userId: (req as any).user?.id,
        category: LogCategory.CONNECTION
      });
      next(error);
    }
  }
}

export const noteController = new NoteController();