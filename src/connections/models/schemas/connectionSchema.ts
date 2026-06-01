// src/models/schemas/connectionSchema.ts

import { z } from 'zod';

/**
 * Zod validation schemas for connection-related operations
 * FIXED for Zod v4 compatibility
 */
const connectionValidationSchemas = {
    createConnection: z.object({
        fromUserId: z.string().min(1, 'fromUserId is required'),
        toUserId: z.string().min(1, 'toUserId is required'),
        connectionType: z.enum(['professional', 'personal', 'other']).default('professional'),
        requestId: z.string().optional(),
    }),

    // FIX: Remove required_error and invalid_type_error, use only message
    updateConnectionStatus: z.object({
        status: z.enum(['active', 'pending', 'removed', 'blocked'], {
            message: 'Status is required and must be one of: active, pending, removed, blocked'
        }),
    }),

    // FIX: Remove required_error and invalid_type_error, use only message
    setConnectionVisibility: z.object({
        visibility: z.enum(['public', 'connections', 'private'], {
            message: 'Visibility is required and must be one of: public, connections, private'
        }),
    }),

    bulkDeleteConnections: z.object({
        connectionIds: z.array(z.string()).min(1, 'At least one connectionId is required'),
    }),

    // FIX: Remove required_error and invalid_type_error, use only message
    setConnectionPriority: z.object({
        priority: z.enum(['low', 'medium', 'high'], {
            message: 'Priority is required and must be one of: low, medium, high'
        }),
    }),

    setConnectionTags: z.object({
        tags: z.array(
            z.string().max(50, 'Tag cannot exceed 50 characters')
        ).max(20, 'Maximum 20 tags allowed'),
    }),
};

export default connectionValidationSchemas;