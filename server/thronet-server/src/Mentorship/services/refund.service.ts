import mongoose from 'mongoose';
import { logger } from '@/shared/logger.util';
import emailService from './email.service';
import smsService from './sms.service';
import { CancellationLog, SessionMentor, Mentor } from '../models';
import { User } from '@/auth/models';
import { BookingStatus } from '@/shared/constants/bookingStatus';
import refundCalculator from '@/Mentorship/utils/refundCalculator';
import { PaymentStatus } from '@/Mentorship/interface/session.types';
import emailTemplates from '@/Mentorship/utils/emailTemplates';
import smsTemplates from '@/Mentorship/utils/smsTemplates';
import Razorpay from 'razorpay';
import availabilityService from './availability.service';
import MentorshipPayment, { PayoutStatus } from '../models/Payment';
import NotificationService, { NotificationType, NotificationChannel } from './notification.service';
import { NotFoundError, ForbiddenError, ConflictError, BadRequestError, ExternalServiceError } from '@/shared/errors/app.error';



// true  = missed-session refunds go to the admin Refunds tab (Pending) and are paid manually
// false = missed-session refunds are sent automatically through Razorpay
const MISSED_REFUND_MANUAL_ONLY = true;

// Razorpay instance - initialized once, reused across calls
let razorpay: Razorpay | null = null;

function getRazorpay(): Razorpay {
  if (!razorpay) {
    const key_id = process.env.RAZORPAY_KEY_ID;
    const key_secret = process.env.RAZORPAY_KEY_SECRET;

    if (!key_id || !key_secret) {
      throw new Error(
        'Razorpay not configured - set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET in .env'
      );
    }

    razorpay = new Razorpay({ key_id, key_secret });
  }
  return razorpay;
}

interface RefundInput {
  sessionId: string;
  userId: string;
  reason: string;
  bookingId?: string;
  cancellationCategory?: 'personal' | 'emergency' | 'scheduling_conflict' | 'technical' | 'other';
  additionalNotes?: string;
  isEmergency?: boolean;
}


interface RefundResult {
  success: boolean;
  refundAmount: number;
  refundPercentage: number;
  refundEligible: boolean;
  refundStatus: string;
  transactionId?: string;
  message: string;
  cancellationLog: any;
}

