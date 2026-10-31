import { Request, Response, NextFunction } from 'express';
import { SessionMentor, AdminAction, ReviewReport } from '../models';
import MentorshipReview from '../models/MentorshipReview';
import { User } from '@/auth/models';
import { mentorshipanalyticsService, mentorshipReviewService } from '../services';
import { logger } from '@/shared/logger.util';
import PaginationHelper from '@/Mentorship/utils/pagination';
import ResponseHandler from '@/shared/utils/mentorship/responseHandler';
import mentorRepository from '../repositories/mentor.repository';
import sessionRepository from '../repositories/session.repository';
import reviewRepository from '../repositories/review.repository';
import refundService from '../services/refund.service';

function isAdmin(req: Request): boolean {
  return req.user?.role === 'admin';
}

async function enrichMentorsWithUser(mentors: any[]): Promise<any[]> {
  const userIds = mentors.map((m: any) => m.userId).filter(Boolean);
  if (userIds.length === 0) return mentors;
  const users = await User.find(
    { userId: { $in: userIds } },
    { userId: 1, firstName: 1, lastName: 1, profilePhotoId: 1, _id: 0 }
  ).lean();
  const userMap = new Map((users as any[]).map((u) => [u.userId, u]));
  return mentors.map((mentor: any) => {
    const u = userMap.get(mentor.userId);
    return {
      ...mentor,
      user: u
        ? {
            firstName: u.firstName,
            lastName: u.lastName,
            profilePhotoId: u.profilePhotoId,
          }
        : null,
    };
  });
}

async function enrichReportedReviews(reviews: any[]): Promise<any[]> {
  if (reviews.length === 0) return reviews;

  const menteeIds = [...new Set(reviews.map((r: any) => r.menteeId).filter(Boolean))];
  const mentorIds = [...new Set(reviews.map((r: any) => r.mentorId).filter(Boolean))];
  const reviewIds = reviews.map((r: any) => r.reviewId).filter(Boolean);

  const [reviewerUsers, mentors, latestPendingReports, mentorReportCounts] = await Promise.all([
    menteeIds.length > 0
      ? User.find(
          { userId: { $in: menteeIds } },
          { userId: 1, firstName: 1, lastName: 1, profilePhotoId: 1, _id: 0 }
        ).lean()
      : [],
    mentorIds.length > 0
      ? mentorRepository.findAll({ mentorId: { $in: mentorIds } }, {}, 0, mentorIds.length)
      : [],
    reviewIds.length > 0
      ? ReviewReport.aggregate([
          {
            $match: {
              reviewId: { $in: reviewIds },
              status: 'pending',
            },
          },
          { $sort: { createdAt: -1 } },
          {
            $group: {
              _id: '$reviewId',
              latestDoc: { $first: '$$ROOT' },
            },
          },
        ])
      : [],
    mentorIds.length > 0
      ? ReviewReport.aggregate([
          {
            $match: {
              mentorId: { $in: mentorIds },
              status: 'pending',
            },
          },
          {
            $group: {
              _id: { mentorId: '$mentorId', reviewId: '$reviewId' },
            },
          },
          {
            $group: {
              _id: '$_id.mentorId',
              count: { $sum: 1 },
            },
          },
        ])
      : [],
  ]);

  const reportMap = new Map<string, any>(
    (latestPendingReports as any[]).map((entry) => [
      entry._id,
      {
        reason: entry.latestDoc.reason,
        note: entry.latestDoc.note || undefined,
        reportedAt: entry.latestDoc.createdAt,
        status: entry.latestDoc.status,
      },
    ])
  );

  const mentorCountMap = new Map<string, number>(
    (mentorReportCounts as any[]).map((entry) => [entry._id, entry.count])
  );

  const reviewerMap = new Map((reviewerUsers as any[]).map((u) => [u.userId, u]));

  const mentorUserIds = [...new Set((mentors as any[]).map((m: any) => m.userId).filter(Boolean))];
  const mentorUsers =
    mentorUserIds.length > 0
      ? await User.find(
          { userId: { $in: mentorUserIds } },
          { userId: 1, firstName: 1, lastName: 1, _id: 0 }
        ).lean()
      : [];
  const mentorUserMap = new Map((mentorUsers as any[]).map((u) => [u.userId, u]));

  const mentorMap = new Map(
    (mentors as any[]).map((m: any) => {
      const u = mentorUserMap.get(m.userId);
      const name = u ? `${u.firstName || ''} ${u.lastName || ''}`.trim() : '';
      return [
        m.mentorId,
        {
          mentorId: m.mentorId,
          name: name || 'Mentor',
          title: m.title || '',
        },
      ];
    })
  );

  return reviews.map((r: any) => {
    const revUser = reviewerMap.get(r.menteeId);
    const mentorInfo = mentorMap.get(r.mentorId);
    const reportInfo = reportMap.get(r.reviewId) || null;
    const mentorReportCount = mentorCountMap.get(r.mentorId) || 0;

    return {
      ...r,
      reviewer: revUser
        ? {
            firstName: revUser.firstName,
            lastName: revUser.lastName,
            profilePhotoId: revUser.profilePhotoId || null,
          }
        : null,
      mentor: mentorInfo || null,
      report: reportInfo,
      mentorReportCount,
    };
  });
}

