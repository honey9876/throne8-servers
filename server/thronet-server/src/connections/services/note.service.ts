// // src/services/noteService.ts

// import { Types } from 'mongoose';
// import {
//   ConnectionNote,
//   IConnectionNote,
//   INoteSearchOptions,
//   NoteStatus,
//   IPaginatedNotes
// } from '../models/mongodb/ConnectionNote';
// import cacheService from './shared/cacheService';
// import logger, { LogCategory } from '../utils/logger';
// import { ErrorResponse, HttpStatus } from '../utils/response';
// import { ERROR_CODES } from '../utils/constants';

// class NoteService {
//   private readonly CACHE_PREFIX = 'note:';
//   private readonly CACHE_TTL = 3600; // 1 hour
//   private readonly STATS_CACHE_TTL = 7200; // 2 hours

//   /**
//    * ============================================================================
//    * CREATE OPERATIONS
//    * ============================================================================
//    */

//   /**
//    * Create a new note
//    */
//   async createNote(noteData: Partial<IConnectionNote>): Promise<IConnectionNote> {
//     try {
//       // Convert ObjectId to string for logging
//       const userIdString = noteData.userId?.toString();
//       const connectionIdString = noteData.connectionId?.toString();

//       logger.info('Creating note', {
//         userId: userIdString,
//         connectionId: connectionIdString,
//         category: LogCategory.CONNECTION
//       });

//       // Validate required fields
//       if (!noteData.userId || !noteData.connectionId || !noteData.content) {
//         throw new ErrorResponse(
//           'userId, connectionId, and content are required',
//           HttpStatus.BAD_REQUEST,
//           ERROR_CODES.VALIDATION_FAILED
//         );
//       }

//       // Create note
//       const note = await ConnectionNote.createNote(noteData);

//       // Clear user's note cache - convert to string
//       await this.clearUserNoteCache(noteData.userId.toString());

//       logger.info('Note created successfully', {
//         noteId: note.noteId,
//         userId: userIdString,
//         category: LogCategory.CONNECTION
//       });

//       return note;
//     } catch (error : any) {
//       logger.error('Failed to create note', {
//         error: error instanceof Error ? error.message : String(error),
//         userId: noteData.userId?.toString(),
//         category: LogCategory.CONNECTION
//       });
//       throw error;
//     }
//   }

//   /**
//    * ============================================================================
//    * READ OPERATIONS
//    * ============================================================================
//    */

//   /**
//    * Get note by ID
//    */
//   async getNoteById(noteId: string, userId: string): Promise<IConnectionNote | null> {
//     try {
//       const cacheKey = `${this.CACHE_PREFIX}${noteId}`;
      
//       // Try cache first
//       const cached = await cacheService.get(cacheKey);
//       if (cached) {
//         const note = JSON.parse(cached);
//         // Compare as strings - handle both string and ObjectId
//         const noteUserId = typeof note.userId === 'string' ? note.userId : note.userId.toString();
//         if (noteUserId === userId) {
//           return note;
//         }
//       }

//       // Get from database
//       const note = await ConnectionNote.findOne({ 
//         noteId, 
//         status: { $ne: NoteStatus.DELETED } 
//       });

//       if (!note) {
//         return null;
//       }

//       // Verify ownership - convert ObjectId to string for comparison
//       if (note.userId.toString() !== userId) {
//         throw new ErrorResponse(
//           'Unauthorized access to note',
//           HttpStatus.FORBIDDEN,
//           ERROR_CODES.AUTH_FAILED
//         );
//       }

//       // Cache it
//       await cacheService.set(cacheKey, JSON.stringify(note), this.CACHE_TTL);

//       return note;
//     } catch (error : any) {
//       logger.error('Failed to get note', {
//         error: error instanceof Error ? error.message : String(error),
//         noteId,
//         userId,
//         category: LogCategory.CONNECTION
//       });
//       throw error;
//     }
//   }

