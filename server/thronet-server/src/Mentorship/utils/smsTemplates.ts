/**
 * SMS Templates for Booking Management
 * Short, concise messages for reschedule, cancellation, and refund
 * 
 * SMS Character Limits:
 * - Single SMS: 160 characters
 * - Multi-part SMS: 153 characters per segment
 * 
 * Keep messages under 160 characters when possible
 */

export interface RescheduleNotificationData {
  mentorName: string;
  oldTime: string;
  newTime: string;
  meetingUrl?: string;
  rescheduleFee?: number;
}

export interface CancellationNotificationData {
  sessionType: string;
  scheduledTime: string;
  refundAmount: number;
  refundPercentage: number;
}

export interface RefundProcessedData {
  refundAmount: number;
  transactionId: string;
  expectedDays: number;
}

export interface MentorNotificationData {
  menteeName: string;
  sessionType: string;
  scheduledTime: string;
  compensationAmount?: number;
}

class SMSTemplates {
  /**
   * Reschedule confirmation SMS to mentee
   */
  rescheduleConfirmation(data: RescheduleNotificationData): string {
    if (data.rescheduleFee && data.rescheduleFee > 0) {
      return `🔄 Session Rescheduled
Mentor: ${data.mentorName}
Old: ${data.oldTime}
New: ${data.newTime}
Fee: ₹${data.rescheduleFee}
Details sent via email.`;
    }

    return `🔄 Session Rescheduled
Mentor: ${data.mentorName}
Old: ${data.oldTime}
New: ${data.newTime}
Check email for meeting link.`;
  }

  /**
   * Short reschedule confirmation (under 160 chars)
   */
  rescheduleConfirmationShort(data: RescheduleNotificationData): string {
    return `Session with ${data.mentorName} rescheduled to ${data.newTime}. Check email for details. - Mentorship`;
  }

  /**
   * Cancellation confirmation SMS to mentee
   */
  cancellationConfirmation(data: CancellationNotificationData): string {
    if (data.refundAmount > 0) {
      return `❌ Session Cancelled
${data.sessionType}
Time: ${data.scheduledTime}
Refund: ₹${data.refundAmount} (${data.refundPercentage}%)
Will be processed in 3-5 days.`;
    }

    return `❌ Session Cancelled
${data.sessionType}
Time: ${data.scheduledTime}
No refund (cancelled <12h before)`;
  }

  /**
   * Short cancellation confirmation (under 160 chars)
   */
  cancellationConfirmationShort(data: CancellationNotificationData): string {
    if (data.refundAmount > 0) {
      return `Session cancelled. Refund: ₹${data.refundAmount} (${data.refundPercentage}%). Processing in 3-5 days. - Mentorship`;
    }
    return `Session cancelled. No refund available (cancelled within 12 hours). - Mentorship`;
  }

  /**
   * Refund processed SMS
   */
  refundProcessed(data: RefundProcessedData): string {
    return `✅ Refund Processed
Amount: ₹${data.refundAmount}
ID: ${data.transactionId}
Credit in ${data.expectedDays} days
- Mentorship Platform`;
  }

  /**
   * Short refund processed (under 160 chars)
   */
  refundProcessedShort(data: RefundProcessedData): string {
    return `Refund ₹${data.refundAmount} processed. Credit in ${data.expectedDays} days. ID: ${data.transactionId} - Mentorship`;
  }

  /**
   * Reschedule notification to mentor
   */
  mentorRescheduleNotification(data: MentorNotificationData): string {
    return `🔄 Session Rescheduled
Mentee: ${data.menteeName}
New Time: ${data.scheduledTime}
${data.sessionType}
Check email for details.`;
  }

  /**
   * Short mentor reschedule notification (under 160 chars)
   */
  mentorRescheduleNotificationShort(data: MentorNotificationData): string {
    return `Session with ${data.menteeName} rescheduled to ${data.scheduledTime}. Check email. - Mentorship`;
  }

