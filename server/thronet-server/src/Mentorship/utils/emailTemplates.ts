/**
 * Email Templates for Booking Management
 * Templates for reschedule, cancellation, and refund emails
 */

// ========================
// BASE TEMPLATE STYLES
// ========================

const baseStyles = `
  <style>
    body {
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
      line-height: 1.6;
      color: #333;
      margin: 0;
      padding: 0;
      background-color: #f4f4f4;
    }
    .container {
      max-width: 600px;
      margin: 20px auto;
      background: white;
      border-radius: 8px;
      overflow: hidden;
      box-shadow: 0 2px 8px rgba(0,0,0,0.1);
    }
    .header {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      padding: 30px 20px;
      text-align: center;
    }
    .header h1 {
      margin: 0;
      font-size: 28px;
      font-weight: 600;
    }
    .content {
      padding: 30px 20px;
    }
    .details-box {
      background: #f9f9f9;
      border-left: 4px solid #667eea;
      padding: 20px;
      margin: 20px 0;
      border-radius: 4px;
    }
    .details-box h3 {
      margin-top: 0;
      color: #667eea;
      font-size: 18px;
    }
    .details-box p {
      margin: 8px 0;
    }
    .details-box strong {
      color: #333;
      display: inline-block;
      min-width: 120px;
    }
    .button {
      display: inline-block;
      padding: 14px 32px;
      background: #667eea;
      color: white !important;
      text-decoration: none;
      border-radius: 6px;
      font-weight: 600;
      margin: 20px 0;
      transition: background 0.3s;
    }
    .button:hover {
      background: #5568d3;
    }
    .alert {
      background: #fff3cd;
      border-left: 4px solid #ffc107;
      padding: 15px;
      margin: 20px 0;
      border-radius: 4px;
    }
    .success {
      background: #d4edda;
      border-left: 4px solid #28a745;
      padding: 15px;
      margin: 20px 0;
      border-radius: 4px;
    }
    .error {
      background: #f8d7da;
      border-left: 4px solid #dc3545;
      padding: 15px;
      margin: 20px 0;
      border-radius: 4px;
    }
    .footer {
      background: #f9f9f9;
      padding: 20px;
      text-align: center;
      color: #666;
      font-size: 14px;
      border-top: 1px solid #eee;
    }
    .footer a {
      color: #667eea;
      text-decoration: none;
    }
    .divider {
      height: 1px;
      background: #eee;
      margin: 20px 0;
    }
  </style>
`;

// ========================
// RESCHEDULE EMAIL TEMPLATE
// ========================