//   /**
//    * Get notes for a connection
//    */
//   async getConnectionNotes(
//     connectionId: string,
//     userId: string,
//     options: { page?: number; limit?: number } = {}
//   ): Promise<IConnectionNote[]> {
//     try {
//       const { page = 1, limit = 10 } = options;
//       const cacheKey = `${this.CACHE_PREFIX}connection:${connectionId}:user:${userId}:page:${page}`;

//       // Try cache
//       const cached = await cacheService.get(cacheKey);
//       if (cached) {
//         return JSON.parse(cached);
//       }

//       // Get from database
//       const notes = await ConnectionNote.findByConnectionAndUser(
//         connectionId,
//         userId,
//         {
//           limit,
//           skip: (page - 1) * limit
//         }
//       );

//       // Cache it
//       await cacheService.set(cacheKey, JSON.stringify(notes), this.CACHE_TTL);

//       return notes;
//     } catch (error : any) {
//       logger.error('Failed to get connection notes', {
//         error: error instanceof Error ? error.message : String(error),
//         connectionId,
//         userId,
//         category: LogCategory.CONNECTION
//       });
//       throw error;
//     }
//   }

//   /**
//    * Search notes with advanced filtering
//    */
//   async searchNotes(searchOptions: INoteSearchOptions): Promise<IPaginatedNotes> {
//     try {
//       logger.debug('Searching notes', {
//         userId: searchOptions.userId,
//         query: searchOptions.query,
//         category: LogCategory.CONNECTION
//       });

//       const results = await ConnectionNote.searchNotes(searchOptions);

//       return results;
//     } catch (error : any) {
//       logger.error('Failed to search notes', {
//         error: error instanceof Error ? error.message : String(error),
//         userId: searchOptions.userId,
//         category: LogCategory.CONNECTION
//       });
//       throw error;
//     }
//   }

//   /**
//    * ============================================================================
//    * UPDATE OPERATIONS
//    * ============================================================================
//    */

//   /**
//    * Update a note
//    */
//   // async updateNote(
//   //   noteId: string,
//   //   userId: string,
//   //   updateData: Partial<IConnectionNote>
//   // ): Promise<IConnectionNote | null> {
//   //   try {
//   //     logger.info('Updating note', {
//   //       noteId,
//   //       userId,
//   //       fields: Object.keys(updateData),
//   //       category: LogCategory.CONNECTION
//   //     });

//   //     // Verify ownership
//   //     const existingNote = await this.getNoteById(noteId, userId);
//   //     if (!existingNote) {
//   //       throw new ErrorResponse(
//   //         'Note not foundsdfghjdfghfgh',
//   //         HttpStatus.NOT_FOUND,
//   //         ERROR_CODES.NOT_FOUND
//   //       );
//   //     }

//   //     // Update note
//   //     updateData.lastModifiedBy = new Types.ObjectId(userId);
//   //     const updatedNote = await ConnectionNote.updateNote(noteId, updateData);

//   //     // Clear cache
//   //     await this.clearNoteCache(noteId);
//   //     await this.clearUserNoteCache(userId);

//   //     logger.info('Note updated successfully', {
//   //       noteId,
//   //       userId,
//   //       category: LogCategory.CONNECTION
//   //     });

//   //     return updatedNote;
//   //   } catch (error : any) {
//   //     logger.error('Failed to update note', {
//   //       error: error instanceof Error ? error.message : String(error),
//   //       noteId,
//   //       userId,
//   //       category: LogCategory.CONNECTION
//   //     });
//   //     throw error;
//   //   }
//   // }



//   async updateNote(
//   noteId: string,
//   userId: string,
//   updateData: Partial<IConnectionNote>
// ): Promise<IConnectionNote | null> {
//   try {
//     logger.info('Updating note - START', {
//       noteId,
//       userId,
//       fields: Object.keys(updateData),
//       category: LogCategory.CONNECTION
//     });

//     // ADD THIS - Check if noteId is valid ObjectId
//     // if (!Types.ObjectId.isValid(noteId)) {
//     //   throw new ErrorResponse(
//     //     'Invalid note ID format',
//     //     HttpStatus.BAD_REQUEST,
//     //     ERROR_CODES.VALIDATION_FAILED
//     //   );
//     // }

