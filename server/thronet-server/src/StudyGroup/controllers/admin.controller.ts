/**
 * ====================================
 * ADMIN CONTROLLER
 * ====================================
 * Admin panel for managing 100k+ users
 * Features: User management, Content moderation, Analytics
 */

import { Request, Response } from 'express';
import ResponseUtil from '@/shared/response.util';
import { LoggerUtil } from '@/shared/logger.util';
import { NotFoundError, BadRequestError, ForbiddenError, asyncHandler } from '@/shared/errors/app.error';
import { PAGINATION_CONSTANTS } from '../utils/constants';
import { groupMemberRepository, groupRepository, rankingRepository, studySessionRepository, userRepository } from '../repositories';
import { messageRepository } from '../repositories';
import doubtRepository, { DoubtRepository } from '../repositories/doubt.repository';
import fileRepository from '../repositories/file.repository';


/**
 * Check if user is admin
 */
const checkAdminRole = (req: Request) => {
  const userRole = (req as any).userRole;
  if (userRole !== 'admin') {
    throw new ForbiddenError('Access denied. Admin only.');
  }
};

/**
 * Get admin dashboard overview
 * GET /api/admin/dashboard
 */
export const getAdminDashboard = asyncHandler(
  async (req: Request, res: Response) => {
    checkAdminRole(req);

    LoggerUtil.info('Fetching admin dashboard');

    // Get today's date range
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    // Fetch all statistics in parallel
    const [
      totalUsers,
      activeUsersToday,
      newUsersToday,
      totalGroups,
      activeGroups,
      newGroupsToday,
      totalMessages,
      messagesToday,
      totalDoubts,
      doubtsToday,
      totalFiles,
      filesToday,
      totalStudyHours,
      studyHoursToday,
      pendingReports,
      topUsers,
      topGroups,
    ] = await Promise.all([
      // User stats
      // User.countDocuments({ isActive: true }),
      // User.countDocuments({
      //   isActive: true,
      //   lastActive: { $gte: today },
      // }),
      // User.countDocuments({
      //   createdAt: { $gte: today, $lt: tomorrow },
      // }),

      // // Group stats
      // Group.countDocuments({ isActive: true }),
      // Group.countDocuments({
      //   isActive: true,
      //   updatedAt: { $gte: today },
      // }),
      // Group.countDocuments({
      //   createdAt: { $gte: today, $lt: tomorrow },
      // }),

      // // Message stats
      // Message.countDocuments({ isDeleted: false }),
      // Message.countDocuments({
      //   isDeleted: false,
      //   createdAt: { $gte: today, $lt: tomorrow },
      // }),

      // // Doubt stats
      // Doubt.countDocuments({ isDeleted: false }),
      // Doubt.countDocuments({
      //   isDeleted: false,
      //   createdAt: { $gte: today, $lt: tomorrow },
      // }),

      // // File stats
      // File.countDocuments({ isDeleted: false }),
      // File.countDocuments({
      //   isDeleted: false,
      //   createdAt: { $gte: today, $lt: tomorrow },
      // }),

      // // Study hours stats
      // StudySession.aggregate([
      //   { $match: { status: 'completed' } },
      //   { $group: { _id: null, totalHours: { $sum: '$duration' } } },
      // ]),
      // StudySession.aggregate([
      //   {
      //     $match: {
      //       status: 'completed',
      //       createdAt: { $gte: today, $lt: tomorrow },
      //     },
      //   },
      //   { $group: { _id: null, totalHours: { $sum: '$duration' } } },
      // ]),

      // // Pending reports
      // Group.aggregate([
      //   {
      //     $project: {
      //       pendingUserReports: {
      //         $size: {
      //           $filter: {
      //             input: '$reports',
      //             cond: { $eq: ['$$this.status', 'pending'] },
      //           },
      //         },
      //       },
      //       pendingMessageReports: {
      //         $size: {
      //           $filter: {
      //             input: '$messageReports',
      //             cond: { $eq: ['$$this.status', 'pending'] },
      //           },
      //         },
      //       },
      //     },
      //   },
      //   {
      //     $group: {
      //       _id: null,
      //       totalPending: {
      //         $sum: {
      //           $add: ['$pendingUserReports', '$pendingMessageReports'],
      //         },
      //       },
      //     },
      //   },
      // ]),

      // // Top 10 users by rank
      // Ranking.find({ globalRank: { $gt: 0 } })
      //   .sort({ globalRank: 1 })
      //   .limit(10)
      //   .populate('userId', 'name email avatar'),

      // // Top 10 groups by member count
      // Group.find({ isActive: true })
      //   .sort({ currentMemberCount: -1 })
      //   .limit(10)
      //   .select('title avatar category currentMemberCount'),

      userRepository.count({ isActive: true }),
      userRepository.count({ isActive: true, lastActive: { $gte: today } }),
      userRepository.count({ createdAt: { $gte: today, $lt: tomorrow } }),
      groupRepository.count({ isActive: true }),
      groupRepository.count({ isActive: true, updatedAt: { $gte: today } }),
      groupRepository.count({ createdAt: { $gte: today, $lt: tomorrow } }),
      messageRepository.countMessages({ isDeleted: false }),
      messageRepository.countMessages({ isDeleted: false, createdAt: { $gte: today, $lt: tomorrow } }),
      doubtRepository.count({ isDeleted: false }),
      doubtRepository.count({ isDeleted: false, createdAt: { $gte: today, $lt: tomorrow } }),
      fileRepository.count({ isDeleted: false }),
      fileRepository.count({ isDeleted: false, createdAt: { $gte: today, $lt: tomorrow } }),
      studySessionRepository.getTotalHoursAll(),
      studySessionRepository.getTodayHoursAll(today, tomorrow),
      groupRepository.getPendingReportsCount(),
      rankingRepository.getGlobalLeaderboard(0, 10),
      groupRepository.getTopGroups(10),


    ]);

    // const totalStudyHoursConverted = totalStudyHours[0]?.totalHours
    //   ? parseFloat((totalStudyHours[0].totalHours / 3600).toFixed(2))
    //   : 0;

    // const studyHoursTodayConverted = studyHoursToday[0]?.totalHours
    //   ? parseFloat((studyHoursToday[0].totalHours / 3600).toFixed(2))
    //   : 0;

    const totalStudyHoursConverted = totalStudyHours
      ? parseFloat((totalStudyHours / 3600).toFixed(2))
      : 0;

    const studyHoursTodayConverted = studyHoursToday
      ? parseFloat((studyHoursToday / 3600).toFixed(2))
      : 0;

    const dashboard = {
      overview: {
        totalUsers,
        activeUsersToday,
        newUsersToday,
        totalGroups,
        activeGroups,
        newGroupsToday,
        totalMessages,
        messagesToday,
        totalDoubts,
        doubtsToday,
        totalFiles,
        filesToday,
        totalStudyHours: totalStudyHoursConverted,
        studyHoursToday: studyHoursTodayConverted,
      },

      moderation: {
        // pendingReports: pendingReports[0]?.totalPending || 0,
        pendingReports: pendingReports || 0,
      },

      topUsers: topUsers.map((rank: any) => ({
        id: rank.userId.userId,
        name: rank.userId.name,
        email: rank.userId.email,
        avatar: rank.userId.avatar,
        rank: rank.globalRank,
        rankScore: rank.rankScore,
        studyHours: rank.totalStudyHours,
      })),

      topGroups: topGroups.map((group: any) => ({
        id: group.groupId,
        title: group.title,
        avatar: group.avatar,
        category: group.category,
        memberCount: group.currentMemberCount,
      })),
    };

    LoggerUtil.info('Admin dashboard fetched successfully');

    return ResponseUtil.success(
      res,
      dashboard,
      'Admin dashboard data fetched successfully'
    );
  }
);

