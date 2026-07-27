/**
 * ====================================
 * DATA CLEANUP CRON JOB (FIXED)
 * ====================================
 * Runs weekly to clean up old/unnecessary data
 */

import cron from 'node-cron';
// import {Notification, Message, Group, StudySession, File} from '../models';
import Notification from '../models/Notification.model';
import Message from '../models/Message.model';
import Group from '../models/Group.model';
import StudySession from '../models/StudySession.model';
import File from '../models/File.model'; 
import { LoggerUtil } from '@/shared/logger.util';
import { addDays } from '../utils/dateHelper';
import { NOTIFICATION_CONSTANTS, GROUP_CONSTANTS } from '../utils/constants';

/**
 * Delete old notifications
 */
const deleteOldNotifications = async (): Promise<number> => {
  try {
    const expiryDate = addDays(new Date(), -NOTIFICATION_CONSTANTS.EXPIRY_DAYS);

    const result = await Notification.deleteMany({
      createdAt: { $lt: expiryDate },
      isRead: true,
    });

    LoggerUtil.info(`Deleted ${result.deletedCount} old notifications`);
    return result.deletedCount || 0;
  } catch (error : any) {
    LoggerUtil.error('Error deleting old notifications:', error);
    return 0;
  }
};

/**
 * Archive old messages
 */
const archiveOldMessages = async (): Promise<number> => {
  try {
    const archiveDate = addDays(new Date(), -90);

    const result = await Message.updateMany(
      {
        createdAt: { $lt: archiveDate },
        isDeleted: false,
      },
      {
        $set: { isArchived: true },
      }
    );

    LoggerUtil.info(`Archived ${result.modifiedCount} old messages`);
    return result.modifiedCount || 0;
  } catch (error : any) {
    LoggerUtil.error('Error archiving old messages:', error);
    return 0;
  }
};

/**
 * Clean up inactive groups
 */
const cleanupInactiveGroups = async (): Promise<number> => {
  try {
    const inactivityThreshold = addDays(
      new Date(),
      -GROUP_CONSTANTS.INACTIVE_DAYS_THRESHOLD
    );

    const inactiveGroups = await Group.find({
      updatedAt: { $lt: inactivityThreshold },
      isActive: true,
      currentMemberCount: { $lte: 1 },
    });

    let deactivated = 0;

    for (const group of inactiveGroups) {
      group.isActive = false;
      await group.save();
      deactivated++;

      LoggerUtil.info(
        `Deactivated inactive group: ${group._id} (${group.title})`
      );
    }

    LoggerUtil.info(`Deactivated ${deactivated} inactive groups`);
    return deactivated;
  } catch (error : any) {
    LoggerUtil.error('Error cleaning up inactive groups:', error);
    return 0;
  }
};

/**
 * Remove old incomplete study sessions
 */
const removeIncompleteSessions = async (): Promise<number> => {
  try {
    const cutoffDate = addDays(new Date(), -7);

    const result = await StudySession.deleteMany({
      createdAt: { $lt: cutoffDate },
      status: { $in: ['active', 'paused'] },
    });

    LoggerUtil.info(`Deleted ${result.deletedCount} incomplete study sessions`);
    return result.deletedCount || 0;
  } catch (error : any) {
    LoggerUtil.error('Error removing incomplete sessions:', error);
    return 0;
  }
};

/**
 * Clean up orphaned file records (files without groups)
 */
const cleanupOrphanedFiles = async (): Promise<number> => {
  try {
    const files = await File.find({}).populate('groupId');

    let deleted = 0;

    for (const file of files) {
      if (!file.groupId) {
        await file.deleteOne();
        deleted++;
        LoggerUtil.info(`Deleted orphaned file record: ${file._id}`);
      }
    }

    LoggerUtil.info(`Cleaned up ${deleted} orphaned file records`);
    return deleted;
  } catch (error : any) {
    LoggerUtil.error('Error cleaning up orphaned files:', error);
    return 0;
  }
};

/**
 * Remove old deleted messages permanently
 */
const permanentlyDeleteOldMessages = async (): Promise<number> => {
  try {
    const deleteDate = addDays(new Date(), -30);

    const result = await Message.deleteMany({
      deletedAt: { $lt: deleteDate },
      isDeleted: true,
    });

    LoggerUtil.info(`Permanently deleted ${result.deletedCount} old messages`);
    return result.deletedCount || 0;
  } catch (error : any) {
    LoggerUtil.error('Error permanently deleting messages:', error);
    return 0;
  }
};

/**
 * Clean up old read notifications (keep unread)
 */
const cleanupReadNotifications = async (): Promise<number> => {
  try {
    const cutoffDate = addDays(new Date(), -7);

    const result = await Notification.deleteMany({
      createdAt: { $lt: cutoffDate },
      isRead: true,
    });

    LoggerUtil.info(`Cleaned up ${result.deletedCount} old read notifications`);
    return result.deletedCount || 0;
  } catch (error : any) {
    LoggerUtil.error('Error cleaning up read notifications:', error);
    return 0;
  }
};

/**
 * Database statistics
 */
const logDatabaseStats = async (): Promise<void> => {
  try {
    const stats = {
      totalNotifications: await Notification.countDocuments(),
      totalMessages: await Message.countDocuments(),
      totalGroups: await Group.countDocuments(),
      activeGroups: await Group.countDocuments({ isActive: true }),
      totalSessions: await StudySession.countDocuments(),
      totalFiles: await File.countDocuments(),
    };

    LoggerUtil.info('📊 Database Statistics:', stats);
  } catch (error : any) {
    LoggerUtil.error('Error logging database stats:', error);
  }
};

/**
 * Main data cleanup job
 */
 const dataCleanupJob = async (): Promise<void> => {
  const startTime = Date.now();
  LoggerUtil.info('🧹 Starting data cleanup job...');

  try {
    await logDatabaseStats();

    const results = {
      notificationsDeleted: await deleteOldNotifications(),
      messagesArchived: await archiveOldMessages(),
      groupsDeactivated: await cleanupInactiveGroups(),
      sessionsRemoved: await removeIncompleteSessions(),
      orphanedFilesDeleted: await cleanupOrphanedFiles(),
      messagesPermaDeleted: await permanentlyDeleteOldMessages(),
      readNotificationsDeleted: await cleanupReadNotifications(),
    };

    await logDatabaseStats();

    const timeTaken = Date.now() - startTime;

    LoggerUtil.info(
      `✅ Data cleanup completed:
      - Notifications deleted: ${results.notificationsDeleted}
      - Messages archived: ${results.messagesArchived}
      - Groups deactivated: ${results.groupsDeactivated}
      - Sessions removed: ${results.sessionsRemoved}
      - Orphaned files deleted: ${results.orphanedFilesDeleted}
      - Messages permanently deleted: ${results.messagesPermaDeleted}
      - Read notifications deleted: ${results.readNotificationsDeleted}
      - Time taken: ${timeTaken}ms`
    );
  } catch (error : any) {
    LoggerUtil.error('❌ Data cleanup job failed:', error);
  }
};

/**
 * Schedule data cleanup job
 */
 const scheduleDataCleanupJob = (): void => {
  cron.schedule('0 2 * * 0', dataCleanupJob, {
    timezone: 'Asia/Kolkata',
  });

  LoggerUtil.info('📅 Data cleanup job scheduled: Every Sunday at 2:00 AM');
};

export  {scheduleDataCleanupJob,
  dataCleanupJob,
};