  /**
   * Cancellation notification to mentor
   */
  mentorCancellationNotification(data: MentorNotificationData): string {
    if (data.compensationAmount && data.compensationAmount > 0) {
      return `❌ Session Cancelled
Mentee: ${data.menteeName}
Time: ${data.scheduledTime}
Compensation: ₹${data.compensationAmount}
- Mentorship Platform`;
    }

    return `❌ Session Cancelled
Mentee: ${data.menteeName}
${data.sessionType}
Time: ${data.scheduledTime}
- Mentorship Platform`;
  }

  /**
   * Short mentor cancellation notification (under 160 chars)
   */
  mentorCancellationNotificationShort(data: MentorNotificationData): string {
    return `Session with ${data.menteeName} cancelled. Time slot now available. - Mentorship`;
  }

  /**
   * Reminder before reschedule deadline (24 hours)
   */
  rescheduleDeadlineReminder(sessionTime: string, hoursLeft: number): string {
    return `⏰ Reminder: ${hoursLeft}h left to reschedule without fee
Session: ${sessionTime}
Reschedule now at mentorship.com`;
  }

  /**
   * Reminder before cancellation deadline for full refund
   */
  cancellationDeadlineReminder(sessionTime: string, hoursLeft: number): string {
    return `⏰ ${hoursLeft}h left for 100% refund
Session: ${sessionTime}
Cancel at mentorship.com if needed`;
  }

  /**
   * Partial refund warning (between 12-24 hours)
   */
  partialRefundWarning(sessionTime: string): string {
    return `⚠️ Cancellation now = 50% refund
Session: ${sessionTime}
<12h = No refund
- Mentorship`;
  }

  /**
   * No refund warning (less than 12 hours)
   */
  noRefundWarning(sessionTime: string): string {
    return `⚠️ Cancellation now = No refund
Session: ${sessionTime}
Too close to start time
- Mentorship`;
  }

  /**
   * Payment failed for reschedule fee
   */
  rescheduleFeePaymentFailed(feeAmount: number): string {
    return `❌ Reschedule failed
Payment of ₹${feeAmount} declined
Update payment method & retry
- Mentorship`;
  }

  /**
   * Refund failed notification
   */
  refundFailed(refundAmount: number): string {
    return `⚠️ Refund Issue
Amount: ₹${refundAmount}
Please contact support
support@mentorship.com
- Mentorship`;
  }

  /**
   * Successful reschedule with meeting link
   */
  rescheduleWithLink(mentorName: string, newTime: string, meetingUrl: string): string {
    // Keep under 160 characters
    return `Session with ${mentorName} → ${newTime}
Join: ${this.shortenUrl(meetingUrl)}
- Mentorship`;
  }

  /**
   * Emergency cancellation notification
   */
  emergencyCancellation(refundAmount: number): string {
    return `Emergency cancellation approved
75% refund: ₹${refundAmount}
Processing in 3-5 days
- Mentorship`;
  }

  /**
   * Helper: Shorten URL for SMS (if using URL shortener)
   */
  private shortenUrl(url: string): string {
    // In production, use actual URL shortener (bit.ly, etc.)
    // For now, return original URL
    return url;
  }

  /**
   * Generic booking update notification
   */
  bookingUpdate(message: string): string {
    return `📌 Booking Update
${message}
Check email for details
- Mentorship`;
  }

  /**
   * Custom message with character count validation
   */
  customMessage(message: string, addBranding: boolean = true): string {
    const branding = addBranding ? '\n- Mentorship' : '';
    const fullMessage = `${message}${branding}`;

    // Warn if message exceeds single SMS limit
    if (fullMessage.length > 160) {
      console.warn(
        `SMS message exceeds 160 characters (${fullMessage.length} chars). ` +
        `Will be sent as ${Math.ceil(fullMessage.length / 153)} parts.`
      );
    }

    return fullMessage;
  }

  /**
   * Get character count for a message
   */
  getCharacterCount(message: string): {
    length: number;
    smsCount: number;
    warning: string | null;
  } {
    const length = message.length;
    let smsCount = 1;
    let warning = null;

    if (length > 160) {
      smsCount = Math.ceil(length / 153);
      warning = `Message will be sent as ${smsCount} SMS parts`;
    }

    return { length, smsCount, warning };
  }
}

// Export singleton instance
export default new SMSTemplates();

// Export class for testing
export { SMSTemplates };