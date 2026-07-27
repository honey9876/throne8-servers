import { Request } from 'express';

// Extend Express Request with user property
export interface AuthRequest extends Request {
  user?: {
    userId: string;      // ✅ UUID from auth middleware
    _id?: string;        // ✅ ADD: MongoDB ObjectId (optional)
    email: string;
    role: string;
  };
}

// Also declare it globally for Express namespace
declare global {
  namespace Express {
    interface Request {
      user?: {
        userId: string;
        // id: string;
        email: string;
        role: string;
      };
    }
  }
}

// Export empty object to make this a module
export { };