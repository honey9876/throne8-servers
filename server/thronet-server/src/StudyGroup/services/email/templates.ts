/**
 * ====================================
 * EMAIL TEMPLATES
 * ====================================
 * All HTML email templates in one place
 */

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';

/**
 * Base email wrapper
 */
const getEmailWrapper = (header: string, content: string): string => {
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { 
          font-family: Arial, sans-serif; 
          line-height: 1.6; 
          color: #333; 
          margin: 0; 
          padding: 0; 
        }
        .container { 
          max-width: 600px; 
          margin: 0 auto; 
          padding: 20px; 
        }
        .content { 
          background: #f9f9f9; 
          padding: 30px; 
          border-radius: 10px; 
        }
        .button { 
          display: inline-block; 
          background: #667eea; 
          color: white; 
          padding: 12px 30px; 
          text-decoration: none; 
          border-radius: 5px; 
          margin: 20px 0; 
        }
        .footer { 
          text-align: center; 
          margin-top: 20px; 
          color: #777; 
          font-size: 12px; 
        }
        h1 { color: #667eea; margin-bottom: 20px; }
        h2 { color: #333; margin-top: 0; }
        ul { padding-left: 20px; }
        .alert { 
          background: #fee2e2; 
          border-left: 4px solid #ef4444; 
          padding: 15px; 
          margin: 20px 0; 
          border-radius: 5px; 
        }
        .warning { 
          background: #fef3c7; 
          border-left: 4px solid #f59e0b; 
          padding: 15px; 
          margin: 20px 0; 
          border-radius: 5px; 
        }
        .progress-bar { 
          background: #e5e7eb; 
          height: 20px; 
          border-radius: 10px; 
          overflow: hidden; 
          margin: 15px 0;
        }
        .progress-fill { 
          background: #10b981; 
          height: 100%; 
          border-radius: 10px; 
          transition: width 0.3s ease;
        }
        .streak { 
          font-size: 48px; 
          font-weight: bold; 
          text-align: center; 
          color: #f59e0b; 
          margin: 20px 0; 
        }
      </style>
    </head>
    <body>
      <div class="container">
        ${header}
        <div class="content">
          ${content}
        </div>
        <div class="footer">
          <p>© ${new Date().getFullYear()} Study Group. All rights reserved.</p>
          <p>Need help? Contact us at support@studygroup.com</p>
        </div>
      </div>
    </body>
    </html>
  `;
};

/**
 * Welcome Email Template
 */
export const getWelcomeEmailTemplate = (name: string): string => {
  const header = '<h1>🎉 Welcome to Study Group!</h1>';
  const content = `
    <h2>Hi ${name}! 👋</h2>
    <p>We're excited to have you join our community of dedicated learners!</p>
    <p>With Study Group, you can:</p>
    <ul>
      <li>📚 Create and join study groups</li>
      <li>⏱️ Track your study time with Pomodoro timer</li>
      <li>🔥 Build study streaks and stay consistent</li>
      <li>🏆 Compete on leaderboards</li>
      <li>❓ Get help from peers on doubts</li>
    </ul>
    <a href="${BASE_URL}" class="button">Get Started</a>
    <p>Happy studying! 📖</p>
  `;
  return getEmailWrapper(header, content);
};

/**
 * Goal Reminder Email Template
 */
export const getGoalReminderTemplate = (name: string, goalDetails: any): string => {
  const header = '<h1>⏰ Daily Goal Reminder</h1>';
  const content = `
    <h2>Hi ${name}! 👋</h2>
    <p>Just a friendly reminder about your daily goal:</p>
    <h3>📊 Today's Progress</h3>
    <p><strong>Goal:</strong> ${goalDetails.targetHours || 0} hours</p>
    <p><strong>Completed:</strong> ${goalDetails.completedHours || 0} hours</p>
    <div class="progress-bar">
      <div class="progress-fill" style="width: ${goalDetails.progress || 0}%;"></div>
    </div>
    <p style="margin-top: 20px;">You're ${goalDetails.remaining || 0} hours away from achieving your goal! 💪</p>
    <a href="${BASE_URL}/timer" class="button">Start Studying</a>
  `;
  return getEmailWrapper(header, content);
};

/**
 * Deadline Alert Email Template
 */
export const getDeadlineAlertTemplate = (name: string, taskDetails: any): string => {
  const header = '<h1>⚠️ Deadline Approaching</h1>';
  const content = `
    <h2>Hi ${name}! 👋</h2>
    <div class="alert">
      <h3>⏰ Task Deadline Alert</h3>
      <p><strong>Task:</strong> ${taskDetails.title}</p>
      <p><strong>Deadline:</strong> ${taskDetails.deadline}</p>
      <p><strong>Priority:</strong> ${taskDetails.priority}</p>
    </div>
    <p>Don't forget to complete this task before the deadline! ⏳</p>
    <a href="${BASE_URL}/tasks" class="button">View Task</a>
  `;
  return getEmailWrapper(header, content);
};

/**
 * Streak Reminder Email Template
 */
export const getStreakReminderTemplate = (name: string, streakDays: number): string => {
  const header = '<h1>🔥 Streak Alert!</h1>';
  const content = `
    <h2>Hi ${name}! 👋</h2>
    <p>Don't let your streak break! You're on a roll:</p>
    <div class="streak">🔥 ${streakDays} Days</div>
    <p>Study for at least 1 hour today to keep your streak alive! 💪</p>
    <a href="${BASE_URL}/timer" class="button">Continue Streak</a>
  `;
  return getEmailWrapper(header, content);
};

/**
 * Exam Reminder Email Template
 */
export const getExamReminderTemplate = (name: string, examDetails: any): string => {
  const header = '<h1>📝 Exam Reminder</h1>';
  const content = `
    <h2>Hi ${name}! 👋</h2>
    <p>Your upcoming exam is approaching:</p>
    <p><strong>Exam:</strong> ${examDetails.name}</p>
    <p><strong>Date:</strong> ${examDetails.date}</p>
    <p><strong>Time:</strong> ${examDetails.time}</p>
    <p>Good luck with your preparation! 📚</p>
    <a href="${BASE_URL}" class="button">Start Preparing</a>
  `;
  return getEmailWrapper(header, content);
};

/**
 * Password Reset Email Template
 */
export const getPasswordResetTemplate = (name: string, resetToken: string): string => {
  const resetUrl = `${BASE_URL}/reset-password?token=${resetToken}`;
  const header = '<h1>🔐 Password Reset Request</h1>';
  const content = `
    <h2>Hi ${name}! 👋</h2>
    <p>We received a request to reset your password. Click the button below to reset it:</p>
    <a href="${resetUrl}" class="button">Reset Password</a>
    <p>This link will expire in 1 hour.</p>
    <div class="warning">
      <p><strong>⚠️ Security Notice:</strong></p>
      <p>If you didn't request this, please ignore this email. Your password will remain unchanged.</p>
    </div>
  `;
  return getEmailWrapper(header, content);
};

/**
 * Group Invite Email Template
 */
export const getGroupInviteTemplate = (name: string, groupDetails: any): string => {
  const header = '<h1>👥 Group Invitation</h1>';
  const content = `
    <h2>Hi ${name}! 👋</h2>
    <p>You've been invited to join a study group:</p>
    <h3>${groupDetails.name}</h3>
    <p><strong>Category:</strong> ${groupDetails.category}</p>
    <p><strong>Members:</strong> ${groupDetails.memberCount}</p>
    <p><strong>Invited by:</strong> ${groupDetails.inviterName}</p>
    <a href="${BASE_URL}/groups/${groupDetails.id}" class="button">Join Group</a>
  `;
  return getEmailWrapper(header, content);
};

export default {
  getWelcomeEmailTemplate,
  getGoalReminderTemplate,
  getDeadlineAlertTemplate,
  getStreakReminderTemplate,
  getExamReminderTemplate,
  getPasswordResetTemplate,
  getGroupInviteTemplate,
};