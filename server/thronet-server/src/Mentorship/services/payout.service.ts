import MentorshipPayment, {
  FulfillmentStatus,
  GatewayPaymentStatus,
  PaymentPurpose,
  PayoutStatus,
} from '../models/Payment';
import { SessionMentor } from '../models';
import { WithdrawalMethod } from '../models/WithdrawalMethod';
import mentorRepository from '../repositories/mentor.repository';
import { User } from '@/auth/models';
import { BadRequestError, NotFoundError } from '@/shared/errors/app.error';

// Purane payments mein payout field nahi hota, unhe bhi "held" maano.
const HELD_FILTER = {
  $or: [{ 'payout.status': PayoutStatus.HELD }, { 'payout.status': { $exists: false } }],
};

const ELIGIBLE = {
  purpose: PaymentPurpose.SESSION_BOOKING,
  status: GatewayPaymentStatus.PAID,
  'fulfillment.status': FulfillmentStatus.FULFILLED,
  refunds: { $size: 0 },
};

function split(p: any) {
  const base = Number(p.pricing?.basePrice ?? p.amount ?? 0);
  const platformAmount = Number(p.pricing?.platformFee ?? 0);
  return { mentorAmount: Math.max(0, base - platformAmount), platformAmount };
}

/** bookingId -> booking status ("completed", "pending", "cancelled", ...) */
async function bookingStatusMap(payments: any[]): Promise<Map<string, string>> {
  const sessionIds = [
    ...new Set(
      payments
        .map((p) => p.fulfillment?.sessionId || p.context?.sessionId)
        .filter(Boolean)
    ),
  ];
  const map = new Map<string, string>();
  if (sessionIds.length === 0) return map;

  const sessions: any[] = await SessionMentor.find({ sessionId: { $in: sessionIds } })
    .select('sessionId bookings._id bookings.status')
    .lean();
  sessions.forEach((s) =>
    (s.bookings || []).forEach((b: any) => map.set(String(b._id), String(b.status)))
  );
  return map;
}

