// src/connections/services/profileView.service.ts
//
// Rewritten from scratch. The previous version of this file (1266 lines) was
// entirely commented out and referenced paths that don't exist in this repo
// (../models/mongodb/WhoViewedProfile, ../services/external/notificationServiceClient,
// ../services/shared/cacheService, ../utils/response, ./privacyService, ../utils/logger).
// It appears to be boilerplate from a different project structure, not disabled
// production code. This version uses the real WhoViewedProfile model and the
// actual shared utilities used elsewhere in this codebase.

import logger, { LogCategory } from '@/shared/logger.util';
import { ErrorResponse, HttpStatus } from '@/shared/response.util';
import constants from '@/shared/constants.util';
import WhoViewedProfile from '../models/WhoViewedProfile';
import User from '@/auth/models/User.model';
import NotificationService from '@/notifications/services/notification.service';

const ERROR_CODES = constants.ERROR_CODES;

interface RecordViewData {
  viewedUserId: string;
  metadata?: {
    source?: 'profile' | 'search' | 'suggestion' | 'connection';
    deviceType?: 'mobile' | 'desktop' | 'tablet';
    location?: string;
    referrer?: string;
  };
  anonymous?: boolean;
}

interface ListQuery {
  page?: number;
  limit?: number;
}

class ProfileViewService {
  /**
   * Feature 1: Record a profile view.
   * Skips recording (and notification) if the viewed user's privacy is 'private',
   * and respects self-view (no-op — model also rejects this at the DB layer).
   */
  async recordProfileView(viewerId: string, data: RecordViewData): Promise<any> {
    try {
      if (viewerId === data.viewedUserId) {
        // Viewing your own profile isn't a "view" — silently no-op rather than error,
        // since this can legitimately happen from client-side tracking calls.
        return { recorded: false, reason: 'self_view' };
      }

      const viewedUser = await User.findOne({ userId: data.viewedUserId })
        .select('preferences.profileViewVisibility')
        .lean();

      if (!viewedUser) {
        throw new ErrorResponse('User not found', HttpStatus.NOT_FOUND, ERROR_CODES.USER_NOT_FOUND);
      }

      const visibility =
        (viewedUser as any)?.preferences?.profileViewVisibility ?? 'named';

      // 'private' means the viewed user has opted out of view tracking entirely —
      // don't record, don't notify.
      if (visibility === 'private') {
        return { recorded: false, reason: 'viewer_privacy_disabled' };
      }

      const view = await WhoViewedProfile.create({
        viewerId,
        viewedId: data.viewedUserId,
        visibility: data.anonymous ? 'private' : 'public',
        metadata: data.metadata || {},
        isNotified: false,
      });

      logger.info('Profile view recorded', {
        category: LogCategory.CONNECTION,
        viewerId,
        viewedUserId: data.viewedUserId,
      });

      return { recorded: true, viewId: view.viewId };
    } catch (error: any) {
      console.error('🔥🔥🔥 ERROR IN profileViewService.recordProfileView 🔥🔥🔥');
      console.error(error);
      if (error instanceof ErrorResponse) throw error;
      logger.error('Error recording profile view', {
        category: LogCategory.CONNECTION,
        viewerId,
        viewedUserId: data.viewedUserId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * Feature 2: Get who viewed a user's profile (paginated).
   * Anonymous views (visibility: 'private' on the WhoViewedProfile record) are
   * masked — viewer identity is not exposed.
   */
  async getWhoViewedProfile(userId: string, query: ListQuery): Promise<any> {
    const page = query.page || 1;
    const limit = Math.min(query.limit || 20, 100);

    const result = await (WhoViewedProfile as any).findUserViewsPaginated(userId, { page, limit });

    const viewerIds = result.data
      .filter((v: any) => v.visibility !== 'private')
      .map((v: any) => v.viewerId);

    const viewers = viewerIds.length
      ? await User.find({ userId: { $in: viewerIds } })
          .select('userId firstName lastName profilePhotoId')
          .lean()
      : [];

    const viewerMap = new Map(viewers.map((v: any) => [v.userId, v]));

    const data = result.data.map((v: any) => {
      if (v.visibility === 'private') {
        return {
          viewId: v.viewId,
          viewer: null, // masked — anonymous view
          timestamp: v.timestamp,
        };
      }
      const viewer = viewerMap.get(v.viewerId);
      return {
        viewId: v.viewId,
        viewer: viewer
          ? { userId: viewer.userId, name: `${viewer.firstName} ${viewer.lastName || ''}`.trim() }
          : null,
        timestamp: v.timestamp,
      };
    });

    return { ...result, data };
  }

  /** Feature 3: Get total profile view count for a user */
  async getProfileViewCount(userId: string): Promise<{ count: number }> {
    const stats = await (WhoViewedProfile as any).getViewStats(userId);
    return { count: stats.totalViews };
  }

  /**
   * Feature 4: Basic analytics — view count grouped by day.
   * Kept intentionally simple; this wasn't part of the notification feature
   * scope but the route/validator contract already commits to this endpoint
   * existing, so it needs a real (if basic) implementation rather than a stub.
   */
  async getProfileViewAnalytics(userId: string, days = 30): Promise<any> {
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const results = await WhoViewedProfile.aggregate([
      { $match: { viewedId: userId, timestamp: { $gte: since } } },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$timestamp' } },
          count: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]);
    return { days, byDay: results.map((r: any) => ({ date: r._id, count: r.count })) };
  }

  /** Feature 5: Set profile view privacy preference */
  async setProfileViewPrivacy(
    userId: string,
    visibility: 'public' | 'connections' | 'private'
  ): Promise<void> {
    const user = await User.findOneAndUpdate(
      { userId },
      { $set: { 'preferences.profileViewVisibility': visibility } },
      { new: true }
    );
    if (!user) {
      throw new ErrorResponse('User not found', HttpStatus.NOT_FOUND, ERROR_CODES.USER_NOT_FOUND);
    }
    logger.info('Profile view privacy updated', {
      category: LogCategory.CONNECTION,
      userId,
      visibility,
    });
  }

  /** Feature 6: Delete profile view history (as the viewed user, clear who-viewed-you records) */
  async deleteProfileViewHistory(userId: string, daysOld?: number): Promise<{ deletedCount: number }> {
    const filter: any = { viewedId: userId };
    if (daysOld) {
      filter.timestamp = { $lt: new Date(Date.now() - daysOld * 24 * 60 * 60 * 1000) };
    }
    const result = await WhoViewedProfile.deleteMany(filter);
    logger.info('Profile view history deleted', {
      category: LogCategory.CONNECTION,
      userId,
      deletedCount: result.deletedCount,
    });
    return { deletedCount: result.deletedCount || 0 };
  }

  /**
   * Feature 7: Basic insights (most active viewing days, total unique viewers).
   * Same scope note as analytics above — basic real implementation, not a stub.
   */
  async getProfileViewInsights(userId: string): Promise<any> {
    const [stats, uniqueViewers] = await Promise.all([
      (WhoViewedProfile as any).getViewStats(userId),
      WhoViewedProfile.distinct('viewerId', { viewedId: userId }),
    ]);
    return {
      totalViews: stats.totalViews,
      uniqueViewerCount: uniqueViewers.length,
      unnotifiedViews: stats.unnotifiedViews,
    };
  }

  /** Feature 8: Export profile view data as JSON (CSV formatting left to the controller) */
  async exportProfileViewData(userId: string, startDate?: Date, endDate?: Date): Promise<any[]> {
    const filter: any = { viewedId: userId };
    if (startDate || endDate) {
      filter.timestamp = {};
      if (startDate) filter.timestamp.$gte = startDate;
      if (endDate) filter.timestamp.$lte = endDate;
    }
    return WhoViewedProfile.find(filter).sort({ timestamp: -1 }).lean();
  }

  /**
   * Called by the digest cron job. Notifies a user about unnotified profile views
   * and marks them as notified. Delegates the actual Notification record + socket
   * emit to NotificationService, keeping that logic in one place.
   */
  async processDigestForUser(userId: string): Promise<{ notified: boolean }> {
    const unnotified = await WhoViewedProfile.find({
      viewedId: userId,
      isNotified: false,
    })
      .select('viewId viewerId visibility')
      .lean();

    if (!unnotified.length) return { notified: false };

    const namedViewerIds = unnotified
      .filter((v: any) => v.visibility !== 'private')
      .map((v: any) => v.viewerId);

    await NotificationService.notifyProfileViewed(userId, namedViewerIds, unnotified.length);

    const viewIds = unnotified.map((v: any) => v.viewId);
    await (WhoViewedProfile as any).bulkMarkAsNotified(viewIds, userId);

    return { notified: true };
  }
}

export const profileViewService = new ProfileViewService();
