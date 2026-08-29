/**
 * ====================================
 * MOTIVATION CONTROLLER
 * ====================================
 * Badge system and motivational features
 */

import { Request, Response } from 'express';
import { asyncHandler } from '@/shared/errors/app.error';
import ResponseUtil from '@/shared/response.util';
import { NotFoundError } from '@/shared/errors/app.error';
import { LoggerUtil } from '@/shared/logger.util';

// Models
import { User } from '@/auth/models';
import Badge from '../models/Badge.model';
import Ranking from '../models/Ranking.model';
import Streak from '../models/Streak.model';
import Task from '../models/Task.model';
import Goal from '../models/Goal.model';
import Answer from '../models/Answer.model';

// Types
import { IUserBadge } from '../interfaces/IBadge';
import { AuthRequest } from '@/shared/middlewares/auth.middleware';

/**
 * ========================================
 * BADGE MANAGEMENT
 * ========================================
 */

/**
 * Get all available badges
 * GET /api/motivation/badges
 */
export const getAllBadges = asyncHandler(async (_req: Request, res: Response) => {
  LoggerUtil.info('Fetching all available badges');

  const badges = await Badge.find({ isActive: true }).sort({ order: 1, tier: 1 });

  return ResponseUtil.success(res, { badges, total: badges.length }, 'Badges fetched successfully');
});


/**
 * Get badges by category
 * GET /api/motivation/badges/category/:category
 */
export const getBadgesByCategory = asyncHandler(async (req: Request, res: Response) => {
  const { category } = req.params;

  if (!category) {
    throw new NotFoundError('Category parameter is required');
  }

  LoggerUtil.info(`Fetching badges for category: ${category}`);

  const badges = await Badge.getBadgesByCategory(category);
 
  return ResponseUtil.success(
    res,
    { badges, total: badges.length },
    `${category} badges fetched successfully`
  );
});
/**
 * Get user's earned badges
 * GET /api/motivation/my-badges
 */
export const getUserBadges = asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as AuthRequest).user?.id;

  LoggerUtil.info(`Fetching badges for user: ${userId}`);

  const user = await User.findById(userId).select('badges');

  if (!user) {
    throw new NotFoundError('User not found');
  }

  // Populate badge details
  const populatedBadges = await Promise.all(
    (user.badges || []).map(async (userBadge: IUserBadge) => {
      const badge = await Badge.findById(userBadge.badge);
      return {
        badge,
        earnedAt: userBadge.earnedAt,
        progress: userBadge.progress,
        isCompleted: userBadge.isCompleted,
      };
    })
  );

  return ResponseUtil.success(
    res,
    { badges: populatedBadges, total: populatedBadges.length },
    'User badges fetched successfully'
  );
});

/**
 * Get badge progress for user
 * GET /api/motivation/badge-progress
 */
export const getBadgeProgress = asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as AuthRequest).user?.id;

  LoggerUtil.info(`Fetching badge progress for user: ${userId}`);

  const [user, ranking, streak, allBadges] = await Promise.all([
    User.findById(userId).select('badges'),
    Ranking.findOne({ userId }),
    Streak.findOne({ user: userId }),
    Badge.find({ isActive: true }),
  ]);

  if (!user) {
    throw new NotFoundError('User not found');
  }

  // Calculate current progress for each badge
  const badgeProgress = await Promise.all(
    allBadges.map(async (badge) => {
      const earned = user.badges?.some(
        (ub: any) => ub.badge.toString() === badge._id.toString() && ub.isCompleted
      );

      let currentProgress = 0;

      // Calculate progress based on badge category
      switch (badge.category) {
        case 'streak':
          currentProgress = streak?.currentStreak || 0;
          break;

        case 'hours':
          currentProgress = ranking?.totalStudyHours || 0;
          break;

        case 'task': {
          const completedTasks = await Task.countDocuments({
            assignedTo: userId,
            status: 'completed',
          });
          currentProgress = completedTasks;
          break;
        }

        case 'goal': {
          const completedGoals = await Goal.countDocuments({
            user: userId,
            status: 'completed',
          });
          currentProgress = completedGoals;
          break;
        }

        case 'doubt': {
          const answersCount = await Answer.countDocuments({
            author: userId,
          });
          currentProgress = answersCount;
          break;
        }

        default:
          currentProgress = 0;
      }

      const progressPercentage = Math.min(
        100,
        Math.round((currentProgress / badge.requirement) * 100)
      );

      return {
        badge: {
          id: badge._id,
          name: badge.name,
          description: badge.description,
          icon: badge.icon,
          tier: badge.tier,
          category: badge.category,
          requirement: badge.requirement,
          requirementType: badge.requirementType,
          points: badge.points,
        },
        currentProgress,
        requiredProgress: badge.requirement,
        progressPercentage,
        isEarned: earned,
      };
    })
  );

  // Sort: Not earned first, then by progress
  const sortedProgress = badgeProgress.sort((a, b) => {
    if (a.isEarned === b.isEarned) {
      return b.progressPercentage - a.progressPercentage;
    }
    return a.isEarned ? 1 : -1;
  });

  return ResponseUtil.success(res, { progress: sortedProgress }, 'Badge progress fetched successfully');
});