//     // Verify ownership
//     const existingNote = await this.getNoteById(noteId, userId);
    
//     // ADD THIS - Log what happened
//     logger.info('Note lookup result', {
//       noteId,
//       userId,
//       found: !!existingNote,
//       category: LogCategory.CONNECTION
//     });

//     if (!existingNote) {
//       // ADD THIS - Check if note exists but belongs to different user
//       const anyNote = await ConnectionNote.findOne({ noteId });
      
//       if (anyNote) {
//         logger.warn('Note exists but wrong user', {
//           noteId,
//           requestUserId: userId,
//           noteUserId: anyNote.userId.toString(),
//           category: LogCategory.CONNECTION
//         });
        
//         throw new ErrorResponse(
//           'Note not found or unauthorized',
//           HttpStatus.NOT_FOUND,
//           ERROR_CODES.NOT_FOUND
//         );
//       }
      
//       logger.warn('Note does not exist in database', {
//         noteId,
//         userId,
//         category: LogCategory.CONNECTION
//       });

//       throw new ErrorResponse(
//         'Note not found',
//         HttpStatus.NOT_FOUND,
//         ERROR_CODES.NOT_FOUND
//       );
//     }

//     // Update note
//     updateData.lastModifiedBy = new Types.ObjectId(userId);
//     const updatedNote = await ConnectionNote.updateNote(noteId, updateData);

//     // Clear cache
//     await this.clearNoteCache(noteId);
//     await this.clearUserNoteCache(userId);

//     logger.info('Note updated successfully', {
//       noteId,
//       userId,
//       category: LogCategory.CONNECTION
//     });

//     return updatedNote;
//   } catch (error : any) {
//     logger.error('Failed to update note', {
//       error: error instanceof Error ? error.message : String(error),
//       stack: error instanceof Error ? error.stack : undefined,
//       noteId,
//       userId,
//       category: LogCategory.CONNECTION
//     });
//     throw error;
//   }
// }
//   /**
//    * ============================================================================
//    * DELETE OPERATIONS
//    * ============================================================================
//    */

//   /**
//    * Delete a note (soft delete)
//    */
//   async deleteNote(noteId: string, userId: string): Promise<boolean> {
//     try {
//       logger.info('Deleting note', {
//         noteId,
//         userId,
//         category: LogCategory.CONNECTION
//       });

//       const deleted = await ConnectionNote.softDelete(noteId, userId);

//       if (deleted) {
//         // Clear cache
//         await this.clearNoteCache(noteId);
//         await this.clearUserNoteCache(userId);

//         logger.info('Note deleted successfully', {
//           noteId,
//           userId,
//           category: LogCategory.CONNECTION
//         });
//       }

//       return deleted;
//     } catch (error : any) {
//       logger.error('Failed to delete note', {
//         error: error instanceof Error ? error.message : String(error),
//         noteId,
//         userId,
//         category: LogCategory.CONNECTION
//       });
//       throw error;
//     }
//   }

//   /**
//    * ============================================================================
//    * TAG OPERATIONS
//    * ============================================================================
//    */

//   /**
//    * Get popular tags for a user
//    */
//   async getPopularTags(userId: string, limit: number = 20): Promise<Array<{ tag: string; count: number }>> {
//     try {
//       const cacheKey = `${this.CACHE_PREFIX}tags:user:${userId}:limit:${limit}`;

//       // Try cache
//       const cached = await cacheService.get(cacheKey);
//       if (cached) {
//         return JSON.parse(cached);
//       }

//       // Get from database
//       const tags = await ConnectionNote.getPopularTags(userId, limit);

//       // Cache it
//       await cacheService.set(cacheKey, JSON.stringify(tags), this.STATS_CACHE_TTL);

//       return tags;
//     } catch (error : any) {
//       logger.error('Failed to get popular tags', {
//         error: error instanceof Error ? error.message : String(error),
//         userId,
//         category: LogCategory.CONNECTION
//       });
//       throw error;
//     }
//   }

//   /**
//    * ============================================================================
//    * STATISTICS OPERATIONS
//    * ============================================================================
//    */