/**
 * Get all users with pagination and filters
 * GET /api/admin/users
 */
export const getAllUsers = asyncHandler(
  async (req: Request, res: Response) => {
    checkAdminRole(req);

    const {
      page = PAGINATION_CONSTANTS.DEFAULT_PAGE,
      limit = PAGINATION_CONSTANTS.DEFAULT_LIMIT,
      search = '',
      role = '',
      isActive = '',
      sort = '-createdAt',
    } = req.query;

    const pageNum = parseInt(page as string);
    const limitNum = Math.min(
      parseInt(limit as string),
      PAGINATION_CONSTANTS.MAX_LIMIT
    );
    const skip = (pageNum - 1) * limitNum;

    // Build query
    const query: any = {};

    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
      ];
    }

    if (role) {
      query.role = role;
    }

    if (isActive) {
      query.isActive = isActive === 'true';
    }

    LoggerUtil.info('Fetching all users', { query, page, limit });

    const [users, total] = await Promise.all([
      // User.find(query)
      //   .select('-password')
      //   .sort(sort as string)
      //   .skip(skip)
      //   .limit(limitNum),
      // User.countDocuments(query),
      userRepository.findWithPagination(query, sort as string, skip, limitNum),
      userRepository.count(query),
    ]);

    const totalPages = Math.ceil(total / limitNum);

    return ResponseUtil.success(
      res,
      {
        users,
        pagination: {
          page: pageNum,
          limit: limitNum,
          total,
          totalPages,
          hasNextPage: pageNum < totalPages,
          hasPrevPage: pageNum > 1,
        },
      },
      'Users fetched successfully'
    );
  }
);