/**
 * Check and award badges to user
 * POST /api/motivation/check-badges
 */
export const checkAndAwardBadges = asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as AuthRequest).user?.id;

  LoggerUtil.info(`Checking badges for user: ${userId}`);

  const newBadges = await checkUserBadges(userId);

  if (newBadges.length === 0) {
    return ResponseUtil.success(res, { newBadges: [] }, 'No new badges earned');
  }

  return ResponseUtil.success(
    res,
    { newBadges, count: newBadges.length },
    `Congratulations! You earned ${newBadges.length} new badge(s)!`
  );
});

/**
 * ========================================
 * MOTIVATIONAL FEATURES
 * ========================================
 */

/**
 * Get motivational quote
 * GET /api/motivation/quote
 */
export const getMotivationalQuote = asyncHandler(async (_req: Request, res: Response) => {
  const quotes = [
    {
      text: 'Success is the sum of small efforts repeated day in and day out.',
      author: 'Robert Collier',
    },
    {
      text: 'The expert in anything was once a beginner.',
      author: 'Helen Hayes',
    },
    {
      text: 'Education is the most powerful weapon which you can use to change the world.',
      author: 'Nelson Mandela',
    },
    {
      text: 'The beautiful thing about learning is that no one can take it away from you.',
      author: 'B.B. King',
    },
    {
      text: 'Study hard what interests you the most in the most undisciplined, irreverent and original manner possible.',
      author: 'Richard Feynman',
    },
    {
      text: 'The capacity to learn is a gift; the ability to learn is a skill; the willingness to learn is a choice.',
      author: 'Brian Herbert',
    },
    {
      text: 'Live as if you were to die tomorrow. Learn as if you were to live forever.',
      author: 'Mahatma Gandhi',
    },
    {
      text: 'An investment in knowledge pays the best interest.',
      author: 'Benjamin Franklin',
    },
    {
      text: 'The more that you read, the more things you will know. The more that you learn, the more places you\'ll go.',
      author: 'Dr. Seuss',
    },
    {
      text: 'Learning never exhausts the mind.',
      author: 'Leonardo da Vinci',
    },
  ];

  const randomQuote = quotes[Math.floor(Math.random() * quotes.length)];

  return ResponseUtil.success(res, randomQuote, 'Motivational quote fetched');
});

/**
 * Get user achievements summary
 * GET /api/motivation/achievements
 */
