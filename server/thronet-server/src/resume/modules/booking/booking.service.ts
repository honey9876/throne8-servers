import { BookingSession, BookingStatus } from "../../models/booking-session.model";
import { User } from "../../models/user.model";
import { Resume } from "../../models/resume.model";
import { ApiError } from "../../utils/ApiError";
import {
  CreateBookingInput,
  ConfirmBookingInput,
  CancelBookingInput,
  CompleteBookingInput,
} from "./booking.types";
import { createNotification } from "../notification/notification.service";

export const createBooking = async (data: CreateBookingInput) => {
  // If a resumeId was provided, make sure it actually belongs to this
  // user — otherwise a client could pass any resumeId (including one
  // that isn't theirs) and it would silently get attached to the booking.
  if (data.resumeId) {
    const resume = await Resume.findOne({
      _id: data.resumeId,
      userId: data.userId,
    });

    if (!resume) {
      throw new ApiError(404, "Resume not found");
    }
  }

  const booking = new BookingSession(data);
  return await booking.save();
};

export const getMyBookings = async (userId: string) => {
  return await BookingSession.find({
    userId,
    status: { $in: [BookingStatus.CONFIRMED, BookingStatus.CANCELLED, BookingStatus.COMPLETED] },
  })
    .sort({ createdAt: -1 })
    .populate("resumeId", "title")
    .lean();
};

export const getAllBookings = async () => {
  const bookings: any[] = await BookingSession.find()
    .sort({ createdAt: -1 })
    .populate("resumeId", "title")
    .lean();

  // booking.userId holds the Throne8 userId (UUID string). populate() would match it against
  // the user's Mongo _id and throw a CastError, so look the users up by userId instead and
  // keep the { fullName, email } shape the admin page reads.
  const userIds = [...new Set(bookings.map((b) => b.userId).filter(Boolean))];
  const users: any[] = userIds.length
    ? await User.find({ userId: { $in: userIds } })
        .select("userId email firstName lastName")
        .lean()
    : [];
  const byUserId = new Map(users.map((u) => [u.userId, u]));

  return bookings.map((booking) => {
    const user = byUserId.get(booking.userId);
    if (!user) return booking;

    return {
      ...booking,
      userId: {
        userId: user.userId,
        email: user.email,
        fullName:
          [user.firstName, user.lastName].filter(Boolean).join(" ").trim() ||
          user.email,
      },
    };
  });
};

export const confirmBooking = async (
  bookingId: string,
  data: ConfirmBookingInput,
) => {
  const booking = await BookingSession.findById(bookingId);
  if (!booking) {
    throw new ApiError(404, "Booking not found");
  }

  if (booking.status !== BookingStatus.PENDING) {
    throw new ApiError(400, "Only pending bookings can be confirmed");
  }

  booking.status = BookingStatus.CONFIRMED;
  booking.confirmedDateTime = new Date(data.confirmedDateTime);
  booking.meetingLink = data.meetingLink;
  booking.adminNotes = data.adminNotes;

  await booking.save();

  await createNotification({
    userId: booking.userId.toString(),
    type: "booking_confirmed",
    title: "Session Confirmed",
    message: `Your interview session has been confirmed for ${booking.confirmedDateTime.toLocaleString()}.`,
    link: "/interview/history",
  });

  return booking;
};

export const cancelBooking = async (
  bookingId: string,
  data: CancelBookingInput,
) => {
  const booking = await BookingSession.findById(bookingId);
  if (!booking) {
    throw new ApiError(404, "Booking not found");
  }

  if (booking.status !== BookingStatus.PENDING) {
    throw new ApiError(400, "Only pending bookings can be cancelled");
  }

  booking.status = BookingStatus.CANCELLED;
  booking.cancelReason = data.cancelReason;
  
  if (data.rescheduleSuggestion) {
    booking.rescheduleSuggestion = {
      suggestedDate: data.rescheduleSuggestion.suggestedDate ? new Date(data.rescheduleSuggestion.suggestedDate) : undefined,
      suggestedTimeText: data.rescheduleSuggestion.suggestedTimeText,
      contactNote: data.rescheduleSuggestion.contactNote,
    };
  }

  await booking.save();

  await createNotification({
    userId: booking.userId.toString(),
    type: "booking_cancelled",
    title: "Session Cancelled",
    message: `Your session request was cancelled: ${data.cancelReason}`,
    link: "/interview/history",
  });

  return booking;
};

export const completeBooking = async (
  bookingId: string,
  adminUserId: string,
  data: CompleteBookingInput,
) => {
  const booking = await BookingSession.findById(bookingId);
  if (!booking) {
    throw new ApiError(404, "Booking not found");
  }

  if (booking.status !== BookingStatus.CONFIRMED) {
    throw new ApiError(400, "Only confirmed bookings can be completed");
  }

  // adminUserId is the Throne8 userId (UUID string), not a Mongo _id
  const admin = await User.findOne({ userId: adminUserId });
  if (!admin) {
    throw new ApiError(404, "Admin user not found");
  }

  booking.status = BookingStatus.COMPLETED;
  booking.feedback = {
    interviewFocus: data.interviewFocus,
    score: data.score,
    comment: data.comment,
    interviewerName: admin.fullName,
    completedAt: new Date(),
  };

  await booking.save();

  await createNotification({
    userId: booking.userId.toString(),
    type: "booking_completed",
    title: "Session Completed",
    message: `Your session is complete. Feedback is now available.`,
    link: "/interview/history",
  });

  return booking;
};