/**
 * Get user details by ID
 * GET /api/admin/users/:userId
 */
export const getUserDetails = asyncHandler(
  async (req: Request, res: Response) => {
    checkAdminRole(req);

    const { userId } = req.params;

    if (!userId) {
      throw new BadRequestError('User ID is required');
    }

    LoggerUtil.info('Fetching user details', { userId });

    const [user, ranking, groups, doubtsPosted, sessionsCount] = await Promise.all([
      // User.findById(userId).select('-password'),
      // Ranking.findOne({ userId }),
      // GroupMember.find({ user: userId, status: 'active' })
      //   .populate('group', 'title avatar category')
      //   .limit(10),
      // Doubt.countDocuments({ postedBy: userId, isDeleted: false }),
      // StudySession.countDocuments({ user: userId, status: 'completed' }),
      userRepository.findByUserId(userId),
      rankingRepository.findByUserId(userId),
      groupMemberRepository.findByUserId(userId),
      doubtRepository.count({ postedBy: userId, isDeleted: false }),
      studySessionRepository.count({ user: userId, status: 'completed' }),
    ]);

    if (!user) {
      throw new NotFoundError('User not found');
    }

    const userDetails = {
      user,
      ranking: {
        globalRank: ranking?.globalRank || 0,
        rankScore: ranking?.rankScore || 0,
        totalStudyHours: ranking?.totalStudyHours || 0,
        currentStreak: ranking?.currentStreak || 0,
      },
      activity: {
        groupsJoined: groups.length,
        doubtsPosted,
        sessionsCompleted: sessionsCount,
      },
      groups: groups.map((membership: any) => ({
        // id: membership.group._id,
        groupId: membership.group.groupId,
        title: membership.group.title,
        // avatar: membership.group.avatar,
        // category: membership.group.category,
        role: membership.role,
      })),
    };

    LoggerUtil.info('User details fetched successfully', { userId });

    return ResponseUtil.success(
      res,
      userDetails,
      'User details fetched successfully'
    );
  }
);

/**
 * Update user status (activate/deactivate)
 * PATCH /api/admin/users/:userId/status
 */
