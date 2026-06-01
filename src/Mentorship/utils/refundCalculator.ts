export interface RefundCalculationInput {
  sessionPrice: number;
  platformFee: number;
  totalAmount: number;
  scheduledAt: Date;
  cancelledAt?: Date;
  cancellationReason?: string;
}

export interface RefundCalculationResult {
  refundEligible: boolean;
  refundPercentage: number;
  refundAmount: number;
  platformFeeRefund: number;
  mentorPayout: number;
  hoursBeforeSession: number;
  withinPolicy: boolean;
  reason: string;
  breakdown: {
    originalAmount: number;
    platformFee: number;
    refundToUser: number;
    platformFeeRefund: number;
    mentorAmount: number;
  };
}

export interface RescheduleFeeResult {
  feeRequired: boolean;
  feeAmount: number;
  feeWaived: boolean;
  reason: string;
}

class RefundCalculator {
  // ── Policy constants ────────────────────────────────────────────
  private readonly FULL_REFUND_HOURS = 24;    // 100% refund if 24+ hours before
  private readonly PARTIAL_REFUND_HOURS = 12;  // 50% refund if 12-24 hours before
  private readonly RESCHEDULE_FEE = 50;        // ₹50 for 2nd+ reschedule
  private readonly MAX_FREE_RESCHEDULES = 1;
  private readonly MENTOR_PLATFORM_CUT = 0.15; // Platform takes 15% of mentor's portion

  /**
   * Main method: calculate refund based on cancellation policy
   */
  calculateRefund(input: RefundCalculationInput): RefundCalculationResult {
    const cancelledAt = input.cancelledAt ?? new Date();
    const hoursBeforeSession = this.hoursUntil(input.scheduledAt, cancelledAt);
    const { refundPercentage, withinPolicy, reason } = this.refundPolicy(hoursBeforeSession);

    const refundAmount = Math.round((input.totalAmount * refundPercentage) / 100);
    const platformFeeRefund = refundPercentage === 100 ? input.platformFee : 0;
    const mentorPayout = this.mentorPayout(input.sessionPrice, refundPercentage);

    return {
      refundEligible: refundPercentage > 0,
      refundPercentage,
      refundAmount,
      platformFeeRefund,
      mentorPayout,
      hoursBeforeSession,
      withinPolicy,
      reason,
      breakdown: {
        originalAmount: input.totalAmount,
        platformFee: input.platformFee,
        refundToUser: refundAmount,
        platformFeeRefund,
        mentorAmount: mentorPayout,
      },
    };
  }

  /**
   * Calculate reschedule fee
   */
  calculateRescheduleFee(
    rescheduleCount: number,
    isWithinPolicy: boolean,
    totalAmount: number
  ): RescheduleFeeResult {
    // First reschedule always free
    if (rescheduleCount === 0) {
      return { feeRequired: false, feeAmount: 0, feeWaived: true, reason: 'First reschedule is free' };
    }

    if (isWithinPolicy && rescheduleCount < this.MAX_FREE_RESCHEDULES) {
      return { feeRequired: false, feeAmount: 0, feeWaived: true, reason: 'Within free reschedule limit' };
    }

    if (isWithinPolicy) {
      return {
        feeRequired: true,
        feeAmount: this.RESCHEDULE_FEE,
        feeWaived: false,
        reason: `Reschedule fee for ${rescheduleCount + 1}th reschedule`,
      };
    }

    // Outside 24-hour window — 10% of session cost
    return {
      feeRequired: true,
      feeAmount: Math.round(totalAmount * 0.1),
      feeWaived: false,
      reason: 'Rescheduling outside policy window (less than 24 hours)',
    };
  }