class RefundService {
  /**
   * Process refund for cancelled session.
   *
   * Session update ek hi atomic findByIdAndUpdate se hota hai. Pehle do alag save()
   * calls the, jisse process crash hone par session CANCELLED state mein atak sakta tha.
   */
  async processRefund(input: RefundInput, authToken?: string): Promise<RefundResult> {
    try {
      logger.info(`Processing refund for session: ${input.sessionId}`);

      // Step 1: Get session details
      /**
       * TEMP FIX (UUID Lookup)
       *
       * Refund flow receives the public sessionId (UUID)
       * from the cancellation pipeline.
       *
       * Query by sessionId instead of MongoDB _id to
       * prevent ObjectId cast errors while preserving
       * the existing backend architecture.
       */
      const session = await SessionMentor.findOne(
        mongoose.Types.ObjectId.isValid(input.sessionId)
          ? { $or: [{ sessionId: input.sessionId }, { _id: input.sessionId }] }
          : { sessionId: input.sessionId }
      );
      if (!session) {
        throw new NotFoundError('Session');
      }

      const targetBooking = input.bookingId
        ? session.bookings?.find((b: any) => b._id?.toString() === input.bookingId || b.bookingId === input.bookingId)
        : undefined;

      if (input.bookingId && !targetBooking) {
        throw new NotFoundError('Booking');
      }

      const effectiveMenteeId = targetBooking?.menteeId || targetBooking?.bookedBy || session.menteeId;
      const effectivePricing = targetBooking?.pricing?.totalAmount ? targetBooking.pricing : (session.pricing || { totalAmount: 0, basePrice: 0, platformFee: 0 });
      const effectiveScheduledAt = targetBooking?.scheduledAt || session.scheduledAt;

      // Step 2: Idempotency check - prevent double refund
      if (
        session.status === BookingStatus.CANCELLED ||
        session.status === BookingStatus.REFUNDED ||
        (targetBooking && targetBooking.status === 'cancelled')
      ) {
        logger.warn(`Refund already processed for session: ${input.sessionId}`);
        throw new ConflictError('Session or booking has already been cancelled');
      }

      // session.mentorId Mentor-PROFILE id hai, mentor ka auth userId nahi.
      // Mentor khud cancel kare to input.userId se direct compare kabhi match nahi hota,
      // isliye pehle mentor ka real userId resolve karte hain.
      const mentorDoc = await Mentor.findOne({ mentorId: session.mentorId, isDeleted: false });
      const mentorUserId = mentorDoc?.userId;

      // Step 3: Validate cancellation is allowed (against the correct mentee/mentor)
      this.validateCancellation(session, input.userId, effectiveMenteeId, mentorUserId, effectiveScheduledAt);

      // Step 4: Calculate refund using the specific booking's pricing/time
      const refundCalculation = input.isEmergency
        ? refundCalculator.calculateEmergencyRefund(
          effectivePricing.totalAmount,
          effectivePricing.platformFee,
          effectivePricing.basePrice
        )
        : refundCalculator.calculateRefund({
          sessionPrice: effectivePricing.basePrice,
          platformFee: effectivePricing.platformFee,
          totalAmount: effectivePricing.totalAmount,
          scheduledAt: effectiveScheduledAt,
        });

      logger.info(
        `Refund calculated: ${refundCalculation.refundPercentage}% = Rs.${refundCalculation.refundAmount}`
      );

      // Step 5: Determine user role
      const userRole = effectiveMenteeId === input.userId ? 'mentee' : 'mentor';


      // Step 6: Create cancellation log first (before touching session status)
      const cancellationLog = await this.createCancellationLog(
        session,
        input,
        refundCalculation,
        userRole
      );

      // Step 7: Initiate refund with payment gateway if eligible
      let transactionId: string | undefined;
      // bookings[].status schema enum mein 'refunded' nahi hai, sirf top-level status
      // aur payment.status mein hai. Booking-array status hamesha 'cancelled' rehta hai;
      // refund state payment.status aur top-level session status se track hota hai.
      let bookingStatus: string = BookingStatus.CANCELLED;
      let sessionStatus: string = BookingStatus.CANCELLED;
      let paymentUpdate: any = {
        'cancellation.cancelledBy': input.userId,
        'cancellation.cancelledAt': new Date(),
        'cancellation.reason': input.reason,
        'cancellation.refundEligible': refundCalculation.refundEligible,
      };

      if (refundCalculation.refundEligible && refundCalculation.refundAmount > 0) {
        transactionId = await this.initiateRefundTransaction(
          session,
          refundCalculation.refundAmount,
          targetBooking
        );

        // Single atomic update
        sessionStatus = BookingStatus.REFUNDED;
        paymentUpdate = {
          ...paymentUpdate,
          'payment.status': PaymentStatus.REFUNDED,
          'payment.refundAmount': refundCalculation.refundAmount,
          'payment.refundedAt': new Date(),
          'payment.refundReason': input.reason,
        };

        cancellationLog.refundStatus = 'processing';
        cancellationLog.refundTransactionId = transactionId;
        await cancellationLog.save();
      }

      // Check if there are other active bookings in this session
      const targetBookingId = (targetBooking as any)?._id?.toString();
      const hasOtherActiveBookings = session.bookings?.some(
        (b: any) => b._id?.toString() !== targetBookingId && b.status !== 'cancelled'
      );

      const updateFields: any = {
        ...paymentUpdate,
      };

      // If there are no other active bookings (or 1-on-1 session), update top-level status as well
      if (!hasOtherActiveBookings) {
        updateFields.status = sessionStatus;
        updateFields.isBooked = false;
      }

      if (input.bookingId && targetBooking) {
        await SessionMentor.findByIdAndUpdate(
          session._id,
          {
            $set: {
              'bookings.$[elem].status': bookingStatus,
              ...updateFields,
            },
          },
          {
            runValidators: true,
            arrayFilters: [{ 'elem._id': (targetBooking as any)._id }],
          }
        );
      } else {
        await SessionMentor.findByIdAndUpdate(
          session._id,
          {
            $set: {
              status: sessionStatus,
              isBooked: false,
              ...updateFields,
            },
          },
          { runValidators: true }
        );
      }

      // Step 8: Send notifications (non-critical - failure does not throw)
      // Cancelled booking ka availability slot wapas free karo
      if (targetBooking?.availabilityId && targetBooking?.slotTime) {
        try {
          const [releaseStart, releaseEnd] = String(targetBooking.slotTime)
            .split(' - ')
            .map((t: string) => t.trim());
          await availabilityService.releaseRange(targetBooking.availabilityId, releaseStart, releaseEnd);
        } catch (releaseErr: any) {
          logger.warn(`Slot release failed after cancellation: ${releaseErr.message}`);
        }
      }

      await this.sendRefundNotifications(session, refundCalculation, input.reason, effectiveMenteeId, input.userId);

      // Step 9: Mark notifications sent in log
      try {
        cancellationLog.mentorNotified = true;
        cancellationLog.menteeNotified = true;
        cancellationLog.notificationsSentAt = new Date();
        await cancellationLog.save();
      } catch (logErr: any) {
        logger.warn(`Failed to update notificationsSentAt in cancellationLog: ${logErr.message}`);
      }

      logger.info(`Refund processed successfully for session: ${input.sessionId}`);

      return {
        success: true,
        refundAmount: refundCalculation.refundAmount,
        refundPercentage: refundCalculation.refundPercentage,
        refundEligible: refundCalculation.refundEligible,
        refundStatus: refundCalculation.refundEligible ? 'processing' : 'not_applicable',
        transactionId,
        message: refundCalculator.getRefundMessage(refundCalculation),
        cancellationLog,
      };
    } catch (error: any) {
      logger.error(`Refund processing failed: ${error.message}`);
      throw error;
    }
  }