export const updateUserStatus = asyncHandler(
  async (req: Request, res: Response) => {
    checkAdminRole(req);

    const { userId } = req.params;
    const { isActive } = req.body;

    if (!userId) {
      throw new BadRequestError('User ID is required');
    }

    if (typeof isActive !== 'boolean') {
      throw new BadRequestError('isActive must be a boolean');
    }

    LoggerUtil.info('Updating user status', { userId, isActive });

    // const user = await User.findByIdAndUpdate(
    //   userId,
    //   { isActive },
    //   { new: true, select: '-password' }
    // );
    const user = await userRepository.updateByUserId(userId, { isActive });

    if (!user) {
      throw new NotFoundError('User not found');
    }

    LoggerUtil.info('User status updated', { userId, isActive });

    return ResponseUtil.success(
      res,
      user,
      `User ${isActive ? 'activated' : 'deactivated'} successfully`
    );
  }
);

/**
 * Delete user account (soft delete)
 * DELETE /api/admin/users/:userId
 */
export const deleteUser = asyncHandler(
  async (req: Request, res: Response) => {
    checkAdminRole(req);

    const { userId } = req.params;

    if (!userId) {
      throw new BadRequestError('User ID is required');
    }

    LoggerUtil.info('Deleting user', { userId });

    // const user = await User.findByIdAndUpdate(
    //   userId,
    //   { isActive: false },
    //   { new: true }
    // );
    const user = await userRepository.updateByUserId(userId, { isActive: false });

    if (!user) {
      throw new NotFoundError('User not found');
    }

    // Remove from all groups
    // await GroupMember.deleteMany({ user: userId });
    await groupMemberRepository.updateMany({ userId }, { status: 'inactive' });

    LoggerUtil.info('User deleted successfully', { userId });

    return ResponseUtil.success(
      res,
      null,
      'User deleted successfully'
    );
  }
);

/**
 * Get all groups with pagination and filters
 * GET /api/admin/groups
 */
export const getAllGroups = asyncHandler(
  async (req: Request, res: Response) => {
    checkAdminRole(req);

    const {
      page = PAGINATION_CONSTANTS.DEFAULT_PAGE,
      limit = PAGINATION_CONSTANTS.DEFAULT_LIMIT,
      search = '',
      category = '',
      isActive = '',
      sort = '-createdAt',
    } = req.query;

    const pageNum = parseInt(page as string);
    const limitNum = Math.min(
      parseInt(limit as string),
      PAGINATION_CONSTANTS.MAX_LIMIT
    );
    const skip = (pageNum - 1) * limitNum;

    // Build query
    const query: any = {};

    if (search) {
      query.$or = [
        { title: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } },
      ];
    }

    if (category) {
      query.category = category;
    }

    if (isActive) {
      query.isActive = isActive === 'true';
    }

    LoggerUtil.info('Fetching all groups', { query, page, limit });

    const [groups, total] = await Promise.all([
      // Group.find(query)
      //   .populate('leader', 'name email avatar')
      //   .sort(sort as string)
      //   .skip(skip)
      //   .limit(limitNum),
      // Group.countDocuments(query),
      groupRepository.findAll(query, sort as string, skip, limitNum),
      groupRepository.count(query),
    ]);

    const totalPages = Math.ceil(total / limitNum);

    return ResponseUtil.success(
      res,
      {
        groups,
        pagination: {
          page: pageNum,
          limit: limitNum,
          total,
          totalPages,
          hasNextPage: pageNum < totalPages,
          hasPrevPage: pageNum > 1,
        },
      },
      'Groups fetched successfully'
    );
  }
);

/**
 * Get pending reports
 * GET /api/admin/reports
 */