export const rescheduleConfirmationTemplate = (data: {
  userName: string;
  mentorName: string;
  sessionType: string;
  oldTime: string;
  newTime: string;
  timezone: string;
  meetingUrl: string;
  rescheduleFee?: number;
  rescheduleCount: number;
}) => `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Session Rescheduled</title>
  ${baseStyles}
</head>
<body>
  <div class="container">
    <div class="header" style="background: linear-gradient(135deg, #2196F3 0%, #1976D2 100%);">
      <h1>🔄 Session Rescheduled</h1>
    </div>
    
    <div class="content">
      <p>Hi <strong>${data.userName}</strong>,</p>
      <p>Your session has been successfully rescheduled. Here are the updated details:</p>

      <div class="details-box" style="border-left-color: #2196F3;">
        <h3>Session Details</h3>
        <p><strong>Mentor:</strong> ${data.mentorName}</p>
        <p><strong>Session Type:</strong> ${data.sessionType}</p>
        <p><strong>Reschedule #:</strong> ${data.rescheduleCount}</p>
      </div>

      <div class="alert">
        <p style="margin: 0;"><strong>⏰ Schedule Change</strong></p>
        <p style="margin: 5px 0 0 0;">
          <strong>Previous:</strong> ${data.oldTime}<br>
          <strong>New Time:</strong> ${data.newTime}<br>
          <strong>Timezone:</strong> ${data.timezone}
        </p>
      </div>

      ${data.rescheduleFee && data.rescheduleFee > 0 ? `
        <div class="alert">
          <p style="margin: 0;">
            <strong>💳 Reschedule Fee:</strong> ₹${data.rescheduleFee}<br>
            This fee has been charged as per our reschedule policy.
          </p>
        </div>
      ` : `
        <div class="success">
          <p style="margin: 0;">
            <strong>✅ No Additional Fee</strong><br>
            This reschedule is within your free limit.
          </p>
        </div>
      `}

      <div class="details-box" style="border-left-color: #2196F3;">
        <h3>📍 Join Session</h3>
        <p>Meeting Link: <a href="${data.meetingUrl}" style="color: #2196F3;">${data.meetingUrl}</a></p>
        <a href="${data.meetingUrl}" class="button" style="background: #2196F3;">Join Meeting</a>
      </div>

      <div class="divider"></div>

      <p><strong>📝 Important Reminders:</strong></p>
      <ul>
        <li>You'll receive reminders 24 hours and 1 hour before the new time</li>
        <li>Further rescheduling may incur additional fees</li>
        <li>Cancellations within 24 hours may not be eligible for refund</li>
      </ul>

      <p>If you have any questions, please don't hesitate to reach out to us.</p>
    </div>

    <div class="footer">
      <p><strong>Mentorship Platform</strong></p>
      <p>Need help? <a href="mailto:support@mentorship.com">Contact Support</a></p>
      <p style="margin-top: 10px; font-size: 12px; color: #999;">
        This is an automated email. Please do not reply directly to this message.
      </p>
    </div>
  </div>
</body>
</html>
`;

// ========================
// CANCELLATION EMAIL TEMPLATE
// ========================

export const cancellationConfirmationTemplate = (data: {
  userName: string;
  mentorName: string;
  sessionType: string;
  scheduledAt: string;
  reason?: string;
  refundAmount: number;
  refundPercentage: number;
  refundStatus: string;
  refundEligible: boolean;
}) => `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Session Cancelled</title>
  ${baseStyles}
</head>
<body>
  <div class="container">
    <div class="header" style="background: linear-gradient(135deg, #f44336 0%, #d32f2f 100%);">
      <h1>❌ Session Cancelled</h1>
    </div>
    
    <div class="content">
      <p>Hi <strong>${data.userName}</strong>,</p>
      <p>Your session has been cancelled as requested. We're sorry to see this happen.</p>

      <div class="details-box" style="border-left-color: #f44336;">
        <h3>Cancelled Session Details</h3>
        <p><strong>Mentor:</strong> ${data.mentorName}</p>
        <p><strong>Session Type:</strong> ${data.sessionType}</p>
        <p><strong>Scheduled Time:</strong> ${data.scheduledAt}</p>
        ${data.reason ? `<p><strong>Reason:</strong> ${data.reason}</p>` : ''}
      </div>

      ${data.refundEligible ? `
        <div class="success">
          <h3 style="margin-top: 0;">💰 Refund Information</h3>
          <p><strong>Refund Amount:</strong> ₹${data.refundAmount} (${data.refundPercentage}% refund)</p>
          <p><strong>Status:</strong> ${data.refundStatus}</p>
          <p style="margin-bottom: 0;">
            ${data.refundPercentage === 100 
              ? 'You will receive a full refund within 3-5 business days.' 
              : data.refundPercentage === 50
              ? 'You will receive a 50% refund as per our cancellation policy (cancelled 12-24 hours before session).'
              : 'Refund will be processed according to our policy.'}
          </p>
        </div>
      ` : `
        <div class="error">
          <h3 style="margin-top: 0;">❌ No Refund Available</h3>
          <p style="margin-bottom: 0;">
            Unfortunately, this cancellation does not qualify for a refund as it was made less than 12 hours before the scheduled session time.
          </p>
        </div>
      `}

      <div class="divider"></div>

      <div class="details-box">
        <h3>📋 What Happens Next?</h3>
        <ul style="margin: 10px 0; padding-left: 20px;">
          ${data.refundEligible ? `
            <li>Refund will be credited to your original payment method</li>
            <li>Processing time: 3-5 business days</li>
            <li>You'll receive a confirmation once processed</li>
          ` : `
            <li>No refund will be processed</li>
            <li>The mentor has been compensated as per policy</li>
          `}
          <li>You can book a new session anytime</li>
          <li>Check out our other mentors</li>
        </ul>
      </div>

      <div class="alert">
        <p style="margin: 0;">
          <strong>💡 Tip:</strong> To avoid cancellation fees in the future, please cancel at least 24 hours before your scheduled session.
        </p>
      </div>

      <p>We hope to see you book another session soon!</p>

      <a href="https://mentorship.com/mentors" class="button">Browse Mentors</a>
    </div>

    <div class="footer">
      <p><strong>Mentorship Platform</strong></p>
      <p>Questions about your refund? <a href="mailto:support@mentorship.com">Contact Support</a></p>
      <p style="margin-top: 10px; font-size: 12px; color: #999;">
        This is an automated email. Please do not reply directly to this message.
      </p>
    </div>
  </div>
</body>
</html>
`;

