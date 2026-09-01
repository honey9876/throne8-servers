// services/goal.service.ts

import goalRepository from '../repositories/goal.repository';
import { NotFoundError, BadRequestError, ForbiddenError } from '@/shared/errors/app.error';
import { CreateGoalDTO, UpdateGoalDTO, UpdateGoalProgressDTO } from '../types/goal.types';
import { LoggerUtil } from '@/shared/logger.util';
import { generateSecureId } from '@/shared/security';

class GoalService {

  async createGoal(userId: string, goalData: CreateGoalDTO): Promise<any> {
    const goal = await goalRepository.create({
      goalId: generateSecureId(),
      user: userId,
      ...goalData,
    });
    LoggerUtil.info(`Goal created: ${goal.goalId} for user for change ${userId}`);
    return goal;
  }

  async getAllGoals(userId: string, query: any): Promise<any> {
    const {
      completed, startDate, endDate, category, tags, search,
      page = 1, limit = 10,
      sortBy = 'createdAt', sortOrder = 'desc',
    } = query;

    const filter: any = { user: userId };

    if (completed !== undefined) filter.completed = completed === 'true' || completed === true;
    if (category) filter.category = category;

    if (startDate || endDate) {
      filter.startDate = {};
      if (startDate) filter.startDate.$gte = new Date(startDate);
      if (endDate) filter.startDate.$lte = new Date(endDate);
    }

    if (tags) {
      const tagArray = Array.isArray(tags) ? tags : [tags];
      filter.tags = { $in: tagArray };
    }

    if (search) {
      filter.$or = [
        { title: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } },
      ];
    }

    const pageNum = parseInt(page, 10);
    const limitNum = Math.min(parseInt(limit, 10), 100);
    const skip = (pageNum - 1) * limitNum;
    const sort = { [sortBy]: sortOrder === 'asc' ? 1 : -1 };

    const [goals, total] = await Promise.all([
      goalRepository.findWithPagination(filter, sort, skip, limitNum),
      goalRepository.count(filter),
    ]);

    const totalPages = Math.ceil(total / limitNum);

    return {
      page: pageNum,
      limit: limitNum,
      total,
      totalPages,
      hasNextPage: pageNum < totalPages,
      hasPrevPage: pageNum > 1,
      data: goals,
    };
  }

  async getGoalById(goalId: string, userId: string): Promise<any> {
    const goal = await goalRepository.findByGoalId(goalId);
    if (!goal) throw new NotFoundError('Goal not found');
    if (goal.user !== userId) throw new ForbiddenError('Not authorized');
    return goal;
  }

  async updateGoal(goalId: string, userId: string, updateData: UpdateGoalDTO): Promise<any> {
    if (Object.keys(updateData).length === 0) {
      throw new BadRequestError('No update data provided');
    }
    const goal = await goalRepository.updateByGoalId(goalId, userId, updateData);
    if (!goal) throw new NotFoundError('Goal not found');
    LoggerUtil.info(`Goal updated: ${goalId}`);
    return goal;
  }

  async deleteGoal(goalId: string, userId: string): Promise<void> {
    const deleted = await goalRepository.deleteByGoalId(goalId, userId);
    if (!deleted) throw new NotFoundError('Goal not found');
    LoggerUtil.info(`Goal deleted: ${goalId}`);
  }

  async updateGoalProgress(goalId: string, userId: string, hoursToAdd: number): Promise<any> {
    const goal = await goalRepository.updateProgressByGoalId(goalId, userId, hoursToAdd);
    if (!goal) throw new NotFoundError('Goal not found');
    LoggerUtil.info(`Goal progress updated: ${goalId} by ${hoursToAdd} hours`);
    return goal;
  }

  async markGoalComplete(goalId: string, userId: string): Promise<any> {
    const existing = await goalRepository.findByGoalId(goalId);
    if (!existing) throw new NotFoundError('Goal not found');
    if (existing.user !== userId) throw new ForbiddenError('Not authorized');
    if (existing.completed) throw new BadRequestError('Goal is already completed');

    const goal = await goalRepository.markAsCompleteByGoalId(goalId, userId);
    LoggerUtil.info(`Goal marked complete: ${goalId}`);
    return goal;
  }

  async markGoalIncomplete(goalId: string, userId: string): Promise<any> {
    const existing = await goalRepository.findByGoalId(goalId);
    if (!existing) throw new NotFoundError('Goal not found');
    if (existing.user !== userId) throw new ForbiddenError('Not authorized');
    if (!existing.completed) throw new BadRequestError('Goal is already incomplete');

    const goal = await goalRepository.markAsIncompleteByGoalId(goalId, userId);
    LoggerUtil.info(`Goal marked incomplete: ${goalId}`);
    return goal;
  }

  async getActiveGoals(userId: string): Promise<any[]> {
    return await goalRepository.findActiveGoals(userId);
  }

  async getUpcomingGoals(userId: string): Promise<any[]> {
    return await goalRepository.findUpcomingGoals(userId);
  }

  async getGoalStats(userId: string): Promise<any> {
    return await goalRepository.getGoalStats(userId);
  }
}

export default new GoalService();