export const getPendingReports = asyncHandler(
  async (req: Request, res: Response) => {
    checkAdminRole(req);

    const {
      page = PAGINATION_CONSTANTS.DEFAULT_PAGE,
      limit = PAGINATION_CONSTANTS.DEFAULT_LIMIT,
      type = 'all', // 'user' | 'message' | 'all'
    } = req.query;

    const pageNum = parseInt(page as string);
    const limitNum = Math.min(
      parseInt(limit as string),
      PAGINATION_CONSTANTS.MAX_LIMIT
    );

    LoggerUtil.info('Fetching pending reports', { type, page, limit });

    // Aggregate all pending reports
    // const groups = await Group.find({
    //   $or: [
    //     { 'reports.status': 'pending' },
    //     { 'messageReports.status': 'pending' },
    //   ],
    // })
    //   .populate('reports.reporter', 'name email avatar')
    //   .populate('reports.reportedUser', 'name email avatar')
    //   .populate('messageReports.reporter', 'name email avatar')
    //   .populate('messageReports.messageSender', 'name email avatar');

    const groups = await groupRepository.getGroupsWithPendingReports();

    // Extract and flatten all pending reports
    const allReports: any[] = [];

    groups.forEach((group) => {
      // User reports
      if (type === 'all' || type === 'user') {
        group.reports?.forEach((report: any) => {
          if (report.status === 'pending') {
            allReports.push({
              type: 'user',
              groupId: group.groupId,
              groupTitle: group.title,
              ...report.toObject(),
            });
          }
        });
      }

      // Message reports
      if (type === 'all' || type === 'message') {
        group.messageReports?.forEach((report: any) => {
          if (report.status === 'pending') {
            allReports.push({
              type: 'message',
              groupId: group.groupId,
              groupTitle: group.title,
              ...report.toObject(),
            });
          }
        });
      }
    });

    // Sort by most recent
    allReports.sort((a, b) => {
      return new Date(b.reportedAt).getTime() - new Date(a.reportedAt).getTime();
    });

    // Paginate
    const skip = (pageNum - 1) * limitNum;
    const paginatedReports = allReports.slice(skip, skip + limitNum);
    const total = allReports.length;
    const totalPages = Math.ceil(total / limitNum);

    return ResponseUtil.success(
      res,
      {
        reports: paginatedReports,
        pagination: {
          page: pageNum,
          limit: limitNum,
          total,
          totalPages,
          hasNextPage: pageNum < totalPages,
          hasPrevPage: pageNum > 1,
        },
      },
      'Pending reports fetched successfully'
    );
  }
);

/**
 * Resolve report
 * PATCH /api/admin/reports/:groupId/:reportId/resolve
 */
export const resolveReport = asyncHandler(
  async (req: Request, res: Response) => {
    checkAdminRole(req);

    const { groupId, reportId } = req.params;
    const { type, action } = req.body; // type: 'user' | 'message', action: 'resolved' | 'dismissed'
    const adminId = (req as any).userId;

    if (!groupId || !reportId) {
      throw new BadRequestError('Group ID and Report ID are required');
    }

    if (!type || !action) {
      throw new BadRequestError('Type and action are required');
    }

    LoggerUtil.info('Resolving report', { groupId, reportId, type, action });

    // const group = await Group.findById(groupId);
    const group = await groupRepository.findRawByGroupId(groupId);

    if (!group) {
      throw new NotFoundError('Group not found');
    }

    // Update report status
    if (type === 'user') {
      const report = group.reports?.find((r: any) => r._id.toString() === reportId);
      if (report) {
        report.status = action;
        report.resolvedAt = new Date();
        report.resolvedBy = adminId;
      }
    } else if (type === 'message') {
      const report = group.messageReports?.find((r: any) => r._id.toString() === reportId);
      if (report) {
        report.status = action;
        report.resolvedAt = new Date();
        report.resolvedBy = adminId;
      }
    }

    await group.save();

    LoggerUtil.info('Report resolved', { groupId, reportId, action });

    return ResponseUtil.success(
      res,
      null,
      `Report ${action} successfully`
    );
  }
);

