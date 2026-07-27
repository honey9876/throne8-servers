// // src/models/schemas/degreeValidationSchemas.ts
// import { z } from 'zod';

// /**
//  * Validation schemas for degree-related API endpoints
//  * Used to validate request parameters and query strings
//  */

// // Base user ID validation
// const userIdValidation = z.string()
//   .min(1, 'User ID is required')
//   .max(50, 'User ID too long')
//   .regex(/^[a-zA-Z0-9_-]+$/, 'User ID contains invalid characters');

// // Query parameter validations
// const depthValidation = z.string()
//   .optional()
//   .transform(val => val ? parseInt(val) : 3)
//   .pipe(z.number().int().min(1).max(5));

// const maxLengthValidation = z.string()
//   .optional()
//   .transform(val => val ? parseInt(val) : 5)
//   .pipe(z.number().int().min(1).max(10));

// const algorithmValidation = z.enum(['dijkstra', 'astar']).optional().default('dijkstra');
// const modeValidation = z.enum(['BFS', 'DFS']).optional().default('BFS');

// /**
//  * Schema for validating single user ID in params
//  */
// export const userIdSchema = z.object({
//   params: z.object({
//     userId: userIdValidation
//   }),
//   query: z.object({}).optional().default({})
// });

// /**
//  * Schema for validating user path (fromUserId, toUserId) in params
//  */
// export const userPathSchema = z.object({
//   params: z.object({
//     fromUserId: userIdValidation,
//     toUserId: userIdValidation
//   }),
//   query: z.object({
//     algorithm: algorithmValidation
//   }).optional().default({})
// });

// /**
//  * Schema for degree calculation with depth
//  */
// export const degreeCalculationSchema = z.object({
//   params: z.object({
//     userId: userIdValidation
//   }),
//   query: z.object({
//     maxDepth: depthValidation,
//     mode: modeValidation
//   }).optional().default({})
// });

// /**
//  * Schema for path length calculations
//  */
// export const pathLengthSchema = z.object({
//   params: z.object({
//     userId: userIdValidation
//   }),
//   query: z.object({
//     maxLength: maxLengthValidation
//   }).optional().default({})
// });

// /**
//  * Schema for network-wide operations (no specific user)
//  */
// export const networkOperationSchema = z.object({
//   params: z.object({}).optional().default({}),
//   query: z.object({}).optional().default({})
// });

// /**
//  * Schema for graph traversal operations
//  */
// export const graphTraversalSchema = z.object({
//   params: z.object({
//     userId: userIdValidation
//   }),
//   query: z.object({
//     depth: depthValidation,
//     mode: modeValidation
//   }).optional().default({})
// });

// /**
//  * Schema for centrality and analytics operations
//  */
// export const analyticsSchema = z.object({
//   params: z.object({
//     userId: userIdValidation
//   }),
//   query: z.object({}).optional().default({})
// });

// const degreeValidationSchemas = {
//   userIdSchema,
//   userPathSchema,
//   degreeCalculationSchema,
//   pathLengthSchema,
//   networkOperationSchema,
//   graphTraversalSchema,
//   analyticsSchema
// };

// export default degreeValidationSchemas;

// src/models/schemas/degreeValidationSchemas.ts
import { z } from 'zod';

/**
 * Validation schemas for degree-related API endpoints
 * Used to validate request parameters and query strings
 * FIXED for Zod v4 compatibility
 */

// Base user ID validation
const userIdValidation = z.string()
  .min(1, 'User ID is required')
  .max(50, 'User ID too long')
  .regex(/^[a-zA-Z0-9_-]+$/, 'User ID contains invalid characters');

// Query parameter validations
const depthValidation = z.string()
  .optional()
  .transform(val => val ? parseInt(val) : 3)
  .pipe(z.number().int().min(1).max(5));

const maxLengthValidation = z.string()
  .optional()
  .transform(val => val ? parseInt(val) : 5)
  .pipe(z.number().int().min(1).max(10));

const algorithmValidation = z.enum(['dijkstra', 'astar']).optional().default('dijkstra');
const modeValidation = z.enum(['BFS', 'DFS']).optional().default('BFS');

/**
 * Schema for validating single user ID in params
 */
export const userIdSchema = z.object({
  params: z.object({
    userId: userIdValidation
  }),
  // FIX: Provide empty object as default value
  query: z.object({}).optional().default(() => ({}))
});

/**
 * Schema for validating user path (fromUserId, toUserId) in params
 */
export const userPathSchema = z.object({
  params: z.object({
    fromUserId: userIdValidation,
    toUserId: userIdValidation
  }),
  // FIX: Provide actual default with algorithm property
  query: z.object({
    algorithm: algorithmValidation
  }).optional().default(() => ({ algorithm: 'dijkstra' as const }))
});

/**
 * Schema for degree calculation with depth
 */
export const degreeCalculationSchema = z.object({
  params: z.object({
    userId: userIdValidation
  }),
  // FIX: Provide actual default with maxDepth and mode
  query: z.object({
    maxDepth: depthValidation,
    mode: modeValidation
  }).optional().default(() => ({ maxDepth: 3, mode: 'BFS' as const }))
});

/**
 * Schema for path length calculations
 */
export const pathLengthSchema = z.object({
  params: z.object({
    userId: userIdValidation
  }),
  // FIX: Provide actual default with maxLength
  query: z.object({
    maxLength: maxLengthValidation
  }).optional().default(() => ({ maxLength: 5 }))
});

/**
 * Schema for network-wide operations (no specific user)
 */
export const networkOperationSchema = z.object({
  params: z.object({}).optional().default(() => ({})),
  query: z.object({}).optional().default(() => ({}))
});

/**
 * Schema for graph traversal operations
 */
export const graphTraversalSchema = z.object({
  params: z.object({
    userId: userIdValidation
  }),
  // FIX: Provide actual default with depth and mode
  query: z.object({
    depth: depthValidation,
    mode: modeValidation
  }).optional().default(() => ({ depth: 3, mode: 'BFS' as const }))
});

/**
 * Schema for centrality and analytics operations
 */
export const analyticsSchema = z.object({
  params: z.object({
    userId: userIdValidation
  }),
  query: z.object({}).optional().default(() => ({}))
});

const degreeValidationSchemas = {
  userIdSchema,
  userPathSchema,
  degreeCalculationSchema,
  pathLengthSchema,
  networkOperationSchema,
  graphTraversalSchema,
  analyticsSchema
};

export default degreeValidationSchemas;
