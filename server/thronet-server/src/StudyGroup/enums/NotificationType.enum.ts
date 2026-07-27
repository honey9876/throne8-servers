/**
 * ====================================
 * NOTIFICATION TYPE ENUM
 * ====================================
 * Defines different types of notifications
 */

export enum NotificationType {
  // Group notifications
  GROUP_INVITE = 'group_invite',
  MEMBER_JOINED = 'member_joined',
  MEMBER_LEFT = 'member_left',
  MEMBER_REMOVED = 'member_removed',
  GROUP_DELETED = 'group_deleted',
  
  // Message notifications
  NEW_MESSAGE = 'new_message',
  MESSAGE_MENTION = 'message_mention',
  MESSAGE_REPLY = 'message_reply',
  MESSAGE = 'message', // ✅ ADDED FOR MODERATION
  
  // Task & Goal notifications
  TASK_REMINDER = 'task_reminder',
  TASK_DEADLINE = 'task_deadline',
  GOAL_REMINDER = 'goal_reminder',
  GOAL_ACHIEVED = 'goal_achieved',
  
  // Streak notifications
  STREAK_REMINDER = 'streak_reminder',
  STREAK_MILESTONE = 'streak_milestone',
  STREAK_WARNING = 'streak_warning',
  
  // Doubt notifications
  DOUBT_ANSWERED = 'doubt_answered',
  ANSWER_UPVOTED = 'answer_upvoted',
  DOUBT_SOLVED = 'doubt_solved',
  
  // System notifications
  SYSTEM_UPDATE = 'system_update',
  MAINTENANCE = 'maintenance',
  
  // ✅ MODERATION NOTIFICATIONS (ADDED)
  WARNING_RECEIVED = 'warning_received',
  BANNED = 'banned',
  UNBANNED = 'unbanned',
  KICKED = 'kicked',
  MODERATOR_ASSIGNED = 'moderator_assigned',
  MODERATOR_REMOVED = 'moderator_removed',
  USER_REPORTED = 'user_reported',
  MESSAGE_REPORTED = 'message_reported',
}

export default NotificationType;