// ========================
// REFUND PROCESSED EMAIL TEMPLATE
// ========================

export const refundProcessedTemplate = (data: {
  userName: string;
  sessionType: string;
  refundAmount: number;
  transactionId: string;
  processedAt: string;
  expectedCreditDays: number;
}) => `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Refund Processed</title>
  ${baseStyles}
</head>
<body>
  <div class="container">
    <div class="header" style="background: linear-gradient(135deg, #4CAF50 0%, #388E3C 100%);">
      <h1>✅ Refund Processed</h1>
    </div>
    
    <div class="content">
      <p>Hi <strong>${data.userName}</strong>,</p>
      <p>Good news! Your refund has been successfully processed.</p>

      <div class="success">
        <h3 style="margin-top: 0;">💰 Refund Details</h3>
        <p><strong>Amount:</strong> ₹${data.refundAmount}</p>
        <p><strong>Session:</strong> ${data.sessionType}</p>
        <p><strong>Transaction ID:</strong> ${data.transactionId}</p>
        <p><strong>Processed On:</strong> ${data.processedAt}</p>
      </div>

      <div class="details-box" style="border-left-color: #4CAF50;">
        <h3>📅 When Will I Receive My Money?</h3>
        <p>
          The refund has been initiated and should appear in your account within 
          <strong>${data.expectedCreditDays} business days</strong>, depending on your bank or payment method.
        </p>
        <p style="margin-bottom: 0;">
          The amount will be credited to the original payment method you used for booking.
        </p>
      </div>

      <div class="alert">
        <p style="margin: 0;">
          <strong>💳 Note:</strong> If you don't see the refund within ${data.expectedCreditDays} business days, 
          please contact your bank or payment provider with the transaction ID above.
        </p>
      </div>

      <div class="divider"></div>

      <p>Thank you for using our platform. We hope to serve you again soon!</p>

      <a href="https://mentorship.com/mentors" class="button" style="background: #4CAF50;">Explore Mentors</a>
    </div>

    <div class="footer">
      <p><strong>Mentorship Platform</strong></p>
      <p>Need assistance? <a href="mailto:support@mentorship.com">Contact Support</a></p>
      <p style="margin-top: 10px; font-size: 12px; color: #999;">
        This is an automated email. Please do not reply directly to this message.
      </p>
    </div>
  </div>
</body>
</html>
`;

// ========================
// MENTOR NOTIFICATION - SESSION CANCELLED
// ========================