//   /**
//    * Get user note statistics
//    */
//   async getNoteStats(userId: string): Promise<any> {
//     try {
//       const cacheKey = `${this.CACHE_PREFIX}stats:user:${userId}`;

//       // Try cache
//       const cached = await cacheService.get(cacheKey);
//       if (cached) {
//         return JSON.parse(cached);
//       }

//       // Get from database
//       const stats = await ConnectionNote.getNoteStats(userId);

//       // Cache it
//       await cacheService.set(cacheKey, JSON.stringify(stats), this.STATS_CACHE_TTL);

//       return stats;
//     } catch (error : any) {
//       logger.error('Failed to get note stats', {
//         error: error instanceof Error ? error.message : String(error),
//         userId,
//         category: LogCategory.CONNECTION
//       });
//       throw error;
//     }
//   }

//   /**
//    * ============================================================================
//    * BULK OPERATIONS
//    * ============================================================================
//    */

//   /**
//    * Bulk update note status
//    */
//   async bulkUpdateStatus(
//     noteIds: string[],
//     status: NoteStatus,
//     userId: string
//   ): Promise<number> {
//     try {
//       const count = await ConnectionNote.bulkUpdateStatus(noteIds, status, userId);

//       // Clear cache for affected notes
//       for (const noteId of noteIds) {
//         await this.clearNoteCache(noteId);
//       }
//       await this.clearUserNoteCache(userId);

//       return count;
//     } catch (error : any) {
//       logger.error('Failed to bulk update status', {
//         error: error instanceof Error ? error.message : String(error),
//         userId,
//         noteCount: noteIds.length,
//         category: LogCategory.CONNECTION
//       });
//       throw error;
//     }
//   }

//   /**
//    * ============================================================================
//    * CACHE MANAGEMENT
//    * ============================================================================
//    */

//   /**
//    * Clear note cache
//    */
//   private async clearNoteCache(noteId: string): Promise<void> {
//     try {
//       const cacheKey = `${this.CACHE_PREFIX}${noteId}`;
//       await cacheService.del(cacheKey);
//     } catch (error : any) {
//       logger.warn('Failed to clear note cache', {
//         error: error instanceof Error ? error.message : String(error),
//         noteId,
//         category: LogCategory.CACHE_ERROR
//       });
//     }
//   }

//   /**
//    * Clear user's note cache
//    */
//   private async clearUserNoteCache(userId: string): Promise<void> {
//     try {
//       // Clear user-specific caches
//       const patterns = [
//         `${this.CACHE_PREFIX}connection:*:user:${userId}:*`,
//         `${this.CACHE_PREFIX}stats:user:${userId}`,
//         `${this.CACHE_PREFIX}tags:user:${userId}:*`
//       ];

//       for (const pattern of patterns) {
//         await cacheService.del(pattern);
//       }
//     } catch (error : any) {
//       logger.warn('Failed to clear user note cache', {
//         error: error instanceof Error ? error.message : String(error),
//         userId,
//         category: LogCategory.CACHE_ERROR
//       });
//     }
//   }

//   /**
//    * ============================================================================
//    * HEALTH CHECK
//    * ============================================================================
//    */

//   /**
//    * Check note service health
//    */
//   async checkHealth(): Promise<{
//     status: 'healthy' | 'unhealthy';
//     details: {
//       database: boolean;
//       cache: boolean;
//       operations: boolean;
//     };
//   }> {
//     try {
//       // Test database
//       const dbTest = await ConnectionNote.countDocuments().limit(1);
//       const databaseHealthy = dbTest >= 0;

//       // Test cache
//       const cacheKey = 'health:note:test';
//       await cacheService.set(cacheKey, 'test', 60);
//       const cacheValue = await cacheService.get(cacheKey);
//       const cacheHealthy = cacheValue === 'test';
//       await cacheService.del(cacheKey);

//       const allHealthy = databaseHealthy && cacheHealthy;

//       return {
//         status: allHealthy ? 'healthy' : 'unhealthy',
//         details: {
//           database: databaseHealthy,
//           cache: cacheHealthy,
//           operations: allHealthy
//         }
//       };
//     } catch (error : any) {
//       logger.error('Note service health check failed', {
//         error: error instanceof Error ? error.message : String(error),
//         category: LogCategory.SYSTEM
//       });