export const getAchievementsSummary = asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as AuthRequest).user?.id;

  LoggerUtil.info(`Fetching achievements for user: ${userId}`);

  const [user, ranking, streak, badges] = await Promise.all([
    User.findById(userId).select('badges'),
    Ranking.findOne({ userId }),
    Streak.findOne({ user: userId }),
    Badge.countDocuments({ isActive: true }),
  ]);

  if (!user) {
    throw new NotFoundError('User not found');
  }

  const earnedBadges = user.badges?.filter((b: IUserBadge) => b.isCompleted) || [];
  
  // Calculate total points from earned badges
  const totalPoints = earnedBadges.reduce((sum: number, _ub: any) => {
    // Points would need to be fetched from Badge model
    // For now, return accumulated sum
    return sum;
  }, 0);

  const milestones = {
    firstStudySession: ranking?.totalStudyHours ? ranking.totalStudyHours > 0 : false,
    firstWeekStreak: (streak?.longestStreak || 0) >= 7,
    first30DayStreak: (streak?.longestStreak || 0) >= 30,
    first100Hours: (ranking?.totalStudyHours || 0) >= 100,
    topRanker: (ranking?.globalRank || 0) <= 10,
  };

  const summary = {
    badgesEarned: earnedBadges.length,
    totalBadges: badges,
    completionPercentage: badges > 0 ? Math.round((earnedBadges.length / badges) * 100) : 0,
    totalPoints,
    milestones,
    currentStreak: streak?.currentStreak || 0,
    longestStreak: streak?.longestStreak || 0,
    globalRank: ranking?.globalRank || 0,
    totalStudyHours: ranking?.totalStudyHours || 0,
  };

  return ResponseUtil.success(res, summary, 'Achievements summary fetched successfully');
});

/**
 * ========================================
 * HELPER FUNCTIONS
 * ========================================
 */

/**
 * Check and award badges to user (internal function)
 */
async function checkUserBadges(userId: string): Promise<any[]> {
  try {
    const [user, ranking, streak, allBadges] = await Promise.all([
      User.findById(userId).select('badges'),
      Ranking.findOne({ userId }),
      Streak.findOne({ user: userId }),
      Badge.find({ isActive: true }),
    ]);

    if (!user) throw new Error('User not found');

    const newlyEarnedBadges: any[] = [];

    for (const badge of allBadges) {
      // Check if already earned
      const alreadyEarned = user.badges?.some(
        (ub: any) => ub.badge.toString() === badge._id.toString() && ub.isCompleted
      );

      if (alreadyEarned) continue;

      // Check if user qualifies for this badge
      let qualifies = false;
      let currentProgress = 0;

      switch (badge.category) {
        case 'streak':
          currentProgress = streak?.currentStreak || 0;
          qualifies = currentProgress >= badge.requirement;
          break;

        case 'hours':
          currentProgress = ranking?.totalStudyHours || 0;
          qualifies = currentProgress >= badge.requirement;
          break;

        case 'task': {
          const completedTasks = await Task.countDocuments({
            assignedTo: userId,
            status: 'completed',
          });
          currentProgress = completedTasks;
          qualifies = completedTasks >= badge.requirement;
          break;
        }

        case 'goal': {
          const completedGoals = await Goal.countDocuments({
            user: userId,
            status: 'completed',
          });
          currentProgress = completedGoals;
          qualifies = completedGoals >= badge.requirement;
          break;
        }

        case 'doubt': {
          const answersCount = await Answer.countDocuments({
            author: userId,
          });
          currentProgress = answersCount;
          qualifies = answersCount >= badge.requirement;
          break;
        }
      }

      if (qualifies) {
        // Award badge to user
        const userBadge: IUserBadge = {
          badge: badge._id,
          earnedAt: new Date(),
          progress: currentProgress,
          isCompleted: true,
        };

        user.badges = user.badges || [];
        user.badges.push(userBadge);

        newlyEarnedBadges.push({
          badge,
          earnedAt: userBadge.earnedAt,
        });

        LoggerUtil.info(`Badge awarded: ${badge.name} to user: ${userId}`);
      }
    }

    // Save user if new badges were earned
    if (newlyEarnedBadges.length > 0) {
      await user.save();
    }

    return newlyEarnedBadges;
  } catch (error: any) {
    LoggerUtil.error(`Error checking badges for user ${userId}:`, error.message);
    throw error;
  }
}

/**
 * Export all controllers
 */
export default {
  getAllBadges,
  getBadgesByCategory,
  getUserBadges,
  getBadgeProgress,
  checkAndAwardBadges,
  getMotivationalQuote,
  getAchievementsSummary,
};