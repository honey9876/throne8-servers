import { Document } from 'mongoose';

/**
 * Senior session types
 */
export enum SeniorSessionType {
  ONE_TO_ONE = 'one_to_one',
  GROUP = 'group',
}

/**
 * Senior session status
 */
export enum SeniorSessionStatus {
  ALL = 'all',
  DRAFT = 'draft',
  PENDING = 'pending',
  CONFIRMED = 'confirmed',
  IN_PROGRESS = 'in_progress',
  COMPLETED = 'completed',
  CANCELLED = 'cancelled',
}

/**
 * Individual junior/mentee booking
 */
export interface ISeniorSessionBooking {
  _id?: string | any;
  menteeId: string;

  bookedBy?: string;

  bookedAt: Date;

  status: SeniorSessionStatus;

  slotTime?: string;

  scheduledAt?: Date;

  payment?: {
    status: string;
    method: string;
  };

  pricing?: {
    basePrice: number;
    platformFee: number;
    totalAmount: number;
    currency: string;
  };

  startedAt?: Date;
  
  completion?: {
    completedAt: Date;
    actualDuration: number;
    wasSuccessful: boolean;
    followUpRequired: boolean;
  };
  
  reschedule?: {
    count: number;
    reason?: string;
  };
}

/**
 * SeniorSession
 */
export interface ISeniorSession {
  sessionId: string;

  mentorId: string;

  sessionType: SeniorSessionType;

  status: SeniorSessionStatus;

  scheduledAt: Date;

  duration: number;

  timezone: string;

  title: string;

  description?: string;

  category?: string;

  thumbnailImage?: string;

  /**
   * Multiple juniors can register
   * for the same senior session.
   */
  bookings: ISeniorSessionBooking[];
}

/**
 * Mongoose document type
 */
export interface SeniorSessionDocument
  extends ISeniorSession,
    Document {
  sessionId: string;
}

/**
 * Input for creating a new senior session
 */
export interface CreateSeniorSessionInput
  extends Omit<ISeniorSession, 'sessionId' | 'mentorId' | 'bookings' | 'status'> {
  status?: SeniorSessionStatus | string;
}

/**
 * Input for updating an existing senior session
 */
export type UpdateSeniorSessionInput = Partial<
  Omit<ISeniorSession, 'sessionId' | 'mentorId' | 'bookings'>
>;