//       return {
//         status: 'unhealthy',
//         details: {
//           database: false,
//           cache: false,
//           operations: false
//         }
//       };
//     }
//   }
// }

// // ================================================================================
// // EXPORT SINGLETON INSTANCE
// // ================================================================================
// export const noteService = new NoteService();
// export default noteService;








// src/services/noteService.ts

import { Types } from 'mongoose';
import {
  ConnectionNote,
  IConnectionNote,
  INoteSearchOptions,
  NoteStatus,
  IPaginatedNotes
} from '../models/mongodb/ConnectionNote';
import cacheService from './shared/cacheService';
import logger, { LogCategory } from '../utils/logger';
import { ErrorResponse, HttpStatus } from '../utils/response';
import { ERROR_CODES } from '../utils/constants';

class NoteService {
  private readonly CACHE_PREFIX = 'note:';
  private readonly CACHE_TTL = 3600; // 1 hour
  private readonly STATS_CACHE_TTL = 7200; // 2 hours

  /**
   * ============================================================================
   * VALIDATION HELPERS
   * ============================================================================
   */

  /**
   * Validate note ID format (supports both UUID and MongoDB ObjectId)
   */
  private isValidNoteId(noteId: string): { valid: boolean; type: 'uuid' | 'objectid' | 'invalid' } {
    // Check if MongoDB ObjectId (24 hex characters)
    if (Types.ObjectId.isValid(noteId) && /^[0-9a-fA-F]{24}$/.test(noteId)) {
      return { valid: true, type: 'objectid' };
    }
    
    // Check if UUID v4 (standard format with hyphens)
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    if (uuidRegex.test(noteId)) {
      return { valid: true, type: 'uuid' };
    }
    
    return { valid: false, type: 'invalid' };
  }

  /**
   * Build query to find note by ID (supports both noteId field and _id)
   */
  private buildNoteIdQuery(noteId: string) {
    const validation = this.isValidNoteId(noteId);
    
    if (!validation.valid) {
      throw new ErrorResponse(
        'Invalid note ID format. Must be either a valid UUID or MongoDB ObjectId',
        HttpStatus.BAD_REQUEST,
        ERROR_CODES.VALIDATION_FAILED
      );
    }

    // For ObjectId, check both _id and noteId fields
    if (validation.type === 'objectid') {
      return {
        $or: [
          { noteId },
          { _id: new Types.ObjectId(noteId) }
        ]
      };
    }
    
    // For UUID, only check noteId field
    return { noteId };
  }

  /**
   * ============================================================================
   * CREATE OPERATIONS
   * ============================================================================
   */

  /**
   * Create a new note
   */
  async createNote(noteData: Partial<IConnectionNote>): Promise<IConnectionNote> {
    try {
      const userIdString = noteData.userId?.toString();
      const connectionIdString = noteData.connectionId?.toString();

      logger.info('Creating note', {
        userId: userIdString,
        connectionId: connectionIdString,
        category: LogCategory.CONNECTION
      });

      // Validate required fields
      if (!noteData.userId || !noteData.connectionId || !noteData.content) {
        throw new ErrorResponse(
          'userId, connectionId, and content are required',
          HttpStatus.BAD_REQUEST,
          ERROR_CODES.VALIDATION_FAILED
        );
      }

      // Create note
      const note = await ConnectionNote.createNote(noteData);

      // Clear user's note cache
      await this.clearUserNoteCache(noteData.userId.toString());

      logger.info('Note created successfully', {
        noteId: note.noteId,
        userId: userIdString,
        category: LogCategory.CONNECTION
      });

      return note;
    } catch (error : any) {
      logger.error('Failed to create note', {
        error: error instanceof Error ? error.message : String(error),
        userId: noteData.userId?.toString(),
        category: LogCategory.CONNECTION
      });
      throw error;
    }
  }

  /**
   * ============================================================================
   * READ OPERATIONS
   * ============================================================================
   */