class AdminController {

  /**
   * @route   GET /api/v1/mentorship/admin/mentors
   * @access  Private (Admin)
   */
  async getAllMentors(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!isAdmin(req)) {
        ResponseHandler.forbidden(res, 'Admin access required');
        return;
      }

      const { page = 1, limit = 20, status, search } = req.query;
      const { page: validPage, limit: validLimit } = PaginationHelper.validateParams(
        Number(page),
        Number(limit)
      );

      const query: any = { isDeleted: false };
      if (status) query.status = status;
      if (search) query.$text = { $search: search as string };

      const [mentors, total] = await Promise.all([
        mentorRepository.findAll(
          query,
          { createdAt: -1 },
          PaginationHelper.getSkip(validPage, validLimit),
          validLimit
        ),
        mentorRepository.count(query),
      ]);

      const enrichedMentors = await enrichMentorsWithUser(mentors);

      ResponseHandler.paginated(res, 'Mentors retrieved successfully', enrichedMentors, validPage, validLimit, total);
    } catch (error: any) {
      logger.error('Failed to fetch mentors:', error);
      next(error);
    }
  }

  /**
   * @route   GET /api/v1/mentorship/admin/sessions
   * @access  Private (Admin)
   *
   * Query params:
   *   kind         – 'booked' (default) | 'slots' | 'all'
   *   status       – one of BookingStatus values
   *   sessionType  – one of SessionType values
   *   from, to     – ISO date strings, filter on scheduledAt
   */
  async getAllSessions(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!isAdmin(req)) {
        ResponseHandler.forbidden(res, 'Admin access required');
        return;
      }

      const { page = 1, limit = 20, status, sessionType, kind = 'booked', from, to } = req.query;

      // Validate kind
      const validKinds = ['booked', 'slots', 'all'];
      if (kind && !validKinds.includes(kind as string)) {
        ResponseHandler.badRequest(res, `Invalid kind value. Must be one of: ${validKinds.join(', ')}`);
        return;
      }

      // Validate status against BookingStatus enum
      const validStatuses = ['available', 'pending', 'confirmed', 'in_progress', 'completed', 'cancelled', 'rescheduled', 'no_show', 'missed', 'refunded'];
      if (status && !validStatuses.includes(status as string)) {
        ResponseHandler.badRequest(res, `Invalid status value. Must be one of: ${validStatuses.join(', ')}`);
        return;
      } 

      // Validate sessionType against SessionType enum
      const validSessionTypes = ['quick_call', 'deep_dive', 'resume_review', 'mock_interview', 'career_planning', 'portfolio_review', 'ask_query', 'group_session'];
      if (sessionType && !validSessionTypes.includes(sessionType as string)) {
        ResponseHandler.badRequest(res, `Invalid sessionType value. Must be one of: ${validSessionTypes.join(', ')}`);
        return;
      }

      // Validate date range
      if (from && isNaN(Date.parse(from as string))) {
        ResponseHandler.badRequest(res, 'Invalid "from" date format. Use ISO 8601.');
        return;
      }
      if (to && isNaN(Date.parse(to as string))) {
        ResponseHandler.badRequest(res, 'Invalid "to" date format. Use ISO 8601.');
        return;
      }

      const { page: validPage, limit: validLimit } = PaginationHelper.validateParams(
        Number(page),
        Number(limit)
      );

      const query: any = {};

      // kind filter
      if (kind === 'booked') {
        query.status = { $ne: 'available' };
      } else if (kind === 'slots') {
        query.status = 'available';
      }
      // kind === 'all' → no status filter from kind

      // explicit status overrides kind-based filter
      if (status) query.status = status;
      if (sessionType) query.sessionType = sessionType;

      // Date range on scheduledAt (indexed)
      if (from || to) {
        query.scheduledAt = {};
        if (from) query.scheduledAt.$gte = new Date(from as string);
        if (to) query.scheduledAt.$lte = new Date(to as string);
      }

      const { data: sessions, total } = await sessionRepository.findAll(
        query,
        PaginationHelper.getSkip(validPage, validLimit),
        validLimit
      );

      // Strip sensitive fields (meeting links, passwords, emails, phones)
      // and format mentor/mentee nested objects
      const sanitized = sessions.map((s: any) => {
        const { meeting, ...rest } = s;

        const menteeFullName = s.menteeName || s.bookedMenteeName || '';
        const nameParts = menteeFullName ? menteeFullName.trim().split(/\s+/) : [];
        const firstName = nameParts[0] || null;
        const lastName = nameParts.length > 1 ? nameParts.slice(1).join(' ') : null;

        const menteeObj = (s.menteeId || s.bookedBy || menteeFullName)
          ? {
              firstName,
              lastName,
              name: menteeFullName || null,
              profilePhotoId: s.menteeProfilePhoto || null,
            }
          : null;

        const mentorObj = {
          name: s.mentorName || null,
          title: s.mentorTitle || null,
          profilePhotoId: s.mentorProfilePhoto || null,
        };

        return {
          ...rest,
          mentor: mentorObj,
          mentee: menteeObj,
        };
      });

      ResponseHandler.paginated(res, 'Sessions retrieved successfully', sanitized, validPage, validLimit, total);
    } catch (error: any) {
      logger.error('Failed to fetch sessions:', error);
      next(error);
    }
  }

  /**
   * @route   GET /api/v1/mentorship/admin/reviews
   * @access  Private (Admin)
   */
  async getAllReviews(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!isAdmin(req)) {
        ResponseHandler.forbidden(res, 'Admin access required');
        return;
      }

      const { page = 1, limit = 20, reported, rating, status } = req.query;
      const { page: validPage, limit: validLimit } = PaginationHelper.validateParams(
        Number(page),
        Number(limit)
      );

      const query: any = {};
      if (status === 'all') {
        // Include all (public, hidden, deleted)
      } else if (status === 'public') {
        query.isDeleted = false;
        query.isPublic = true;
      } else if (status === 'hidden') {
        query.isDeleted = false;
        query.isPublic = false;
      } else if (status === 'deleted') {
        query.isDeleted = true;
      } else {
        query.isDeleted = false;
      }

      if (reported === 'true') query.reportCount = { $gt: 0 };
      if (rating) query.rating = Number(rating);

      const [reviews, total] = await Promise.all([
        MentorshipReview.find(query)
          .sort({ createdAt: -1 })
          .skip(PaginationHelper.getSkip(validPage, validLimit))
          .limit(validLimit)
          .lean(),
        MentorshipReview.countDocuments(query),
      ]);

      const enrichedReviews = await enrichReportedReviews(reviews);

      ResponseHandler.paginated(res, 'Reviews retrieved successfully', enrichedReviews, validPage, validLimit, total);
    } catch (error: any) {
      logger.error('Failed to fetch reviews:', error);
      next(error);
    }
  }

  /**
   * @route   POST /api/v1/mentorship/admin/reviews/:id/moderate
   * @access  Private (Admin)
   */
  async moderateReview(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!isAdmin(req)) {
        ResponseHandler.forbidden(res, 'Admin access required');
        return;
      }

      const { id } = req.params;
      const { action, reason } = req.body;

      if (!['keep', 'delete'].includes(action)) {
        ResponseHandler.badRequest(res, "Invalid moderation action. Use 'keep' or 'delete'");
        return;
      }

      const trimmedReason = typeof reason === 'string' ? reason.trim() : '';
      if (action === 'delete' && (trimmedReason.length < 5 || trimmedReason.length > 500)) {
        ResponseHandler.badRequest(res, 'Reason is required (5-500 characters) for delete action');
        return;
      }

      const existing = await MentorshipReview.findOne({ reviewId: id });
      if (!existing) {
        ResponseHandler.notFound(res, 'Review not found');
        return;
      }

      if (existing.isDeleted) {
        ResponseHandler.conflict(res, 'Review is already deleted');
        return;
      }

      const before = {
        isPublic: existing.isPublic,
        isDeleted: existing.isDeleted,
        reportCount: existing.reportCount,
      };

      const review = await mentorshipReviewService.moderateReview(
        id,
        action as 'keep' | 'delete',
        trimmedReason || undefined
      );

      const after = {
        isPublic: review.isPublic,
        isDeleted: review.isDeleted,
        reportCount: review.reportCount,
      };

      const actionTypeMap: Record<string, string> = {
        keep: 'review_approve',
        delete: 'review_delete',
      };
      const actionType = actionTypeMap[action];

      try {
        await (AdminAction as any).logAction(
          req.user?.userId || '',
          req.user?.email || '',
          actionType,
          'Review',
          id,
          {
            changes: { before, after },
            reason: trimmedReason || undefined,
            ipAddress: req.ip,
            userAgent: req.get('user-agent'),
          }
        );
      } catch (auditErr: any) {
        logger.error('Failed to log admin action for review moderation:', auditErr);
      }

      ResponseHandler.success(res, 'Review moderated successfully', review);
    } catch (error: any) {
      // Service throws this if the review was deleted between our pre-check and its own lookup.
      if (error?.message === 'Review not found') {
        ResponseHandler.notFound(res, 'Review not found');
        return;
      }
      logger.error('Failed to moderate review:', error);
      next(error);
    }
  }

  /**
   * @route   POST /api/v1/mentorship/admin/mentors/:id/status
   * @access  Private (Admin)
   */
  async updateMentorStatus(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!isAdmin(req)) {
        ResponseHandler.forbidden(res, 'Admin access required');
        return;
      }

      const { id } = req.params;
      const { status, reason } = req.body;

      const allowedStatuses = ['active', 'inactive', 'suspended'];
      if (!status || !allowedStatuses.includes(status)) {
        ResponseHandler.badRequest(
          res,
          `Invalid status. Allowed values: ${allowedStatuses.join(', ')}`
        );
        return;
      }

      if (status === 'suspended' || status === 'inactive') {
        const trimmedReason = typeof reason === 'string' ? reason.trim() : '';
        if (trimmedReason.length < 5 || trimmedReason.length > 500) {
          ResponseHandler.badRequest(res, 'Reason is required (5-500 characters)');
          return;
        }
      }

      const existingMentor = await mentorRepository.findByMentorId(id);
      if (!existingMentor) {
        ResponseHandler.notFound(res, 'Mentor not found');
        return;
      }

      const previousStatus = existingMentor.status;

      // Strict transition table:
      // pending_approval -> active     (mentor_approve)
      // pending_approval -> inactive   (mentor_reject)
      // active           -> suspended  (mentor_suspend)
      // suspended        -> active     (mentor_activate)
      let actionType: string | null = null;
      if (previousStatus === 'pending_approval' && status === 'active') {
        actionType = 'mentor_approve';
      } else if (previousStatus === 'pending_approval' && status === 'inactive') {
        actionType = 'mentor_reject';
      } else if (previousStatus === 'active' && status === 'suspended') {
        actionType = 'mentor_suspend';
      } else if (previousStatus === 'suspended' && status === 'active') {
        actionType = 'mentor_activate';
      }

      if (!actionType) {
        ResponseHandler.conflict(
          res,
          `Cannot change mentor from ${previousStatus} to ${status}`
        );
        return;
      }

      const mentor = await mentorRepository.updateByMentorId(id, { status });
      if (!mentor) {
        ResponseHandler.notFound(res, 'Mentor not found');
        return;
      }

      // Audit log (BUG-06)
      try {
        const adminUser = req.user;
        if (adminUser?.userId && adminUser?.email) {
          await (AdminAction as any).logAction(
            adminUser.userId,
            adminUser.email,
            actionType,
            'Mentor',
            id,
            {
              changes: {
                before: { status: previousStatus },
                after: { status },
              },
              reason: typeof reason === 'string' && reason.trim() ? reason.trim() : undefined,
              ipAddress: req.ip,
              userAgent: req.get('user-agent'),
            }
          );
        }
      } catch (logErr: unknown) {
        logger.error(
          'Failed to log admin action for mentor status change:',
          logErr instanceof Error ? logErr : { error: String(logErr) }
        );
      }

      ResponseHandler.success(res, 'Mentor status updated successfully', mentor);
    } catch (error: any) {
      logger.error('Failed to update mentor status:', error);
      next(error);
    }
  }

  /**
   * @route   GET /api/v1/mentorship/admin/dashboard
   * @access  Private (Admin)
   */
  async getDashboardStats(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!isAdmin(req)) {
        ResponseHandler.forbidden(res, 'Admin access required');
        return;
      }

      const [stats, reportedReviews, completedRevenue] = await Promise.all([
        mentorshipanalyticsService.getPlatformStats(),
        MentorshipReview.countDocuments({ reportCount: { $gt: 0 }, isDeleted: false }),
        mentorshipanalyticsService.getCompletedRevenue(),
      ]);

      const formattedStats = {
        totalMentors: stats?.mentors?.total ?? 0,
        activeMentors: stats?.mentors?.active ?? 0,
        pendingMentors: stats?.mentors?.pending ?? 0,
        totalSessions: stats?.sessions?.total ?? 0,
        totalRevenue: completedRevenue?.totalRevenue ?? 0,
        totalReviews: stats?.reviews?.total ?? 0,
        reportedReviews: reportedReviews ?? 0,
      };

      ResponseHandler.success(res, 'Dashboard statistics retrieved successfully', formattedStats);
    } catch (error: any) {
      logger.error('Failed to fetch dashboard stats:', error);
      next(error);
    }
  }

  /**
   * @route   GET /api/v1/mentorship/admin/reviews/reported
   * @access  Private (Admin)
   */
  async getReportedReviews(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!isAdmin(req)) {
        ResponseHandler.forbidden(res, 'Admin access required');
        return;
      }

      const { page = 1, limit = 20 } = req.query;
      const { page: validPage, limit: validLimit } = PaginationHelper.validateParams(
        Number(page),
        Number(limit)
      );

      const query = { reportCount: { $gt: 0 }, isDeleted: false };

      const [reviews, total] = await Promise.all([
        MentorshipReview.find(query)
          .sort({ reportCount: -1, createdAt: -1 })
          .skip(PaginationHelper.getSkip(validPage, validLimit))
          .limit(validLimit)
          .lean(),
        MentorshipReview.countDocuments(query),
      ]);

      const enrichedReviews = await enrichReportedReviews(reviews);

      ResponseHandler.paginated(res, 'Reported reviews retrieved successfully', enrichedReviews, validPage, validLimit, total);
    } catch (error: any) {
      logger.error('Failed to fetch reported reviews:', error);
      next(error);
    }
  }

  /**
   * @route   GET /api/v1/mentorship/admin/mentors/pending
   * @access  Private (Admin)
   */
  async getPendingMentors(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!isAdmin(req)) {
        ResponseHandler.forbidden(res, 'Admin access required');
        return;
      }

      const { page = 1, limit = 20 } = req.query;
      const { page: validPage, limit: validLimit } = PaginationHelper.validateParams(
        Number(page),
        Number(limit)
      );

      const query = { status: 'pending_approval', isDeleted: false };

      const [mentors, total] = await Promise.all([
        mentorRepository.findAll(
          query,
          { createdAt: -1 },
          PaginationHelper.getSkip(validPage, validLimit),
          validLimit
        ),
        mentorRepository.count(query),
      ]);

      const enrichedMentors = await enrichMentorsWithUser(mentors);

      ResponseHandler.paginated(res, 'Pending mentors retrieved successfully', enrichedMentors, validPage, validLimit, total);
    } catch (error: any) {
      logger.error('Failed to fetch pending mentors:', error);
      next(error);
    }
  }
  /**
   * @route   POST /api/v1/mentorship/admin/refunds/:bookingId/pay
   * @access  Private (Admin)
   */
  async payRefund(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!isAdmin(req)) {
        ResponseHandler.forbidden(res, 'Admin access required');
        return;
      }

      const { bookingId } = req.params;
      const session: any = await SessionMentor.findOne({ 'bookings._id': bookingId })
        .select('sessionId')
        .lean();
      if (!session) {
        ResponseHandler.notFound(res, 'Booking not found');
        return;
      }

      const result = await refundService.payMissedRefundViaPayout({
        sessionId: session.sessionId,
        bookingId,
      });

      ResponseHandler.success(res, 'Refund payout initiated', result);
    } catch (error: any) {
      logger.error('Failed to pay refund:', {
        message: error?.message,
        stack: error?.stack,
        gateway: error?.response?.data ?? error?.error,
      });
      if (error?.statusCode) {
        next(error);
        return;
      }
      res.status(500).json({
        success: false,
        message: error?.message || 'Refund payout failed',
        detail: error?.response?.data ?? error?.error ?? null,
      });
      return;
    }
  }

  /**
   * @route   GET /api/v1/mentorship/admin/payments
   * @access  Private (Admin)
   */
  async getPaymentLogs(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!isAdmin(req)) {
        ResponseHandler.forbidden(res, 'Admin access required');
        return;
      }

      const { page = 1, limit = 20, status } = req.query;
      const { page: validPage, limit: validLimit } = PaginationHelper.validateParams(
        Number(page),
        Number(limit)
      );

      const query: any = {};
      if (status) query['payment.status'] = status;

      const [sessions, total] = await Promise.all([
        SessionMentor.find(query)
          .select('mentorId menteeId sessionType pricing payment scheduledAt')
          .sort({ 'payment.paidAt': -1 })
          .skip(PaginationHelper.getSkip(validPage, validLimit))
          .limit(validLimit)
          .lean(),
        SessionMentor.countDocuments(query),
      ]);

      ResponseHandler.paginated(res, 'Payment logs retrieved successfully', sessions, validPage, validLimit, total);
    } catch (error: any) {
      logger.error('Failed to fetch payment logs:', error);
      next(error);
    }
  }
}

export default new AdminController();