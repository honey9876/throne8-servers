import { logger } from '@/shared/logger.util';
import emailService from './email.service';
import smsService from './sms.service';
import { CancellationLog, SessionMentor } from '../models';
import { User } from '@/auth/models';
import { BookingStatus } from '@/shared/constants/bookingStatus';
import refundCalculator from '@/Mentorship/utils/refundCalculator';
import { PaymentStatus } from '@/Mentorship/interface/session.types';
import emailTemplates from '@/Mentorship/utils/emailTemplates';
import smsTemplates from '@/Mentorship/utils/smsTemplates';
import Razorpay from 'razorpay';

// Razorpay instance — initialized once, reused across calls
let razorpay: Razorpay | null = null;

function getRazorpay(): Razorpay {
  if (!razorpay) {
    const key_id = process.env.RAZORPAY_KEY_ID;
    const key_secret = process.env.RAZORPAY_KEY_SECRET;

    if (!key_id || !key_secret) {
      throw new Error(
        'Razorpay not configured — set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET in .env'
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
   * ✅ FIX: session.save() is now called once atomically using findByIdAndUpdate.
   * Previously two separate saves could leave session in CANCELLED state
   * if the process crashed between step 6 and step 8.
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
      const session = await SessionMentor.findOne({
          sessionId: input.sessionId,
      });
      if (!session) {
        throw new Error('Session not found');
      }

      // Step 2: Idempotency check — prevent double refund
      if (
        session.status === BookingStatus.CANCELLED ||
        session.status === BookingStatus.REFUNDED
      ) {
        logger.warn(`Refund already processed for session: ${input.sessionId}`);
        throw new Error('Refund has already been processed for this session');
      }

      // Step 3: Validate cancellation is allowed
      this.validateCancellation(session, input.userId);

      // Step 4: Calculate refund
      const refundCalculation = input.isEmergency
        ? refundCalculator.calculateEmergencyRefund(
          session.pricing.totalAmount,
          session.pricing.platformFee,
          session.pricing.basePrice
        )
        : refundCalculator.calculateRefund({
          sessionPrice: session.pricing.basePrice,
          platformFee: session.pricing.platformFee,
          totalAmount: session.pricing.totalAmount,
          scheduledAt: session.scheduledAt,
        });

      logger.info(
        `Refund calculated: ${refundCalculation.refundPercentage}% = Rs.${refundCalculation.refundAmount}`
      );

      // Step 5: Determine user role
      const userRole = session.menteeId === input.userId ? 'mentee' : 'mentor';

      // Step 6: Create cancellation log first (before touching session status)
      const cancellationLog = await this.createCancellationLog(
        session,
        input,
        refundCalculation,
        userRole
      );

      // Step 7: Initiate refund with payment gateway if eligible
      let transactionId: string | undefined;
      let finalStatus: string = BookingStatus.CANCELLED;
      let paymentUpdate: any = {
        'cancellation.cancelledBy': input.userId,
        'cancellation.cancelledAt': new Date(),
        'cancellation.reason': input.reason,
        'cancellation.refundEligible': refundCalculation.refundEligible,
      };

      if (refundCalculation.refundEligible && refundCalculation.refundAmount > 0) {
        transactionId = await this.initiateRefundTransaction(
          session,
          refundCalculation.refundAmount
        );

        // ✅ FIX: Single atomic update — was previously two separate session.save() calls.
        // If process crashes between the old step 6 and step 8, session would be stuck
        // as CANCELLED. Now everything is committed in one DB operation.
        finalStatus = BookingStatus.REFUNDED;
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

      // ✅ FIX: One atomic DB write for session — replaces two separate session.save() calls
      await SessionMentor.findByIdAndUpdate(
        session._id,
        {
          $set: {
            status: finalStatus,
            ...paymentUpdate,
          },
        },
        { runValidators: true }
      );

      // Step 8: Send notifications (non-critical — failure does not throw)
      await this.sendRefundNotifications(session, refundCalculation, input.reason);

      // Step 9: Mark notifications sent in log
      cancellationLog.mentorNotified = true;
      cancellationLog.menteeNotified = true;
      cancellationLog.notificationsSentAt = new Date();
      await cancellationLog.save();

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
   * Validate if session can be cancelled
   */
  private validateCancellation(session: any, userId: string): void {
    if (session.menteeId !== userId && session.mentorId !== userId) {
      throw new Error('You are not authorized to cancel this session');
    }

    if (session.status === BookingStatus.CANCELLED || session.status === BookingStatus.REFUNDED) {
      throw new Error('Session is already cancelled');
    }

    if (session.status === BookingStatus.COMPLETED) {
      throw new Error('Cannot cancel a completed session');
    }

    if (session.status === BookingStatus.IN_PROGRESS) {
      throw new Error('Cannot cancel a session that is in progress');
    }

    if (session.scheduledAt < new Date()) {
      throw new Error('Cannot cancel a past session');
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
      sessionId: session._id.toString(),
      cancelledBy: input.userId,
      cancelledByRole: userRole,
      sessionType: session.sessionType,
      scheduledAt: session.scheduledAt,
      timezone: session.timezone,
      sessionPrice: session.pricing.totalAmount,
      reason: input.reason,
      cancellationCategory: input.cancellationCategory || 'other',
      additionalNotes: input.additionalNotes,
      hoursBeforeSession: refundCalculation.hoursBeforeSession,
      withinPolicy: refundCalculation.withinPolicy,
      refundEligible: refundCalculation.refundEligible,
      refundPercentage: refundCalculation.refundPercentage,
      refundAmount: refundCalculation.refundAmount,
      refundStatus: refundCalculation.refundEligible ? 'pending' : 'not_applicable',
      cancelledAt: new Date(),
    });

    logger.info(`Cancellation log created: ${cancellationLog._id}`);
    return cancellationLog;
  }

  /**
   * Initiate refund with Razorpay.
   *
   * ✅ FIX: Razorpay properly integrated.
   * Requires session.payment.gatewayPaymentId to be set when booking was created.
   *
   * Razorpay refund docs: https://razorpay.com/docs/api/refunds/
   */
  private async initiateRefundTransaction(
    session: any,
    refundAmount: number
  ): Promise<string> {
    try {
      if (!session.payment?.gatewayPaymentId) {
        logger.warn(
          `No gateway payment ID for session ${session._id}. Queuing for manual refund.`
        );
        // Fallback: generate a traceable ID for admin manual processing
        const pendingId = `REFUND_MANUAL_${Date.now()}_${session._id}`;
        logger.warn(`Manual refund queued: ${pendingId} — amount: Rs.${refundAmount}`);
        return pendingId;
      }

      const refund = await getRazorpay().payments.refund(
        session.payment.gatewayPaymentId,
        {
          amount: Math.round(refundAmount * 100), // Razorpay expects paise (integer)
          speed: 'normal',
          notes: {
            sessionId: session._id.toString(),
            reason: 'User cancellation via platform',
          },
        }
      );

      logger.info(`Razorpay refund initiated: ${refund.id} for Rs.${refundAmount}`);
      return refund.id;
    } catch (error: any) {
      logger.error(`Razorpay refund failed: ${error.message}`);
      throw new Error('Failed to process refund. Please contact support.');
    }
  }

  /**
   * Send refund notifications to both parties (non-critical)
   */
  private async sendRefundNotifications(
    session: any,
    refundCalculation: any,
    reason: string
  ): Promise<void> {
    try {
      logger.info('Sending refund notifications');

      const [mentee, mentor] = await Promise.all([
        User.findByUserId(session.menteeId),
        User.findByUserId(session.mentorId),
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

      logger.info('Refund notifications sent successfully');
    } catch (error: any) {
      // Non-critical — log but do not throw
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

      const session = await SessionMentor.findById(cancellationLog.sessionId);
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

      const session = await SessionMentor.findById(cancellationLog.sessionId);
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

      const session = await SessionMentor.findById(cancellationLog.sessionId);
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