  /**
   * Get note by ID (supports both UUID noteId and MongoDB _id)
   */
  async getNoteById(noteId: string, userId: string): Promise<IConnectionNote | null> {
    try {
      const cacheKey = `${this.CACHE_PREFIX}${noteId}`;
      
      // Try cache first
      const cached = await cacheService.get(cacheKey);
      if (cached) {
        const note = JSON.parse(cached);
        const noteUserId = typeof note.userId === 'string' ? note.userId : note.userId.toString();
        if (noteUserId === userId) {
          return note;
        }
      }

      // Build query that supports both ID types
      const query = {
        ...this.buildNoteIdQuery(noteId),
        status: { $ne: NoteStatus.DELETED }
      };

      // Get from database
      const note = await ConnectionNote.findOne(query);

      if (!note) {
        return null;
      }

      // Verify ownership
      if (note.userId.toString() !== userId) {
        throw new ErrorResponse(
          'Unauthorized access to note',
          HttpStatus.FORBIDDEN,
          ERROR_CODES.AUTH_FAILED
        );
      }

      // Cache it
      await cacheService.set(cacheKey, JSON.stringify(note), this.CACHE_TTL);

      return note;
    } catch (error : any) {
      logger.error('Failed to get note', {
        error: error instanceof Error ? error.message : String(error),
        noteId,
        userId,
        category: LogCategory.CONNECTION
      });
      throw error;
    }
  }

  /**
   * Get notes for a connection
   */
  async getConnectionNotes(
    connectionId: string,
    userId: string,
    options: { page?: number; limit?: number } = {}
  ): Promise<IConnectionNote[]> {
    try {
      const { page = 1, limit = 10 } = options;
      const cacheKey = `${this.CACHE_PREFIX}connection:${connectionId}:user:${userId}:page:${page}`;

      // Try cache
      const cached = await cacheService.get(cacheKey);
      if (cached) {
        return JSON.parse(cached);
      }

      // Get from database
      const notes = await ConnectionNote.findByConnectionAndUser(
        connectionId,
        userId,
        {
          limit,
          skip: (page - 1) * limit
        }
      );

      // Cache it
      await cacheService.set(cacheKey, JSON.stringify(notes), this.CACHE_TTL);

      return notes;
    } catch (error : any) {
      logger.error('Failed to get connection notes', {
        error: error instanceof Error ? error.message : String(error),
        connectionId,
        userId,
        category: LogCategory.CONNECTION
      });
      throw error;
    }
  }

  /**
   * Search notes with advanced filtering
   */
  async searchNotes(searchOptions: INoteSearchOptions): Promise<IPaginatedNotes> {
    try {
      logger.debug('Searching notes', {
        userId: searchOptions.userId,
        query: searchOptions.query,
        category: LogCategory.CONNECTION
      });

      const results = await ConnectionNote.searchNotes(searchOptions);

      return results;
    } catch (error : any) {
      logger.error('Failed to search notes', {
        error: error instanceof Error ? error.message : String(error),
        userId: searchOptions.userId,
        category: LogCategory.CONNECTION
      });
      throw error;
    }
  }

  /**
   * ============================================================================
   * UPDATE OPERATIONS
   * ============================================================================
   */

