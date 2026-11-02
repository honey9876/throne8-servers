import mongoose from 'mongoose';
import { SessionMentor, Mentor, CancellationLog } from '../models';
import { User } from '@/auth/models';
import { logger } from '@/shared/logger.util';
import NotificationService, { NotificationType, NotificationChannel } from './notification.service';
import { ConflictError, BadRequestError } from '@/shared/errors/app.error';

export type RefundListStatus = 'pending' | 'refunded';

class RefundAdminService {
  async listRefunds(status: RefundListStatus, page: number, limit: number) {
    const skip = (page - 1) * limit;

    const [agg]: any[] = await SessionMentor.aggregate([
      { $match: { 'bookings.refundRequest.status': status } },
      { $unwind: '$bookings' },
      { $match: { 'bookings.refundRequest.status': status } },
      { $sort: { 'bookings.refundRequest.requestedAt': -1 } },
      {
        $facet: {
          rows: [{ $skip: skip }, { $limit: limit }],
          total: [{ $count: 'n' }],
        },
      },
    ]);

    const raw: any[] = agg?.rows || [];
    const total: number = agg?.total?.[0]?.n || 0;

    const nameCache = new Map<string, string>();
    const nameOf = async (userId?: string): Promise<string> => {
      if (!userId) return '—';
      if (nameCache.has(userId)) return nameCache.get(userId)!;
      let name = '—';
      try {
        const u: any = await User.findByUserId(userId);
        name = u?.fullName || u?.email || '—';
      } catch {
        /* ignore */
      }
      nameCache.set(userId, name);
      return name;
    };

    const rows = [];
    for (const r of raw) {
      const b = r.bookings || {};
      const rr = b.refundRequest || {};
      const mentorDoc: any = await Mentor.findOne({ mentorId: r.mentorId });
      rows.push({
        bookingId: String(b._id),
        sessionId: r.sessionId,
        title: r.title,
        scheduledAt: b.scheduledAt || r.scheduledAt,
        mentorName: await nameOf(mentorDoc?.userId),
        menteeName: await nameOf(b.menteeId || b.bookedBy),
        amount: Number(rr.amount ?? b.pricing?.totalAmount ?? 0),
        status: rr.status,
        refundMode: rr.refundMode,
        requestedAt: rr.requestedAt,
        refundedAt: rr.refundedAt,
        reference: rr.reference,
        details: { email: rr.email, phone: rr.phone, upiId: rr.upiId, note: rr.note },
      });
    }

    return { rows, total };
  }

  async markRefunded(bookingId: string, reference: string, adminId?: string) {
    if (!mongoose.Types.ObjectId.isValid(bookingId)) {
      throw new BadRequestError('Invalid bookingId');
    }
    const oid = new mongoose.Types.ObjectId(bookingId);

    // Atomic: sirf pending refund hi refunded hoga (double click safe)
    const session: any = await SessionMentor.findOneAndUpdate(
      { bookings: { $elemMatch: { _id: oid, 'refundRequest.status': 'pending' } } } as any,
      {
        $set: {
          'bookings.$.refundRequest.status': 'refunded',
          'bookings.$.refundRequest.reference': reference,
          'bookings.$.refundRequest.refundedAt': new Date(),
          'bookings.$.refundRequest.handledBy': adminId || '',
        },
      } as any,
      { new: true }
    );
    if (!session) {
      throw new ConflictError('Refund not found or already marked as refunded');
    }

    const booking: any = (session.bookings || []).find((b: any) => String(b._id) === bookingId);
    const menteeId = booking?.menteeId || booking?.bookedBy;
    const amount = Number(booking?.refundRequest?.amount || 0);

    try {
      await CancellationLog.updateMany(
        { sessionId: session.sessionId, cancelledBy: menteeId, refundStatus: 'processing' } as any,
        {
          $set: {
            refundStatus: 'completed',
            refundTransactionId: reference,
            refundProcessedAt: new Date(),
          },
        } as any
      );
    } catch (e: any) {
      logger.warn(`CancellationLog update failed (mark refunded): ${e.message}`);
    }

    if (menteeId) {
      NotificationService.sendNotification({
        userId: menteeId,
        module: 'industry-mentor',
        type: NotificationType.REFUND_PROCESSED,
        channels: [NotificationChannel.IN_APP, NotificationChannel.EMAIL],
        data: {
          title: 'Refund sent',
          message: `Your refund of ₹${amount} for "${session.title}" has been sent. Reference: ${reference}.`,
          refundAmount: amount,
          sessionId: session.sessionId,
        },
      }).catch((e) => logger.error('Notification failed (refund sent -> student):', e));
    }

    try {
      const mentorDoc: any = await Mentor.findOne({ mentorId: session.mentorId });
      if (mentorDoc?.userId) {
        NotificationService.sendNotification({
          userId: mentorDoc.userId,
        module: 'industry-mentor',
          type: NotificationType.SESSION_CANCELLED,
          channels: [NotificationChannel.IN_APP],
          data: {
            title: 'Refund completed - Missed Session',
            message: `Admin has refunded ₹${amount} to the student for "${session.title}". No action needed.`,
            sessionId: session.sessionId,
          },
        }).catch((e) => logger.error('Notification failed (refund sent -> mentor):', e));
      }
    } catch (e: any) {
      logger.warn(`Mentor notify failed (mark refunded): ${e.message}`);
    }

    return { bookingId, status: 'refunded', reference };
  }
}

export default new RefundAdminService();