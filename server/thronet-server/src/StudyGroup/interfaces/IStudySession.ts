/**
 * ====================================
 * STUDY SESSION INTERFACE
 * ====================================
 */

import { Document, Types } from 'mongoose';

export enum SessionStatus {
  ACTIVE = 'active',
  PAUSED = 'paused',
  COMPLETED = 'completed',
  CANCELLED = 'cancelled',
}

export interface IStudySession extends Document {
  _id: Types.ObjectId;
  sessionId: string;
  user: string;
  goal?: string;
  startTime: Date;
  endTime?: Date;
  pausedAt?: Date | null; // ✅ Fixed: Allow null
  pausedDuration: number;
  duration: number;
  status: SessionStatus;
  notes?: string;
  subject?: string;
  createdAt: Date;
  updatedAt: Date;
  
  // Virtual fields
  durationInMinutes: number;
  durationInHours: number;
  isActive: boolean;
}

export default IStudySession;