class PayoutService {
  /** Admin list. status: held | released | paid */
  async listForAdmin(status: string, page: number, limit: number) {
    const filter: any =
      status === PayoutStatus.HELD
        ? { ...ELIGIBLE, ...HELD_FILTER }
        : { ...ELIGIBLE, 'payout.status': status };

    const [rows, total] = await Promise.all([
      MentorshipPayment.find(filter)
        .sort({ paidAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      MentorshipPayment.countDocuments(filter),
    ]);

    const statuses = await bookingStatusMap(rows);

    const cache = new Map<string, { name: string; method: any }>();
    const resolveMentor = async (mentorId?: string) => {
      if (!mentorId) return { name: 'Unknown mentor', method: null };
      if (cache.has(mentorId)) return cache.get(mentorId)!;
      let name = 'Mentor';
      let method: any = null;
      try {
        const mentor: any = await mentorRepository.findByMentorId(mentorId);
        if (mentor?.userId) {
          const user: any = await User.findOne(
            { userId: mentor.userId },
            { firstName: 1, lastName: 1, _id: 0 }
          ).lean();
          if (user) name = `${user.firstName || ''} ${user.lastName || ''}`.trim() || name;
        }
      } catch {
        /* name khali reh jayega */
      }

      try {
        // Withdrawal method UUID mentorId se save hota hai (ObjectId se nahi).
        // Safety ke liye dono id try karte hain.
        const ids = [mentorId];
        // (mentor._id ko bhi add karna ho to neeche wale try me mentor fetch karke push kar sakte ho)
        method = await WithdrawalMethod.findOne({ mentorId: { $in: ids } })
          .sort({ isDefault: -1, createdAt: -1 }) // default pehle, nahi to latest added
          .lean();
      } catch {
        /* method khali reh jayega */
      }
      const out = {
        name,
        method: method
          ? {
              type: method.type,
              upiId: method.upiId,
              upiName: method.upiName,
              accountHolderName: method.accountHolderName,
              accountNumber: method.accountNumber,
              ifscCode: method.ifscCode,
              bankName: method.bankName,
            }
          : null,
      };
      cache.set(mentorId, out);
      return out;
    };

    const data = await Promise.all(
      rows.map(async (p: any) => {
        const amounts = split(p);
        const mentor = await resolveMentor(p.context?.mentorId);
        return {
          paymentId: p.paymentId,
          mentorId: p.context?.mentorId,
          mentorName: mentor.name,
          menteeId: p.userId,
          sessionId: p.fulfillment?.sessionId || p.context?.sessionId,
          bookingStatus: statuses.get(String(p.fulfillment?.bookingId)) || 'unknown',
          title: p.context?.title,
          scheduledAt: p.context?.scheduledAt,
          paidAt: p.paidAt,
          totalPaid: p.amount,
          mentorAmount: p.payout?.mentorAmount ?? amounts.mentorAmount,
          platformAmount: p.payout?.platformAmount ?? amounts.platformAmount,
          payoutStatus: p.payout?.status || PayoutStatus.HELD,
          releasedAt: p.payout?.releasedAt,
          payoutPaidAt: p.payout?.paidAt,
          reference: p.payout?.reference,
          payoutMethod: mentor.method,
        };
      })
    );

    return { data, total };
  }

  /** Admin approve: held -> released (sirf completed session ka) */
  async release(paymentId: string, adminId: string) {
    const existing: any = await MentorshipPayment.findOne({ paymentId }).lean();
    if (!existing) throw new NotFoundError('Payment not found');

    const statuses = await bookingStatusMap([existing]);
    const bookingStatus = statuses.get(String(existing.fulfillment?.bookingId));
    if (bookingStatus !== 'completed') {
      throw new BadRequestError(
        `Session abhi complete nahi hua (status: ${bookingStatus || 'unknown'}). Complete hone ke baad hi release karo.`
      );
    }

    const { mentorAmount, platformAmount } = split(existing);
    const updated = await MentorshipPayment.findOneAndUpdate(
      { paymentId, ...ELIGIBLE, ...HELD_FILTER },
      {
        $set: {
          'payout.status': PayoutStatus.RELEASED,
          'payout.mentorAmount': mentorAmount,
          'payout.platformAmount': platformAmount,
          'payout.releasedAt': new Date(),
          'payout.releasedBy': adminId,
        },
      },
      { new: true }
    );
    if (!updated) {
      throw new BadRequestError('Payment is not eligible for release (already released, refunded or unpaid)');
    }
    return updated;
  }

  /** Admin: mentor ko asli paisa bhej diya, released -> paid */
  async markPaid(paymentId: string, adminId: string, reference: string) {
    const updated = await MentorshipPayment.findOneAndUpdate(
      { paymentId, ...ELIGIBLE, 'payout.status': PayoutStatus.RELEASED },
      {
        $set: {
          'payout.status': PayoutStatus.PAID,
          'payout.paidAt': new Date(),
          'payout.paidBy': adminId,
          'payout.reference': reference,
        },
      },
      { new: true }
    );
    if (!updated) throw new BadRequestError('Payment must be in released state to mark as paid');
    return updated;
  }

  /** Mentor ka summary + har booking ka payout status */
  async mentorOverview(mentorId: string) {
    const rows: any[] = await MentorshipPayment.find({
      ...ELIGIBLE,
      'context.mentorId': mentorId,
    })
      .sort({ paidAt: -1 })
      .lean();

    const summary = { pending: 0, available: 0, paid: 0, currency: 'INR' };
    const items = rows.map((p) => {
      const amounts = split(p);
      const mentorAmount = p.payout?.mentorAmount ?? amounts.mentorAmount;
      const payoutStatus = p.payout?.status || PayoutStatus.HELD;
      if (payoutStatus === PayoutStatus.PAID) summary.paid += mentorAmount;
      else if (payoutStatus === PayoutStatus.RELEASED) summary.available += mentorAmount;
      else summary.pending += mentorAmount;
      return {
        paymentId: p.paymentId,
        bookingId: p.fulfillment?.bookingId,
        sessionId: p.fulfillment?.sessionId || p.context?.sessionId,
        title: p.context?.title,
        totalPaid: p.amount,
        mentorAmount,
        platformAmount: p.payout?.platformAmount ?? amounts.platformAmount,
        payoutStatus,
        releasedAt: p.payout?.releasedAt,
        payoutPaidAt: p.payout?.paidAt,
        reference: p.payout?.reference,
      };
    });

    return { summary, items };
  }
}

export default new PayoutService();