export const mentorSessionCancelledTemplate = (data: {
  mentorName: string;
  menteeName: string;
  sessionType: string;
  scheduledAt: string;
  reason?: string;
  compensationAmount: number;
}) => `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Session Cancelled - Mentor Notification</title>
  ${baseStyles}
</head>
<body>
  <div class="container">
    <div class="header" style="background: linear-gradient(135deg, #FF9800 0%, #F57C00 100%);">
      <h1>🔔 Session Cancelled</h1>
    </div>
    
    <div class="content">
      <p>Hi <strong>${data.mentorName}</strong>,</p>
      <p>A session has been cancelled by the mentee. Here are the details:</p>

      <div class="details-box" style="border-left-color: #FF9800;">
        <h3>Session Information</h3>
        <p><strong>Mentee:</strong> ${data.menteeName}</p>
        <p><strong>Session Type:</strong> ${data.sessionType}</p>
        <p><strong>Scheduled Time:</strong> ${data.scheduledAt}</p>
        ${data.reason ? `<p><strong>Cancellation Reason:</strong> ${data.reason}</p>` : ''}
      </div>

      ${data.compensationAmount > 0 ? `
        <div class="success">
          <h3 style="margin-top: 0;">💰 Compensation</h3>
          <p style="margin-bottom: 0;">
            You will receive ₹${data.compensationAmount} as compensation for this cancellation, 
            as per our mentor compensation policy.
          </p>
        </div>
      ` : ''}

      <div class="alert">
        <p style="margin: 0;">
          <strong>📅 Time Slot Available:</strong> The cancelled time slot is now available for other bookings.
        </p>
      </div>

      <p>Thank you for your understanding!</p>
    </div>

    <div class="footer">
      <p><strong>Mentorship Platform</strong></p>
      <p>Questions? <a href="mailto:mentors@mentorship.com">Contact Mentor Support</a></p>
    </div>
  </div>
</body>
</html>
`;

// ========================
// MENTOR NOTIFICATION - SESSION RESCHEDULED
// ========================

export const mentorSessionRescheduledTemplate = (data: {
  mentorName: string;
  menteeName: string;
  sessionType: string;
  oldTime: string;
  newTime: string;
  timezone: string;
}) => `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Session Rescheduled - Mentor Notification</title>
  ${baseStyles}
</head>
<body>
  <div class="container">
    <div class="header" style="background: linear-gradient(135deg, #2196F3 0%, #1976D2 100%);">
      <h1>🔄 Session Rescheduled</h1>
    </div>
    
    <div class="content">
      <p>Hi <strong>${data.mentorName}</strong>,</p>
      <p>One of your sessions has been rescheduled. Please update your calendar accordingly.</p>

      <div class="details-box" style="border-left-color: #2196F3;">
        <h3>Session Details</h3>
        <p><strong>Mentee:</strong> ${data.menteeName}</p>
        <p><strong>Session Type:</strong> ${data.sessionType}</p>
      </div>

      <div class="alert">
        <p style="margin: 0;"><strong>⏰ Schedule Change</strong></p>
        <p style="margin: 5px 0 0 0;">
          <strong>Previous:</strong> ${data.oldTime}<br>
          <strong>New Time:</strong> ${data.newTime}<br>
          <strong>Timezone:</strong> ${data.timezone}
        </p>
      </div>

      <p>Please confirm the new time works for you. If you have any conflicts, please contact us immediately.</p>
    </div>

    <div class="footer">
      <p><strong>Mentorship Platform</strong></p>
      <p>Questions? <a href="mailto:mentors@mentorship.com">Contact Mentor Support</a></p>
    </div>
  </div>
</body>
</html>
`;

// ========================
// EXPORT ALL TEMPLATES
// ========================

export default {
  rescheduleConfirmationTemplate,
  cancellationConfirmationTemplate,
  refundProcessedTemplate,
  mentorSessionCancelledTemplate,
  mentorSessionRescheduledTemplate,
};