  /**
   * Update a note (supports both UUID noteId and MongoDB _id)
   */
  async updateNote(
    noteId: string,
    userId: string,
    updateData: Partial<IConnectionNote>
  ): Promise<IConnectionNote | null> {
    try {
      logger.info('Updating note', {
        noteId,
        userId,
        fields: Object.keys(updateData),
        category: LogCategory.CONNECTION
      });

      // Validate noteId format
      const validation = this.isValidNoteId(noteId);
      if (!validation.valid) {
        throw new ErrorResponse(
          'Invalid note ID format. Must be either a valid UUID or MongoDB ObjectId',
          HttpStatus.BAD_REQUEST,
          ERROR_CODES.VALIDATION_FAILED
        );
      }

      // Verify ownership and note exists
      const existingNote = await this.getNoteById(noteId, userId);
      
      if (!existingNote) {
        // Check if note exists but belongs to different user
        const query = this.buildNoteIdQuery(noteId);
        const anyNote = await ConnectionNote.findOne(query);
        
        if (anyNote) {
          logger.warn('Unauthorized note update attempt', {
            noteId,
            requestUserId: userId,
            noteOwnerId: anyNote.userId.toString(),
            category: LogCategory.CONNECTION
          });
          
          throw new ErrorResponse(
            'Note not found or you do not have permission to update it',
            HttpStatus.NOT_FOUND,
            ERROR_CODES.NOT_FOUND
          );
        }
        
        logger.warn('Note does not exist', {
          noteId,
          userId,
          category: LogCategory.CONNECTION
        });

        throw new ErrorResponse(
          'Note not found',
          HttpStatus.NOT_FOUND,
          ERROR_CODES.NOT_FOUND
        );
      }

      // Update note
      updateData.lastModifiedBy = new Types.ObjectId(userId);
      
      // Use the actual noteId from the found note (UUID format)
      const updatedNote = await ConnectionNote.updateNote(
        existingNote.noteId, 
        updateData
      );

      // Clear cache
      await this.clearNoteCache(noteId);
      await this.clearUserNoteCache(userId);

      logger.info('Note updated successfully', {
        noteId: existingNote.noteId,
        userId,
        category: LogCategory.CONNECTION
      });

      return updatedNote;
    } catch (error : any) {
      logger.error('Failed to update note', {
        error: error instanceof Error ? error.message : String(error),
        noteId,
        userId,
        category: LogCategory.CONNECTION
      });
      throw error;
    }
  }

  /**
   * ============================================================================
   * DELETE OPERATIONS
   * ============================================================================
   */

  /**
   * Delete a note (soft delete) - supports both UUID noteId and MongoDB _id
   */
  async deleteNote(noteId: string, userId: string): Promise<boolean> {
    try {
      logger.info('Deleting note', {
        noteId,
        userId,
        category: LogCategory.CONNECTION
      });

      // Validate and get the note first
      const existingNote = await this.getNoteById(noteId, userId);
      
      if (!existingNote) {
        throw new ErrorResponse(
          'Note not found',
          HttpStatus.NOT_FOUND,
          ERROR_CODES.NOT_FOUND
        );
      }

      // Use the actual noteId (UUID) for deletion
      const deleted = await ConnectionNote.softDelete(existingNote.noteId, userId);

      if (deleted) {
        // Clear cache
        await this.clearNoteCache(noteId);
        await this.clearUserNoteCache(userId);

        logger.info('Note deleted successfully', {
          noteId: existingNote.noteId,
          userId,
          category: LogCategory.CONNECTION
        });
      }

      return deleted;
    } catch (error : any) {
      logger.error('Failed to delete note', {
        error: error instanceof Error ? error.message : String(error),
        noteId,
        userId,
        category: LogCategory.CONNECTION
      });
      throw error;
    }
  }

  /**
   * ============================================================================
   * TAG OPERATIONS
   * ============================================================================
   */

  /**
   * Get popular tags for a user
   */
  async getPopularTags(userId: string, limit: number = 20): Promise<Array<{ tag: string; count: number }>> {
    try {
      const cacheKey = `${this.CACHE_PREFIX}tags:user:${userId}:limit:${limit}`;

      // Try cache
      const cached = await cacheService.get(cacheKey);
      if (cached) {
        return JSON.parse(cached);
      }

      // Get from database
      const tags = await ConnectionNote.getPopularTags(userId, limit);

      // Cache it
      await cacheService.set(cacheKey, JSON.stringify(tags), this.STATS_CACHE_TTL);

      return tags;
    } catch (error : any) {
      logger.error('Failed to get popular tags', {
        error: error instanceof Error ? error.message : String(error),
        userId,
        category: LogCategory.CONNECTION
      });
      throw error;
    }
  }

  /**
   * ============================================================================
   * STATISTICS OPERATIONS
   * ============================================================================
   */