  /**
   * Missed session (mentor ne start nahi kiya / request par respond nahi kiya) ka refund.
   * Hamesha 100%, past-session check nahi lagta. Double-refund atomic claim se rukta hai.
   */
  async processMissedRefund(input: {
    sessionId: string;
    bookingId: string;
    userId: string;
    refundDetails?: { email: string; phone?: string; upiId?: string; note?: string };
  }): Promise<RefundResult> {
    try {
      logger.info(`Processing missed-session refund: ${input.sessionId} / ${input.bookingId}`);

      const session: any = await SessionMentor.findOne({ sessionId: input.sessionId });
      if (!session) throw new NotFoundError('Session');

      const booking: any = session.bookings?.find((b: any) => b._id?.toString() === input.bookingId);
      if (!booking) throw new NotFoundError('Booking');

      const menteeId = booking.menteeId || booking.bookedBy;
      if (menteeId !== input.userId) {
        throw new ForbiddenError('Only the student can request a refund for this booking');
      }
      if (booking.status !== BookingStatus.MISSED) {
        throw new ConflictError('Refund is only available for missed sessions');
      }

      const pricing = booking.pricing?.totalAmount ? booking.pricing : session.pricing;
      const refundAmount = Number(pricing?.totalAmount || 0);
      if (refundAmount <= 0) {
        throw new BadRequestError(
          'This was a free session, so there is nothing to refund. You can reschedule it instead.'
        );
      }

      // Atomic claim: jo pehle claim karega wahi refund karega (double click / 2 tabs safe)
      const claim = await SessionMentor.updateOne(
        {
          sessionId: session.sessionId,
          bookings: { $elemMatch: { _id: booking._id, status: BookingStatus.MISSED } },
        } as any,
        {
          $set: {
            'bookings.$.status': BookingStatus.CANCELLED,
            'bookings.$.refundRequest': {
              email: input.refundDetails?.email || '',
              phone: input.refundDetails?.phone || '',
              upiId: input.refundDetails?.upiId || '',
              note: input.refundDetails?.note || '',
              amount: refundAmount,
              requestedAt: new Date(),
              status: 'pending',
            },
          },
        }
      );
      if (claim.modifiedCount === 0) {
        throw new ConflictError('This booking was already refunded or rescheduled');
      }

      let cancellationLog: any;
      try {
        cancellationLog = await this.createCancellationLog(
          session,
          {
            sessionId: input.sessionId,
            userId: input.userId,
            reason: 'Session missed: mentor did not start the session',
            cancellationCategory: 'other',
          },
          {
            hoursBeforeSession: 0,
            withinPolicy: true,
            refundEligible: true,
            refundPercentage: 100,
            refundAmount,
          },
          'mentee'
        );
      } catch (logErr) {
        // Paisa abhi nahi gaya, isliye claim wapas missed kar do taaki student dobara try kar sake
        await SessionMentor.updateOne(
          {
            sessionId: session.sessionId,
            bookings: { $elemMatch: { _id: booking._id, status: BookingStatus.CANCELLED } },
          } as any,
          { $set: { 'bookings.$.status': BookingStatus.MISSED } }
        ).catch(() => undefined);
        throw logErr;
      }

      // Yahan se paisa move hota hai, isliye ab revert nahi karte (double refund ka risk)
      const transactionId = await this.initiateRefundTransaction(
        session,
        refundAmount,
        booking,
        MISSED_REFUND_MANUAL_ONLY
      );
      cancellationLog.refundStatus = 'processing';
      cancellationLog.refundTransactionId = transactionId;
      await cancellationLog.save();

      // Admin panel ke liye: gateway se gaya to auto-refunded, warna admin ko manually dena hai
      const isManualRefund = String(transactionId).startsWith('REFUND_MANUAL');
      try {
        await SessionMentor.updateOne(
          { sessionId: session.sessionId, 'bookings._id': booking._id } as any,
          {
            $set: {
              'bookings.$.refundRequest.refundMode': isManualRefund ? 'manual' : 'gateway',
              'bookings.$.refundRequest.transactionId': transactionId,
              ...(isManualRefund
                ? {}
                : {
                    'bookings.$.refundRequest.status': 'refunded',
                    'bookings.$.refundRequest.refundedAt': new Date(),
                    'bookings.$.refundRequest.reference': transactionId,
                  }),
            },
          } as any
        );
      } catch (rrErr: any) {
        logger.error(`Missed refund: refundRequest update failed: ${rrErr.message}`);
      }

      // Refund ho raha hai to mentor ka held payout cancel karo, warna admin galti se release kar sakta hai
      try {
        const gatewayPaymentId = booking?.payment?.gatewayPaymentId;
        if (gatewayPaymentId) {
          await MentorshipPayment.updateOne(
            { razorpayPaymentId: gatewayPaymentId, 'payout.status': PayoutStatus.HELD },
            { $set: { 'payout.status': PayoutStatus.CANCELLED } }
          );
        }
      } catch (payoutErr: any) {
        logger.error(`Missed refund: payout cancel failed: ${payoutErr.message}`);
      }




      try {
        const otherActive = (session.bookings || []).some(
          (b: any) =>
            b._id?.toString() !== input.bookingId &&
            ['pending', 'confirmed', 'rescheduled', 'in_progress'].includes(b.status)
        );
        const $set: any = {
          'payment.status': PaymentStatus.REFUNDED,
          'payment.refundAmount': refundAmount,
          'payment.refundedAt': new Date(),
          'payment.refundReason': 'Session missed',
        };
        if (!otherActive) {
          // Reusable service: keep it bookable for other students instead of marking the whole session refunded
          $set.status = BookingStatus.PENDING;
          $set.isBooked = false;
        }
        await SessionMentor.updateOne({ _id: session._id }, { $set });
      } catch (updErr: any) {
        logger.error(`Missed refund: session update failed after refund ${transactionId}: ${updErr.message}`);
      }

      NotificationService.sendNotification({
        userId: input.userId,
        module: 'industry-mentor',
        type: NotificationType.REFUND_PROCESSED,
        channels: isManualRefund
          ? [NotificationChannel.IN_APP]
          : [NotificationChannel.IN_APP, NotificationChannel.EMAIL],        
        data: {
          title: 'Refund initiated',
          message: isManualRefund
            ? `Your refund of ₹${refundAmount} for "${session.title}" has been received. Our team will send it to your UPI/bank shortly and you will be notified.`
            : `A full refund of ₹${refundAmount} for "${session.title}" has been initiated. It usually reflects in 3-5 business days.`,
          refundAmount,
          sessionId: session.sessionId,
        },
      }).catch((e) => logger.error('Notification failed (missed refund):', e));

      // Manual mode: send our own email so the student does not get the "3-5 business days" gateway text
      if (isManualRefund && input.refundDetails?.email) {
        const safeTitle = String(session.title || 'your session').replace(/[<>&"']/g, '');
        emailService
          .sendEmail({
            to: input.refundDetails.email,
            subject: 'We received your refund request',
            html: `
              <h2>Refund request received</h2>
              <p>We have received your refund request of <strong>₹${refundAmount}</strong> for <strong>${safeTitle}</strong>.</p>
              <p>Our team will send the amount to your UPI/bank account shortly. You will get another email once it is sent.</p>
            `,
          })
          .catch((e: any) => logger.warn(`Student email failed (missed refund): ${e?.message}`));
      }
                // Mentor ko sirf info: student ki contact details mentor ko nahi dikhani, refund admin dega
      try {
        const missedMentorDoc = await Mentor.findOne({ mentorId: session.mentorId, isDeleted: false });
        if (missedMentorDoc?.userId) {
          NotificationService.sendNotification({
            userId: missedMentorDoc.userId,
        module: 'industry-mentor',
            type: NotificationType.SESSION_CANCELLED,
            channels: [NotificationChannel.IN_APP],
            data: {
              menteeId: input.userId,
              title: 'Refund issued - Missed Session',
              message: `The student is being refunded ₹${refundAmount} for the missed session "${session.title}". No action is needed from you.`,
              sessionId: session.sessionId,
              bookingId: input.bookingId,
              refundAmount,
            },
          }).catch((e) => logger.error('Notification failed (missed refund -> mentor):', e));
        }
      } catch (mentorNotifErr: any) {
        logger.warn(`Mentor notification failed (missed refund): ${mentorNotifErr.message}`);
      }

      // Admin ko in-app + email (best-effort)
      this.notifyAdminsOfRefundRequest({
        session,
        bookingId: input.bookingId,
        menteeId: input.userId,
        refundAmount,
        refundDetails: input.refundDetails,
        isManual: isManualRefund,
      }).catch((e: any) => logger.warn(`Admin notification failed (missed refund): ${e?.message}`));


      
      return {
        success: true,
        refundAmount,
        refundPercentage: 100,
        refundEligible: true,
        refundStatus: 'processing',
        transactionId,
        message: `Full refund of ₹${refundAmount} initiated.`,
        cancellationLog,
      };
    } catch (error: any) {
      logger.error(`Missed refund failed: ${error.message}`);
      throw error;
    }
  }


     /**
   * Admin "Proceed to Pay": student ki UPI ID par RazorpayX payout bhejta hai.
   * Idempotency key booking id se banti hai, isliye double click par double payment nahi hoga.
   */
  async payMissedRefundViaPayout(input: {
    sessionId: string;
    bookingId: string;
  }): Promise<{ payoutId: string; utr?: string; status: string }> {
    const session: any = await SessionMentor.findOne({ sessionId: input.sessionId });
    if (!session) throw new NotFoundError('Session');

    const booking: any = session.bookings?.find((b: any) => b._id?.toString() === input.bookingId);
    if (!booking) throw new NotFoundError('Booking');

    const rr = booking.refundRequest;
    if (!rr) throw new NotFoundError('Refund request');
    if (rr.status !== 'pending') throw new ConflictError('Refund is already processed');
    if (!rr.upiId) throw new BadRequestError('Student did not provide a UPI ID');

    const accountNumber = process.env.RAZORPAYX_ACCOUNT_NUMBER;
    const keyId = process.env.RAZORPAY_KEY_ID;
    const keySecret = process.env.RAZORPAY_KEY_SECRET;
    const missing = [
      !accountNumber && 'RAZORPAYX_ACCOUNT_NUMBER',
      !keyId && 'RAZORPAY_KEY_ID',
      !keySecret && 'RAZORPAY_KEY_SECRET',
    ].filter(Boolean);
    if (missing.length > 0) {
      logger.error(`RazorpayX payout config missing: ${missing.join(', ')}`);
      throw new BadRequestError(`RazorpayX not configured. Missing env: ${missing.join(', ')}`);
    }

    const auth = 'Basic ' + Buffer.from(`${keyId}:${keySecret}`).toString('base64');
    const call = async (path: string, body: any, extraHeaders: Record<string, string> = {}) => {
      if (typeof fetch !== 'function') {
        throw new ExternalServiceError('Razorpay', 'Server Node version does not support fetch (need Node 18+)');
      }
      let res: Response;
      try {
        res = await fetch(`https://api.razorpay.com/v1/${path}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: auth, ...extraHeaders },
          body: JSON.stringify(body),
        });
      } catch (netErr: any) {
        logger.error(`Razorpay ${path} network error: ${netErr?.message}`);
        throw new ExternalServiceError('Razorpay', `Could not reach Razorpay (${path}): ${netErr?.message}`);
      }
      const json: any = await res.json().catch(() => ({}));
      if (!res.ok) {
        logger.error(`Razorpay ${path} failed (${res.status}): ${JSON.stringify(json)}`);
        throw new BadRequestError(
          `Razorpay ${path}: ${json?.error?.description || json?.error?.code || `HTTP ${res.status}`}`
        );
      }
      return json;
    };

    const menteeUser: any = await User.findByUserId(booking.menteeId || booking.bookedBy);
    const studentName = menteeUser?.fullName || 'Student';

    const contact = await call('contacts', {
      name: studentName,
      email: rr.email || undefined,
      contact: rr.phone || undefined,
      type: 'customer',
      reference_id: String(booking._id),
    });

    const fundAccount = await call('fund_accounts', {
      contact_id: contact.id,
      account_type: 'vpa',
      vpa: { address: rr.upiId },
    });

    const payout = await call(
      'payouts',
      {
        account_number: accountNumber,
        fund_account_id: fundAccount.id,
        amount: Math.round(Number(rr.amount) * 100), // paise
        currency: 'INR',
        mode: 'UPI',
        purpose: 'refund',
        queue_if_low_balance: false,
        reference_id: String(booking._id),
        narration: 'Throne8 session refund',
      },

      
      { 'X-Payout-Idempotency': `missed_refund_${booking._id}` }
    );

    if (['rejected', 'cancelled', 'failed', 'reversed'].includes(String(payout.status))) {
      throw new BadRequestError(`Payout ${payout.status}. Please check the UPI ID and RazorpayX balance.`);
    }

    await SessionMentor.updateOne(
      { sessionId: session.sessionId, 'bookings._id': booking._id } as any,
      {
        $set: {
          'bookings.$.refundRequest.status': 'refunded',
          'bookings.$.refundRequest.refundedAt': new Date(),
          'bookings.$.refundRequest.reference': payout.utr || payout.id,
          'bookings.$.refundRequest.transactionId': payout.id,
          'bookings.$.refundRequest.refundMode': 'gateway',
        },
      } as any
    );

        // Student ko batao ki refund bhej diya gaya (best-effort, fail hone par payout par asar nahi)
        NotificationService.sendNotification({
          userId: String(booking.menteeId || booking.bookedBy),
          type: NotificationType.REFUND_PROCESSED,
          channels: [NotificationChannel.IN_APP, NotificationChannel.EMAIL],
          data: {
            title: 'Refund sent',
            message: `Your refund of ₹${rr.amount} for "${session.title}" has been sent to your UPI ID ${rr.upiId}. It should reflect in your account shortly.`,
            refundAmount: rr.amount,
            sessionId: session.sessionId,
          },
        }).catch((e) => logger.error('Notification failed (refund paid -> student):', e));
    
        return { payoutId: payout.id, utr: payout.utr || undefined, status: payout.status };
  }

    /**
   * Missed-session refund request par saare admins ko in-app + email bhejo.
   */
    private async notifyAdminsOfRefundRequest(p: {
      session: any;
      bookingId: string;
      menteeId: string;
      refundAmount: number;
      refundDetails?: { email: string; phone?: string; upiId?: string; note?: string };
      isManual: boolean;
    }): Promise<void> {
      const rd = p.refundDetails;
      const admins: any[] = await (User as any).find({ role: 'admin' }).lean();
      const { name: menteeName } = await NotificationService.resolveActorDisplay(p.menteeId);
  
      const contact = [
        rd?.email ? `Email: ${rd.email}` : '',
        rd?.phone ? `Phone: ${rd.phone}` : '',
        rd?.upiId ? `UPI: ${rd.upiId}` : '',
      ]
        .filter(Boolean)
        .join(' | ');
  
      const title = p.isManual
        ? 'Refund Required - Missed Session'
        : 'Refund Auto-processed - Missed Session';
      const message = (
        p.isManual
          ? `${menteeName} requested a refund of ₹${p.refundAmount} for missed session "${p.session.title}". Please pay the student. ${contact}${rd?.note ? ` | Note: ${rd.note}` : ''}`
          : `Refund of ₹${p.refundAmount} for missed session "${p.session.title}" was sent to ${menteeName} via payment gateway. No action needed.`
      ).slice(0, 1000);
  
      for (const admin of admins) {
        const adminUserId = String(admin.userId || admin._id);
        NotificationService.sendNotification({
          userId: adminUserId,
        module: 'industry-mentor',
          type: NotificationType.REFUND_PROCESSED,
          channels: [NotificationChannel.IN_APP],
          data: {
            title,
            message,
            sessionId: p.session.sessionId,
            bookingId: p.bookingId,
            refundAmount: p.refundAmount,
            refundDetails: rd || null,

            requiresManualPayout: p.isManual,
            link: '/mentorship/admin?tab=refunds',
            actionUrl: '/mentorship/admin?tab=refunds',
          },
        }).catch((e) => logger.error('Notification failed (missed refund -> admin):', e));
      }
  
      const esc = (v?: string) =>
        String(v ?? '').replace(/[&<>"']/g, (c) =>
          ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' } as Record<string, string>)[c]
        );
      const emails = Array.from(
        new Set([...admins.map((a) => a.email), process.env.ADMIN_NOTIFY_EMAIL].filter(Boolean))
      ) as string[];
  
      if (emails.length > 0) {
        await emailService.sendEmail({
          to: emails,
          subject: p.isManual ? 'Action needed: student refund (missed session)' : 'Refund auto-processed (missed session)',
          html: `
            <h2>${esc(title)}</h2>
            <p>Session: <strong>${esc(p.session.title)}</strong></p>
            <p>Student: <strong>${esc(menteeName)}</strong></p>
            <p>Amount: <strong>₹${p.refundAmount}</strong></p>
            <ul>
              <li>Email: ${esc(rd?.email)}</li>
              ${rd?.phone ? `<li>Phone: ${esc(rd.phone)}</li>` : ''}
              ${rd?.upiId ? `<li>UPI ID: ${esc(rd.upiId)}</li>` : ''}
              ${rd?.note ? `<li>Note: ${esc(rd.note)}</li>` : ''}
            </ul>
            <p>${p.isManual ? 'Open Admin Panel → Refunds, then click "Proceed to Pay" to pay the student.' : 'No action needed.'}</p>
          `,
        });
      }
    }
  
    /**
     * Validate if session can be cancelled
     */
  private validateCancellation(
    session: any,
    userId: string,
    effectiveMenteeId?: string,
    mentorUserId?: string,
    effectiveScheduledAt?: Date
  ): void {
    const menteeIdToCheck = effectiveMenteeId ?? session.menteeId;
    if (menteeIdToCheck !== userId && mentorUserId !== userId) {
      throw new ForbiddenError('You are not authorized to cancel this session');
    }

    if (session.status === BookingStatus.CANCELLED || session.status === BookingStatus.REFUNDED) {
      throw new ConflictError('Session is already cancelled');
    }

    if (session.status === BookingStatus.COMPLETED) {
      throw new ConflictError('Cannot cancel a completed session');
    }

    if (session.status === BookingStatus.IN_PROGRESS) {
      throw new ConflictError('Cannot cancel a session that is in progress');
    }

    const dateToCheck = effectiveScheduledAt ?? session.scheduledAt;
    if (dateToCheck && new Date(dateToCheck) < new Date()) {
      throw new ConflictError('Cannot cancel a past session');
    }
  }

  /**
   * Create cancellation log entry
   */
  private async createCancellationLog(
    session: any,
    input: RefundInput,
    refundCalculation: any,
    userRole: 'mentor' | 'mentee'
  ): Promise<any> {
    const cancellationLog = await CancellationLog.create({
      sessionId: session.sessionId || session._id.toString(),
      cancelledBy: input.userId,
      cancelledByRole: userRole,
      sessionType: session.sessionType,
      scheduledAt: session.scheduledAt,
      timezone: session.timezone || 'UTC',
      sessionPrice: session.pricing?.totalAmount ?? 0,
      reason: input.reason,
      cancellationCategory: input.cancellationCategory || 'other',
      additionalNotes: input.additionalNotes,
      hoursBeforeSession: refundCalculation.hoursBeforeSession ?? 0,
      withinPolicy: refundCalculation.withinPolicy ?? false,
      refundEligible: refundCalculation.refundEligible ?? false,
      refundPercentage: refundCalculation.refundPercentage ?? 0,
      refundAmount: refundCalculation.refundAmount ?? 0,
      refundStatus: refundCalculation.refundEligible ? 'pending' : 'not_applicable',
      cancelledAt: new Date(),
    });

    logger.info(`Cancellation log created: ${cancellationLog._id}`);
    return cancellationLog;
  }

  /**
   * Initiate refund with Razorpay.
   * gatewayPaymentId booking-level payment se aata hai (fallback: session-level).
   *
   * Razorpay refund docs: https://razorpay.com/docs/api/refunds/
   */
  private async initiateRefundTransaction(
    session: any,
    refundAmount: number,
    booking?: any,
    forceManual = false
  ): Promise<string> {
    const sessionKey = String(session.sessionId || session._id);

    // Admin pays the student manually (UPI) and then clicks Mark Refunded
    if (forceManual) {
      const manualId = `REFUND_MANUAL_${Date.now()}_${sessionKey}`;
      logger.info(`Manual refund queued for admin: ${manualId} - amount: Rs.${refundAmount}`);
      return manualId;
    }

    // Booking pass nahi hui (retry flow) to pehli paid booking le lo
    const targetBooking =
      booking || (session.bookings || []).find((b: any) => b.payment?.gatewayPaymentId);

    const gatewayPaymentId =
      targetBooking?.payment?.gatewayPaymentId || session.payment?.gatewayPaymentId;

    if (!gatewayPaymentId) {
      logger.warn(`No gateway payment ID for session ${sessionKey}. Queuing for manual refund.`);
      const pendingId = `REFUND_MANUAL_${Date.now()}_${sessionKey}`;
      logger.warn(`Manual refund queued: ${pendingId} - amount: Rs.${refundAmount}`);
      return pendingId;
    }

    try {
      const refund = await getRazorpay().payments.refund(gatewayPaymentId, {
        amount: Math.round(refundAmount * 100), // Razorpay expects paise (integer)
        speed: 'normal',
        notes: {
          sessionId: sessionKey,
          reason: 'User cancellation via platform',
        },
      });

      logger.info(`Razorpay refund initiated: ${refund.id} for Rs.${refundAmount}`);
      return refund.id;
    } catch (error: any) {
      // Razorpay/config failure se poori cancellation 500 na ho. Manual refund queue mein
      // daal do; session cancel ho jayega aur admin baad mein refund process karega.
      logger.error(`Razorpay refund failed, falling back to manual queue: ${error.message}`);
      const pendingId = `REFUND_MANUAL_FALLBACK_${Date.now()}_${sessionKey}`;
      logger.warn(`Manual refund queued after Razorpay failure: ${pendingId} - amount: Rs.${refundAmount}`);
      return pendingId;
    }
  }



  /**
   * Send refund notifications to both parties (non-critical)
   */
  private async sendRefundNotifications(
    session: any,
    refundCalculation: any,
    reason: string,
    menteeId?: string,
    cancelledByUserId?: string
  ): Promise<void> {
    try {
      logger.info('Sending refund notifications');

      // session.mentorId Mentor-profile id hai, auth userId nahi -
      // mentor ka real userId pehle resolve karo (processRefund jaisa hi pattern).
      const mentorDoc = await Mentor.findOne({ mentorId: session.mentorId, isDeleted: false });

      const [mentee, mentor] = await Promise.all([
        User.findByUserId(menteeId || session.menteeId),
        mentorDoc?.userId ? User.findByUserId(mentorDoc.userId) : Promise.resolve(null),
      ]);



      if (!mentee || !mentor) {
        logger.warn('Mentee or Mentor user not found for notifications', {
          menteeId: session.menteeId,
          mentorId: session.mentorId,
        });
        return;
      }

      const scheduledAtFormatted = session.scheduledAt.toLocaleString('en-IN', {
        dateStyle: 'medium',
        timeStyle: 'short',
      });

      // Email to mentee
      await emailService.sendEmail({
        to: mentee.email,
        subject: `Session Cancelled - ${session.sessionType}`,
        html: emailTemplates.cancellationConfirmationTemplate({
          userName: mentee.fullName || mentee.email,
          mentorName: mentor.fullName || mentor.email,
          sessionType: session.sessionType,
          scheduledAt: scheduledAtFormatted,
          reason,
          refundAmount: refundCalculation.refundAmount,
          refundPercentage: refundCalculation.refundPercentage,
          refundStatus: refundCalculation.refundEligible ? 'Processing' : 'Not Applicable',
          refundEligible: refundCalculation.refundEligible,
        }),
      });

      // SMS to mentee
      if (mentee.phoneNumber) {
        const smsMessage = smsTemplates.cancellationConfirmation({
          sessionType: session.sessionType,
          scheduledTime: scheduledAtFormatted,
          refundAmount: refundCalculation.refundAmount,
          refundPercentage: refundCalculation.refundPercentage,
        });
        await smsService.sendSMS({ to: mentee.phoneNumber, message: smsMessage });
      }

      // Email to mentor
      await emailService.sendEmail({
        to: mentor.email,
        subject: `Session Cancelled - ${session.sessionType}`,
        html: emailTemplates.mentorSessionCancelledTemplate({
          mentorName: mentor.fullName || mentor.email,
          menteeName: mentee.fullName || mentee.email,
          sessionType: session.sessionType,
          scheduledAt: scheduledAtFormatted,
          reason,
          compensationAmount: refundCalculation.mentorPayout,
        }),
      });

      // SMS to mentor
      if (mentor.phoneNumber) {
        const mentorSmsMessage = smsTemplates.mentorCancellationNotification({
          menteeName: mentee.fullName || mentee.email,
          sessionType: session.sessionType,
          scheduledTime: scheduledAtFormatted,
          compensationAmount: refundCalculation.mentorPayout,
        });
        await smsService.sendSMS({ to: mentor.phoneNumber, message: mentorSmsMessage });
      }

      // Pata karo asal mein cancel kisne kiya, taaki notification
      // (a) doosri party ko jaye, canceller ko wapas nahi, aur
      // (b) cancel karne wale ka naam sahi dikhe.
      const cancelledByMentee = cancelledByUserId === mentee.userId;
      const cancellerName = cancelledByMentee
        ? (mentee.fullName || mentee.email)
        : (mentor.fullName || mentor.email);

      if (cancelledByMentee) {
        // Mentee cancelled -> notify the mentor only
        NotificationService.sendNotification({
          userId: mentor.userId,
        module: 'industry-mentor',
          type: NotificationType.SESSION_CANCELLED,
          channels: [NotificationChannel.IN_APP],
          data: {
            title: 'Session Cancelled',
            message: `${cancellerName} cancelled the "${session.sessionType}" session. Reason: ${reason}`,
          },
        }).catch((e) => logger.error('In-app notification failed (refund -> mentor):', e));
      } else {
        // Mentor cancelled -> notify the mentee only
        NotificationService.sendNotification({
          userId: mentee.userId,
        module: 'industry-mentor',
          type: NotificationType.SESSION_CANCELLED,
          channels: [NotificationChannel.IN_APP],
          data: {
            title: refundCalculation.refundEligible ? 'Session Cancelled - Refund Processing' : 'Session Cancelled',
            message: refundCalculation.refundEligible
              ? `${cancellerName} cancelled your "${session.sessionType}" session. Reason: ${reason}. A refund of ₹${refundCalculation.refundAmount} is being processed.`
              : `${cancellerName} cancelled your "${session.sessionType}" session. Reason: ${reason}`,
          },
        }).catch((e) => logger.error('In-app notification failed (refund -> mentee):', e));
      }

      logger.info('Refund notifications sent successfully');
    } catch (error: any) {
      // Non-critical - log but do not throw
      logger.error(`Failed to send refund notifications: ${error.message}`);
    }
  }

  /**
   * Complete refund after payment gateway confirmation webhook
   */
  async completeRefund(
    cancellationLogId: string,
    transactionId: string
  ): Promise<void> {
    try {
      logger.info(`Completing refund for cancellation: ${cancellationLogId}`);

      const cancellationLog = await CancellationLog.findById(cancellationLogId);
      if (!cancellationLog) {
        throw new Error('Cancellation log not found');
      }

      cancellationLog.refundStatus = 'completed';
      cancellationLog.refundTransactionId = transactionId;
      cancellationLog.refundProcessedAt = new Date();
      await cancellationLog.save();

      const session = await SessionMentor.findOne({ sessionId: cancellationLog.sessionId });
      if (session) {
        const mentee = await User.findByUserId(session.menteeId);

        if (!mentee) {
          logger.warn('Mentee not found for refund completion email', {
            menteeId: session.menteeId,
          });
          return;
        }

        await emailService.sendEmail({
          to: mentee.email,
          subject: 'Refund Processed Successfully',
          html: emailTemplates.refundProcessedTemplate({
            userName: mentee.fullName || mentee.email,
            sessionType: cancellationLog.sessionType,
            refundAmount: cancellationLog.refundAmount,
            transactionId,
            processedAt: new Date().toLocaleString('en-IN'),
            expectedCreditDays: 5,
          }),
        });

        if (mentee.phoneNumber) {
          const smsMessage = smsTemplates.refundProcessed({
            refundAmount: cancellationLog.refundAmount,
            transactionId,
            expectedDays: 5,
          });
          await smsService.sendSMS({ to: mentee.phoneNumber, message: smsMessage });
        }
      }

      logger.info('Refund completed successfully');
    } catch (error: any) {
      logger.error(`Failed to complete refund: ${error.message}`);
      throw error;
    }
  }

  /**
   * Handle failed refund
   */
  async handleFailedRefund(cancellationLogId: string): Promise<void> {
    try {
      logger.error(`Refund failed for cancellation: ${cancellationLogId}`);

      const cancellationLog = await CancellationLog.findById(cancellationLogId);
      if (!cancellationLog) {
        throw new Error('Cancellation log not found');
      }

      cancellationLog.refundStatus = 'failed';
      await cancellationLog.save();

      const session = await SessionMentor.findOne({ sessionId: cancellationLog.sessionId });
      if (session) {
        const mentee = await User.findByUserId(session.menteeId);
        if (!mentee) {
          logger.warn('Mentee not found for failed refund notification', {
            menteeId: session.menteeId,
          });
          return;
        }

        if (mentee.phoneNumber) {
          const smsMessage = smsTemplates.refundFailed(cancellationLog.refundAmount);
          await smsService.sendSMS({ to: mentee.phoneNumber, message: smsMessage });
        }
      }

      logger.info('Failed refund logged and notifications sent');
    } catch (error: any) {
      logger.error(`Failed to handle refund failure: ${error.message}`);
    }
  }

  /**
   * Get refund status
   */
  async getRefundStatus(cancellationLogId: string): Promise<{
    status: string;
    refundAmount: number;
    refundPercentage: number;
    transactionId?: string;
    processedAt?: Date;
  }> {
    const cancellationLog = await CancellationLog.findById(cancellationLogId);
    if (!cancellationLog) {
      throw new Error('Cancellation log not found');
    }

    return {
      status: cancellationLog.refundStatus,
      refundAmount: cancellationLog.refundAmount,
      refundPercentage: cancellationLog.refundPercentage,
      transactionId: cancellationLog.refundTransactionId,
      processedAt: cancellationLog.refundProcessedAt,
    };
  }

  /**
   * Get pending refunds (admin dashboard)
   */
  async getPendingRefunds(limit: number = 50, skip: number = 0) {
    return await CancellationLog.find({
      refundEligible: true,
      refundStatus: { $in: ['pending', 'processing'] },
    })
      .sort({ cancelledAt: 1 })
      .skip(skip)
      .limit(limit)
      .lean();
  }

  /**
   * Retry failed refund
   */
  async retryFailedRefund(cancellationLogId: string): Promise<void> {
    try {
      logger.info(`Retrying failed refund: ${cancellationLogId}`);

      const cancellationLog = await CancellationLog.findById(cancellationLogId);
      if (!cancellationLog) {
        throw new Error('Cancellation log not found');
      }

      if (cancellationLog.refundStatus !== 'failed') {
        throw new Error('Can only retry failed refunds');
      }

      const session = await SessionMentor.findOne({ sessionId: cancellationLog.sessionId });
      if (!session) {
        throw new Error('Session not found');
      }

      const transactionId = await this.initiateRefundTransaction(
        session,
        cancellationLog.refundAmount
      );

      cancellationLog.refundStatus = 'processing';
      cancellationLog.refundTransactionId = transactionId;
      await cancellationLog.save();

      logger.info('Refund retry initiated successfully');
    } catch (error: any) {
      logger.error(`Refund retry failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get refund analytics
   */
  async getRefundAnalytics(startDate: Date, endDate: Date) {
    const analytics = await CancellationLog.aggregate([
      {
        $match: {
          cancelledAt: { $gte: startDate, $lte: endDate },
        },
      },
      {
        $group: {
          _id: null,
          totalCancellations: { $sum: 1 },
          totalRefunds: { $sum: '$refundAmount' },
          averageRefund: { $avg: '$refundAmount' },
          withinPolicy: { $sum: { $cond: ['$withinPolicy', 1, 0] } },
          byMentor: {
            $sum: { $cond: [{ $eq: ['$cancelledByRole', 'mentor'] }, 1, 0] },
          },
          byMentee: {
            $sum: { $cond: [{ $eq: ['$cancelledByRole', 'mentee'] }, 1, 0] },
          },
          refundsCompleted: {
            $sum: { $cond: [{ $eq: ['$refundStatus', 'completed'] }, 1, 0] },
          },
        },
      },
    ]);

    return (
      analytics[0] || {
        totalCancellations: 0,
        totalRefunds: 0,
        averageRefund: 0,
        withinPolicy: 0,
        byMentor: 0,
        byMentee: 0,
        refundsCompleted: 0,
      }
    );
  }

  /**
   * Estimate refund for UI preview (before cancellation)
   */
  estimateRefundAmount(totalAmount: number, scheduledAt: Date) {
    return refundCalculator.estimateRefund(totalAmount, scheduledAt);
  }
}

export default new RefundService();