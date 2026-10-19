import { z } from "zod";
import { BookingTimeSlot, BookingInterviewType } from "../../models/booking-session.model";

export const createBookingSchema = z.object({
  body: z.object({
    resumeId: z.string().optional(),
    preferredDate: z.string().datetime(),
    timeSlot: z.enum([
      BookingTimeSlot.MORNING,
      BookingTimeSlot.AFTERNOON,
      BookingTimeSlot.EVENING,
      BookingTimeSlot.NIGHT,
      BookingTimeSlot.CUSTOM,
    ]),
    customTimeText: z.string().optional(),
    interviewType: z.enum([
      BookingInterviewType.MOCK_INTERVIEW,
      BookingInterviewType.RESUME_REVIEW,
      BookingInterviewType.PLACEMENT_GUIDANCE,
    ]),
    notes: z.string().optional(),
  }),
});

export const confirmBookingSchema = z.object({
  body: z.object({
    confirmedDateTime: z.string().datetime(),
    meetingLink: z.string().url(),
    adminNotes: z.string().optional(),
  }),
});

export const cancelBookingSchema = z.object({
  body: z.object({
    cancelReason: z.string().min(1, "Reason is required"),
    rescheduleSuggestion: z.object({
      suggestedDate: z.string().datetime().optional(),
      suggestedTimeText: z.string().optional(),
      contactNote: z.string().optional(),
    }).optional(),
  }),
});

export const completeBookingSchema = z.object({
  body: z.object({
    interviewFocus: z.string().min(1, "Interview focus is required"),
    score: z.number().min(0).max(10),
    comment: z.string().min(1, "Comment is required"),
  }),
});