  /**
   * Show refund estimate for UI (before actual cancellation)
   */
  estimateRefund(totalAmount: number, scheduledAt: Date): {
    if24HoursBefore: number;
    if12To24Hours: number;
    ifLessThan12Hours: number;
    currentRefund: number;
    currentPercentage: number;
  } {
    const hours = this.hoursUntil(scheduledAt, new Date());
    const { refundPercentage: currentPercentage } = this.refundPolicy(hours);

    return {
      if24HoursBefore: totalAmount,
      if12To24Hours: Math.round(totalAmount * 0.5),
      ifLessThan12Hours: 0,
      currentRefund: Math.round((totalAmount * currentPercentage) / 100),
      currentPercentage,
    };
  }

  isWithinCancellationPolicy(scheduledAt: Date, cancelledAt?: Date): boolean {
    return this.hoursUntil(scheduledAt, cancelledAt ?? new Date()) >= this.FULL_REFUND_HOURS;
  }

  isWithinReschedulePolicy(scheduledAt: Date, rescheduleAt?: Date): boolean {
    return this.hoursUntil(scheduledAt, rescheduleAt ?? new Date()) >= this.FULL_REFUND_HOURS;
  }

  getPolicyDetails() {
    return {
      fullRefundHours: this.FULL_REFUND_HOURS,
      partialRefundHours: this.PARTIAL_REFUND_HOURS,
      partialRefundPercentage: 50,
      rescheduleLimit: this.MAX_FREE_RESCHEDULES,
      rescheduleFee: this.RESCHEDULE_FEE,
    };
  }

  getRefundMessage(result: RefundCalculationResult): string {
    if (!result.refundEligible) return `No refund available. ${result.reason}`;
    if (result.refundPercentage === 100)
      return `Full refund of ₹${result.refundAmount} will be processed within 3-5 business days.`;
    if (result.refundPercentage === 50)
      return `50% refund of ₹${result.refundAmount} will be processed within 3-5 business days. ${result.reason}`;
    return result.reason;
  }

  /**
   * Emergency cancellation — 75% refund regardless of timing
   */
  calculateEmergencyRefund(
    totalAmount: number,
    platformFee: number,
    sessionPrice: number
  ): RefundCalculationResult {
    const refundAmount = Math.round(totalAmount * 0.75);
    const platformFeeRefund = Math.round(platformFee * 0.75);
    const mentorPayout = Math.round(sessionPrice * 0.25 * (1 - this.MENTOR_PLATFORM_CUT));

    return {
      refundEligible: true,
      refundPercentage: 75,
      refundAmount,
      platformFeeRefund,
      mentorPayout,
      hoursBeforeSession: 0,
      withinPolicy: false,
      reason: 'Emergency cancellation — 75% refund processed',
      breakdown: {
        originalAmount: totalAmount,
        platformFee,
        refundToUser: refundAmount,
        platformFeeRefund,
        mentorAmount: mentorPayout,
      },
    };
  }

  // ── Private helpers ──────────────────────────────────────────────

  private hoursUntil(scheduledAt: Date, from: Date): number {
    return Math.max(0, (scheduledAt.getTime() - from.getTime()) / (1000 * 60 * 60));
  }

  private refundPolicy(hours: number): {
    refundPercentage: number;
    withinPolicy: boolean;
    reason: string;
  } {
    if (hours >= this.FULL_REFUND_HOURS) {
      return {
        refundPercentage: 100,
        withinPolicy: true,
        reason: `Cancelled ${hours.toFixed(1)} hours before session (24+ hours policy)`,
      };
    }
    if (hours >= this.PARTIAL_REFUND_HOURS) {
      return {
        refundPercentage: 50,
        withinPolicy: false,
        reason: `Cancelled ${hours.toFixed(1)} hours before session (12-24 hours — 50% refund)`,
      };
    }
    return {
      refundPercentage: 0,
      withinPolicy: false,
      reason: `Cancelled ${hours.toFixed(1)} hours before session (less than 12 hours — no refund)`,
    };
  }

  private mentorPayout(sessionPrice: number, refundPercentage: number): number {
    const mentorShare = (sessionPrice * (100 - refundPercentage)) / 100;
    return Math.round(mentorShare * (1 - this.MENTOR_PLATFORM_CUT));
  }
}

export default new RefundCalculator();