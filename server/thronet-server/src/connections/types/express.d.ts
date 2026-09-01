// src/types/express.d.ts

import { Request } from 'express';

declare module 'express-serve-static-core' {
  interface Request {
    user?: {
      id: string;
      isAdmin: boolean;
      region?: string;
      email: string;
      role: 'user' | 'admin';
    };
  }
}

/**
 * Custom type definition for Express Request
 * Extends Express Request type to include user property for authentication
 * Properties:
 * - id: User ID (string, typically ObjectId)
 * - isAdmin: Boolean indicating admin status
 * - region: Optional region for sharding
 * 
 * Integration:
 * - Used by controllers (e.g., connectionController.ts)
 * - Aligns with tsconfig.json (types, paths)
 */


declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        email: string;
        role: 'user' | 'admin';
      };
    }
  }
}