/**
 * Get system analytics
 * GET /api/admin/analytics
 */
export const getSystemAnalytics = asyncHandler(
  async (req: Request, res: Response) => {
    checkAdminRole(req);

    const { period = '30days' } = req.query;

    LoggerUtil.info('Fetching system analytics', { period });

    // Calculate date range
    const now = new Date();
    let startDate = new Date();

    switch (period) {
      case '7days':
        startDate.setDate(now.getDate() - 7);
        break;
      case '30days':
        startDate.setDate(now.getDate() - 30);
        break;
      case '90days':
        startDate.setDate(now.getDate() - 90);
        break;
      default:
        startDate.setDate(now.getDate() - 30);
    }

    // Get growth analytics
    const [userGrowth, groupGrowth, messageGrowth, activityGrowth] = await Promise.all([
      // User growth
      userRepository.getDailyGrowth(startDate, now),
      groupRepository.getDailyGrowth(startDate, now),
      messageRepository.getDailyGrowth(startDate, now),
      studySessionRepository.getDailyActivityGrowth(startDate, now),

      // User.aggregate([
      //   {
      //     $match: {
      //       createdAt: { $gte: startDate, $lte: now },
      //     },
      //   },
      //   {
      //     $group: {
      //       _id: {
      //         $dateToString: { format: '%Y-%m-%d', date: '$createdAt' },
      //       },
      //       count: { $sum: 1 },
      //     },
      //   },
      //   { $sort: { _id: 1 } },
      // ]),

      // Group growth
      // Group.aggregate([
      //   {
      //     $match: {
      //       createdAt: { $gte: startDate, $lte: now },
      //     },
      //   },
      //   {
      //     $group: {
      //       _id: {
      //         $dateToString: { format: '%Y-%m-%d', date: '$createdAt' },
      //       },
      //       count: { $sum: 1 },
      //     },
      //   },
      //   { $sort: { _id: 1 } },
      // ]),

      // Message growth
      // Message.aggregate([
      //   {
      //     $match: {
      //       createdAt: { $gte: startDate, $lte: now },
      //       isDeleted: false,
      //     },
      //   },
      //   {
      //     $group: {
      //       _id: {
      //         $dateToString: { format: '%Y-%m-%d', date: '$createdAt' },
      //       },
      //       count: { $sum: 1 },
      //     },
      //   },
      //   { $sort: { _id: 1 } },
      // ]),

      // Study activity growth
      // StudySession.aggregate([
      //   {
      //     $match: {
      //       createdAt: { $gte: startDate, $lte: now },
      //       status: 'completed',
      //     },
      //   },
      //   {
      //     $group: {
      //       _id: {
      //         $dateToString: { format: '%Y-%m-%d', date: '$createdAt' },
      //       },
      //       sessions: { $sum: 1 },
      //       totalHours: { $sum: '$duration' },
      //     },
      //   },
      //   { $sort: { _id: 1 } },
      // ]),
    ]);

    const analytics = {
      period,
      growth: {
        users: userGrowth.map((item) => ({
          date: item._id,
          count: item.count,
        })),
        groups: groupGrowth.map((item) => ({
          date: item._id,
          count: item.count,
        })),
        messages: messageGrowth.map((item) => ({
          date: item._id,
          count: item.count,
        })),
        studyActivity: activityGrowth.map((item) => ({
          date: item._id,
          sessions: item.sessions,
          hours: parseFloat((item.totalHours / 3600).toFixed(2)),
        })),
      },
    };

    LoggerUtil.info('System analytics fetched successfully', { period });

    return ResponseUtil.success(
      res,
      analytics,
      'System analytics fetched successfully'
    );
  }
);

export default {
  getAdminDashboard,
  getAllUsers,
  getUserDetails,
  updateUserStatus,
  deleteUser,
  getAllGroups,
  getPendingReports,
  resolveReport,
  getSystemAnalytics,
};