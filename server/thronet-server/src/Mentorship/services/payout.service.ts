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
import logger from '@/config/logging/logger.config';
import NotificationService, { NotificationType, NotificationChannel } from './notification.service';



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


/** Paid history me full account number nahi dikhana, sirf last 4 digits */
function maskMethod(m: any) {
  if (!m || m.type !== 'bank') return m;
  return {
    ...m,
    accountNumber: `••••${String(m.accountNumber || '').slice(-4)}`,
    ifscCode: undefined,
  };
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

/** Mentor ka payout account: default pehle, nahi to latest. UUID aur Mongo _id dono try. */
async function findPayoutMethod(mentorId: string, mentor?: any): Promise<any | null> {
  const ids = [mentorId, mentor?.mentorId, mentor?._id ? String(mentor._id) : undefined].filter(Boolean);
  return WithdrawalMethod.findOne({ mentorId: { $in: ids } })
    .sort({ isDefault: -1, createdAt: -1 })
    .lean();
}

/** RazorpayX se mentor ko asli paisa bhejta hai. Fail hone par error throw karta hai. */
async function sendRazorpayXPayout(args: {
  paymentId: string;
  mentorName: string;
  mentorEmail?: string;
  mentorPhone?: string;
  method: any;
  amount: number;
}): Promise<{ payoutId: string; utr?: string; status: string }> {
  const accountNumber = process.env.RAZORPAYX_ACCOUNT_NUMBER;
  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  if (!accountNumber || !keyId || !keySecret) {
    throw new BadRequestError(
      'RazorpayX payout is not configured. Set RAZORPAYX_ACCOUNT_NUMBER, RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET on the server.'
    );
  }
  const amountPaise = Math.round(Number(args.amount) * 100);
  if (!Number.isFinite(amountPaise) || amountPaise <= 0) {
    throw new BadRequestError('Mentor payout amount is invalid');
  }

  const auth = 'Basic ' + Buffer.from(`${keyId}:${keySecret}`).toString('base64');
  const call = async (path: string, body: any, extraHeaders: Record<string, string> = {}) => {
    let res: Response;
    try {
      res = await fetch(`https://api.razorpay.com/v1/${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: auth, ...extraHeaders },
        body: JSON.stringify(body),
      });
    } catch (e: any) {
      throw new BadRequestError(`RazorpayX API call failed (${path}): ${e?.message || 'Network error'}`);
    }
    let json: any;
    try {
      json = await res.json();
    } catch {
      throw new BadRequestError(`RazorpayX returned a non-JSON response for ${path} (HTTP ${res.status}).`);
    }
    if (!res.ok) {
      logger.error(`RazorpayX ${path} failed: ${JSON.stringify(json?.error || json)}`);
      throw new BadRequestError(json?.error?.description || `RazorpayX ${path} failed`);
    }
    return json;
  };

  const m = args.method;
  const isUpi = m.type === 'upi';
  if (isUpi && !m.upiId) throw new BadRequestError('Mentor UPI ID is missing');
  if (!isUpi && (!m.accountNumber || !m.ifscCode)) throw new BadRequestError('Mentor bank details are incomplete');

  const contact = await call('contacts', {
    name: args.mentorName,
    email: args.mentorEmail || undefined,
    contact: args.mentorPhone || undefined,
    type: 'vendor',
    reference_id: args.paymentId,
  });

  const fundAccount = await call(
    'fund_accounts',
    isUpi
      ? { contact_id: contact.id, account_type: 'vpa', vpa: { address: m.upiId } }
      : {
          contact_id: contact.id,
          account_type: 'bank_account',
          bank_account: {
            name: m.accountHolderName || args.mentorName,
            ifsc: m.ifscCode,
            account_number: m.accountNumber,
          },
        }
  );

  const payout = await call(
    'payouts',
    {
      account_number: accountNumber,
      fund_account_id: fundAccount.id,
      amount: amountPaise,
      currency: 'INR',
      mode: isUpi ? 'UPI' : 'IMPS',
      purpose: 'payout',
      queue_if_low_balance: false,
      reference_id: args.paymentId,
      narration: 'Throne8 mentor payout',
    },
    // Same payment par double click / retry karne par double paisa nahi jayega
    { 'X-Payout-Idempotency': `mentor_payout_${args.paymentId}` }
  );

  if (['rejected', 'cancelled', 'failed', 'reversed'].includes(String(payout.status))) {
    throw new BadRequestError(`Payout ${payout.status}. Please check the mentor's payout account and RazorpayX balance.`);
  }
  return { payoutId: payout.id, utr: payout.utr || undefined, status: String(payout.status) };
}

/** Mentor ko in-app notification (fail hone par payout flow nahi rukta). */
async function notifyMentor(payment: any, title: string, message: string, extra: Record<string, any> = {}) {
  try {
    const mentorId = payment?.context?.mentorId;
    if (!mentorId) {
      logger.warn(`Payout notification skipped: no mentorId on payment ${payment?.paymentId}`);
      return;
    }
    const mentor: any = await mentorRepository.findByMentorId(mentorId);
    if (!mentor?.userId) {
      logger.warn(`Payout notification skipped: mentor/userId not found for mentorId ${mentorId}`);
      return;
    }
    await NotificationService.sendNotification({
      userId: mentor.userId,
      type: NotificationType.PAYMENT_SUCCESS,
      channels: [NotificationChannel.IN_APP],
      data: {
        title,
        message,
        paymentId: payment.paymentId,
        sessionId: payment?.fulfillment?.sessionId || payment?.context?.sessionId,
        ...extra,
      },
    });
  } catch (e: any) {
    logger.error(`Payout notification failed for payment ${payment?.paymentId}: ${e?.message}`);
  }
}

class PayoutService {
    /** Admin list. status: held | released | paid | approved (released + paid) */
  async listForAdmin(status: string, page: number, limit: number) {
    const filter: any =
    status === PayoutStatus.HELD
      ? { ...ELIGIBLE, ...HELD_FILTER }
      : status === 'approved'
        ? { ...ELIGIBLE, 'payout.status': { $in: [PayoutStatus.RELEASED, PayoutStatus.PAID] } }
        : { ...ELIGIBLE, 'payout.status': status };

  // held: nayi payments pehle | approved/paid: jo sabse recent approve hua wo pehle
  const sort: any = status === PayoutStatus.HELD ? { paidAt: -1 } : { 'payout.releasedAt': -1 };

  const [rows, total] = await Promise.all([
    MentorshipPayment.find(filter)
      .sort(sort)
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


        // Approve karne wale admin ke naam
        const adminIds = [...new Set(rows.map((p: any) => p.payout?.releasedBy).filter(Boolean))];
        const admins: any[] = adminIds.length
          ? await User.find(
              { userId: { $in: adminIds } },
              { userId: 1, firstName: 1, lastName: 1, _id: 0 }
            ).lean()
          : [];
        const adminNames = new Map(
          admins.map((a) => [a.userId, `${a.firstName || ''} ${a.lastName || ''}`.trim()])
        );
    
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
          releasedBy: adminNames.get(p.payout?.releasedBy) || p.payout?.releasedBy || undefined,
          // Paid ho chuka to account masked; held/released me admin ko full details chahiye
          payoutMethod:
            p.payout?.status === PayoutStatus.PAID ? maskMethod(mentor.method) : mentor.method,
        };
      })
    );

    return { data, total };
  }

  /**
   * Admin approve: held -> released -> RazorpayX payout -> paid (sirf completed session ka).
   * Payout fail hua to status wapas held ho jata hai.
   */
  async release(paymentId: string, adminId: string) {
    const existing: any = await MentorshipPayment.findOne({ paymentId }).lean();
    if (!existing) throw new NotFoundError('Payment not found');

    const statuses = await bookingStatusMap([existing]);
    const bookingStatus = statuses.get(String(existing.fulfillment?.bookingId));
    if (bookingStatus !== 'completed') {
      throw new BadRequestError(
        `Session is not yet completed (status: ${bookingStatus || 'unknown'}). Payouts can only be released after completion.`
      );
    }

    // Mentor + payout account pehle check karo (claim karne se pehle)
    const mentorId = existing.context?.mentorId;
    const mentor: any = mentorId ? await mentorRepository.findByMentorId(mentorId) : null;
    if (!mentor) throw new BadRequestError('Mentor not found for this payment');
    const method: any = await findPayoutMethod(mentorId, mentor);
    if (!method) throw new BadRequestError('Mentor has not added a payout account (UPI / bank)');

    const user: any = mentor.userId
      ? await User.findOne(
          { userId: mentor.userId },
          { firstName: 1, lastName: 1, email: 1, phoneNumber: 1, _id: 0 }
        ).lean()
      : null;
    const mentorName =
      `${user?.firstName || ''} ${user?.lastName || ''}`.trim() ||
      method.upiName ||
      method.accountHolderName ||
      'Mentor';

    const { mentorAmount, platformAmount } = split(existing);

    // Step 1: atomically claim (double click / do admin ek saath = sirf ek jeetega)
    const claimed = await MentorshipPayment.findOneAndUpdate(
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
    if (!claimed) {
      throw new BadRequestError('Payment is not eligible for release (already released, refunded or unpaid)');
    }

    // Step 2: asli paisa bhejo. Fail hua to held par wapas.
    let result: { payoutId: string; utr?: string; status: string };
    try {
      result = await sendRazorpayXPayout({
        paymentId,
        mentorName,
        mentorEmail: user?.email,
        mentorPhone: user?.phoneNumber,
        method,
        amount: mentorAmount,
      });
    } catch (err: any) {
      logger.error(`Mentor payout failed for payment ${paymentId}: ${err?.message}`);
      await MentorshipPayment.updateOne(
        { paymentId, 'payout.status': PayoutStatus.RELEASED },
        {
          $set: { 'payout.status': PayoutStatus.HELD },
          $unset: { 'payout.releasedAt': '', 'payout.releasedBy': '' },
        }
      );
      throw err;
    }

    // Step 3: paid mark karo
    const paid = await MentorshipPayment.findOneAndUpdate(
      { paymentId },
      {
        $set: {
          'payout.status': PayoutStatus.PAID,
          'payout.paidAt': new Date(),
          'payout.paidBy': adminId,
          'payout.reference': result.utr || result.payoutId,
        },
      },
      { new: true }
    );

    void notifyMentor(
      paid || claimed,
      'Payout sent',
      `₹${mentorAmount} for "${existing.context?.title || 'your session'}" has been sent to your ${
        method.type === 'upi' ? `UPI ID ${method.upiId}` : 'bank account'
      }. Reference: ${result.utr || result.payoutId}`,
      { amount: mentorAmount, transactionId: result.utr || result.payoutId }
    );
    return paid || claimed;
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