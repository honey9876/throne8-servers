import { IUser } from '@/shared/models/User';

declare global {
  namespace Express {
    interface Request {
      user?: Partial<IUser> & {
        id: string;
      };
      correlationId?: string;
    }
  }
}

export {};