import { Types } from "mongoose";

export interface CreateBookingInput {
  userId: string;
  resumeId?: string;
  preferredDate: string;
  timeSlot: string;
  customTimeText?: string;
  interviewType: string;
  notes?: string;
}

export interface ConfirmBookingInput {
  confirmedDateTime: string;
  meetingLink: string;
  adminNotes?: string;
}

export interface CancelBookingInput {
  cancelReason: string;
  rescheduleSuggestion?: {
    suggestedDate?: string;
    suggestedTimeText?: string;
    contactNote?: string;
  };
}

export interface CompleteBookingInput {
  interviewFocus: string;
  score: number;
  comment: string;
}