  /**
   * Get user note statistics
   */
  async getNoteStats(userId: string): Promise<any> {
    try {
      const cacheKey = `${this.CACHE_PREFIX}stats:user:${userId}`;

      // Try cache
      const cached = await cacheService.get(cacheKey);
      if (cached) {
        return JSON.parse(cached);
      }

      // Get from database
      const stats = await ConnectionNote.getNoteStats(userId);

      // Cache it
      await cacheService.set(cacheKey, JSON.stringify(stats), this.STATS_CACHE_TTL);

      return stats;
    } catch (error : any) {
      logger.error('Failed to get note stats', {
        error: error instanceof Error ? error.message : String(error),
        userId,
        category: LogCategory.CONNECTION
      });
      throw error;
    }
  }

  /**
   * ============================================================================
   * BULK OPERATIONS
   * ============================================================================
   */

  /**
   * Bulk update note status
   */
  async bulkUpdateStatus(
    noteIds: string[],
    status: NoteStatus,
    userId: string
  ): Promise<number> {
    try {
      const count = await ConnectionNote.bulkUpdateStatus(noteIds, status, userId);

      // Clear cache for affected notes
      for (const noteId of noteIds) {
        await this.clearNoteCache(noteId);
      }
      await this.clearUserNoteCache(userId);

      return count;
    } catch (error : any) {
      logger.error('Failed to bulk update status', {
        error: error instanceof Error ? error.message : String(error),
        userId,
        noteCount: noteIds.length,
        category: LogCategory.CONNECTION
      });
      throw error;
    }
  }

  /**
   * ============================================================================
   * CACHE MANAGEMENT
   * ============================================================================
   */

  /**
   * Clear note cache
   */
  private async clearNoteCache(noteId: string): Promise<void> {
    try {
      const cacheKey = `${this.CACHE_PREFIX}${noteId}`;
      await cacheService.del(cacheKey);
    } catch (error : any) {
      logger.warn('Failed to clear note cache', {
        error: error instanceof Error ? error.message : String(error),
        noteId,
        category: LogCategory.CACHE_ERROR
      });
    }
  }

  /**
   * Clear user's note cache
   */
  private async clearUserNoteCache(userId: string): Promise<void> {
    try {
      // Clear user-specific caches
      const patterns = [
        `${this.CACHE_PREFIX}connection:*:user:${userId}:*`,
        `${this.CACHE_PREFIX}stats:user:${userId}`,
        `${this.CACHE_PREFIX}tags:user:${userId}:*`
      ];

      for (const pattern of patterns) {
        await cacheService.del(pattern);
      }
    } catch (error : any) {
      logger.warn('Failed to clear user note cache', {
        error: error instanceof Error ? error.message : String(error),
        userId,
        category: LogCategory.CACHE_ERROR
      });
    }
  }

  /**
   * ============================================================================
   * HEALTH CHECK
   * ============================================================================
   */

  /**
   * Check note service health
   */
  async checkHealth(): Promise<{
    status: 'healthy' | 'unhealthy';
    details: {
      database: boolean;
      cache: boolean;
      operations: boolean;
    };
  }> {
    try {
      // Test database
      const dbTest = await ConnectionNote.countDocuments().limit(1);
      const databaseHealthy = dbTest >= 0;

      // Test cache
      const cacheKey = 'health:note:test';
      await cacheService.set(cacheKey, 'test', 60);
      const cacheValue = await cacheService.get(cacheKey);
      const cacheHealthy = cacheValue === 'test';
      await cacheService.del(cacheKey);

      const allHealthy = databaseHealthy && cacheHealthy;

      return {
        status: allHealthy ? 'healthy' : 'unhealthy',
        details: {
          database: databaseHealthy,
          cache: cacheHealthy,
          operations: allHealthy
        }
      };
    } catch (error : any) {
      logger.error('Note service health check failed', {
        error: error instanceof Error ? error.message : String(error),
        category: LogCategory.SYSTEM
      });

      return {
        status: 'unhealthy',
        details: {
          database: false,
          cache: false,
          operations: false
        }
      };
    }
  }
}

// ================================================================================
// EXPORT SINGLETON INSTANCE
// ================================================================================
export const noteService = new NoteService();
export default noteService;