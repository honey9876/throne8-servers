// src/validators/requestValidationSchemas.ts

import { z } from 'zod';

/**
 * Request Validation Schemas
 * Defines Zod validation schemas for connection request-related API endpoints.
 * FIXED: Removed nested body wrappers that were causing validation failures
 */

export const requestValidationSchemas = {
  // Send connection request validation - FIXED: Direct schema without body wrapper
  sendConnectionRequest: z.object({
    toUserId: z.string().min(1, "toUserId is required").max(100, "toUserId too long"),
    message: z.string().max(500, "Message cannot exceed 500 characters").optional(),
    priority: z.enum(['low', 'medium', 'high']).default('medium'),
    templateId: z.string().regex(/^[a-zA-Z0-9-]+$/, "Invalid templateId format").optional()
  }),

  // Update request message validation - FIXED: Separate body and params schemas
  updateRequestMessage: z.object({
    message: z.string().min(1, "Message is required").max(500, "Message cannot exceed 500 characters")
  }),

  // Request params validation (for routes with :requestId)
  requestParams: z.object({
    requestId: z.string().min(1, "Request ID is required").max(100, "Request ID too long")
  }),

  // Bulk accept requests validation - FIXED: Direct schema
  bulkAcceptRequests: z.object({
    requestIds: z.array(z.string().min(1).max(100))
      .min(1, "At least one request ID is required")
      .max(50, "Cannot process more than 50 requests at once")
  }),

  // Bulk decline requests validation - FIXED: Direct schema
  bulkDeclineRequests: z.object({
    requestIds: z.array(z.string().min(1).max(100))
      .min(1, "At least one request ID is required")
      .max(50, "Cannot process more than 50 requests at once")
  }),

  // Bulk mark requests as read validation - FIXED: Direct schema
  bulkMarkRequestsAsRead: z.object({
    requestIds: z.array(z.string().min(1).max(100))
      .min(1, "At least one request ID is required")
      .max(50, "Cannot process more than 50 requests at once")
  }),

  // Set request priority validation - FIXED: Direct schema
  setRequestPriority: z.object({
    priority: z.enum(['low', 'medium', 'high'], {
    message: "Priority must be low, medium, or high"
   })
  }),

  // Query validation for pagination
  paginationQuery: z.object({
    page: z.coerce.number().min(1, "Page must be at least 1").optional().default(1),
    limit: z.coerce.number().min(1).max(100, "Limit cannot exceed 100").optional().default(10),
    status: z.enum(['pending', 'accepted', 'declined', 'cancelled']).optional()
  }),

  // User ID params validation
  userParams: z.object({
    userId: z.string().min(1, "User ID is required").max(100, "User ID too long")
  }),

  // Status params validation
  statusParams: z.object({
    status: z.enum(['pending', 'accepted', 'declined', 'cancelled'], {
    message: "Invalid status"
  })
  })
};

// Export individual schemas for direct use
export const {
  sendConnectionRequest,
  updateRequestMessage,
  requestParams,
  bulkAcceptRequests,
  bulkDeclineRequests,
  bulkMarkRequestsAsRead,
  setRequestPriority,
  paginationQuery,
  userParams,
  statusParams
} = requestValidationSchemas;

// Default export
export default requestValidationSchemas;