import { TimeStamps } from './common.types';
import { SessionType } from '../../shared/constants/sessionTypes';
import { BookingStatus } from '../../shared/constants/bookingStatus';

export enum PaymentStatus {
  PENDING = 'pending',
  COMPLETED = 'completed',
  FAILED = 'failed',
  REFUNDED = 'refunded',
  PARTIALLY_REFUNDED = 'partially_refunded',
}

export enum PaymentMethod {
  RAZORPAY = 'razorpay',
  STRIPE = 'stripe',
  WALLET = 'wallet',
  FREE = 'free',
}

export interface ISessionMentor extends TimeStamps {
  _id: string;
  sessionId: string;
  mentorId: string;
  menteeId: string;
  sessionType: SessionType;
  status: BookingStatus;

  // Scheduling
  scheduledAt: Date;
  duration: number; // in minutes
  timezone: string;
  startedAt?: Date;
  endedAt?: Date;

  // Details
  title: string;
  description?: string;
  notes?: string;
  attachments?: string[];
  thumbnailImage?: string;

  // Pricing & Payment
  pricing: {
    basePrice: number;
    platformFee: number;
    totalAmount: number;
    currency: string;
  };
  payment: {
    status: PaymentStatus;
    method: PaymentMethod;
    transactionId?: string;
    paidAt?: Date;
    refundAmount?: number;
    refundedAt?: Date;
    refundReason?: string;
  };

  // Meeting details
  meeting?: {
    platform: 'zoom' | 'google_meet' | 'daily_co' | 'custom';
    meetingUrl?: string;
    meetingId?: string;
    passcode?: string;
    recordingUrl?: string;
  };

  // Cancellation & Rescheduling
  cancellation?: {
    cancelledBy: string;
    cancelledAt: Date;
    reason: string;
    refundEligible: boolean;
  };
  reschedule?: {
    count: number;
    lastRescheduledAt?: Date;
    previousDates: Date[];
    rescheduledBy?: string;
  };

  // Review & Feedback
  review?: {
    mentorReview?: string;
    menteeReview?: string;
    rating?: number;
    reviewedAt?: Date;
  };

  // Completion tracking
  completion?: {
    completedAt?: Date;
    actualDuration?: number;
    wasSuccessful: boolean;
    followUpRequired: boolean;
    followUpNotes?: string;
    leftAt?: Date;           // 👈 add
    leftEarlyReason?: string;
  };

  bookedMenteeName?: string | null;
  isBooked?: boolean;
  bookedBy?: string | null;
  bookedAt?: Date | null;

  bookings?: Array<{
    menteeId: string;
    bookedBy?: string;
    bookedAt?: Date;
    status: 'pending' | 'confirmed' | 'cancelled' | 'completed';
    slotTime?: string;
    scheduledAt?: Date;
    availabilityId?: string;
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
  }>;

  slotTime?: string;         // "10:00 - 10:30"
  availabilityId?: string;   // availability UUID

  progress?: {
    totalSessionsBooked: number;
    completedSessions: number;
    leftSessions: number;
    totalTimeSpent: number;
  };

  //meta data
  metadata?: Record<string, any>;
}

export interface ISessionFilters {
  mentorId?: string;
  menteeId?: string;
  sessionType?: SessionType[];
  status?: BookingStatus[];
  paymentStatus?: PaymentStatus[];
  scheduledFrom?: Date;
  scheduledTo?: Date;
  minAmount?: number;
  maxAmount?: number;
}

export interface CreateSessionInput {
  mentorId: string;
  menteeId: string;
  sessionType: SessionType;
  scheduledAt: Date;
  timezone: string;
  title: string;
  description?: string;
  pricing: ISessionMentor['pricing'];
  paymentMethod: PaymentMethod;
}

export interface UpdateSessionInput {
  status?: BookingStatus;
  scheduledAt?: Date;
  title?: string;
  description?: string;
  notes?: string;
  meeting?: Partial<ISessionMentor['meeting']>;
}

export interface RescheduleSessionInput {
  sessionId: string;
  newScheduledAt: Date;
  reason: string;
  rescheduledBy: string;
}

export interface CancelSessionInput {
  sessionId: string;
  cancelledBy: string;
  reason: string;
}

export interface CompleteSessionInput {
  sessionId: string;
  actualDuration?: number;
  wasSuccessful: boolean;
  followUpRequired: boolean;
  followUpNotes?: string;
  mentorReview?: string;
}

export interface SessionStats {
  total: number;
  completed: number;
  cancelled: number;
  upcoming: number;
  totalRevenue: number;
  averageDuration: number;
  completionRate: number;
}